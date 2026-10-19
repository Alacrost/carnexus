import {createClient} from '@supabase/supabase-js';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

// MANUAL REMOTE TEST. Never add this script to npm test or run against production.
// node tests/hosted-staging-smoke.mjs --project-ref=inxplclbpofmqufdcskd --allow-test-writes
// Leaves clearly labelled QA tenants, records and a private PNG. No email is sent,
// no commercial/audit records are deleted, and no Auth/RLS settings are changed.
const TARGET='inxplclbpofmqufdcskd';
const ORIGIN=`https://${TARGET}.supabase.co`;
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const KEYS=join(ROOT,'.env.autonexus-test.keys.json');
const CHECKPOINT=join(ROOT,'.env.autonexus-test.qa.json');
const TEMP=CHECKPOINT+'.tmp';
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN1sAAAAASUVORK5CYII=','base64');

class SmokeFailure extends Error {}
const ensure=(condition,message)=>{if(!condition)throw new SmokeFailure(message);};
function checked(result,stage) {
  if(result.error) {
    // Do not print response bodies, tokens, keys, passwords or raw exceptions.
    const code=String(result.error.code??result.error.statusCode??result.error.status??result.status??'unknown');
    throw new SmokeFailure(`${stage} failed (code ${/^[\w-]{1,60}$/.test(code)?code:'unavailable'}).`);
  }
  return result.data;
}
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
async function guardedFetch(input,init={}) {
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
  ensure(url.origin===ORIGIN,'Refused network request outside the dedicated QA project.');
  return fetch(input,{...init,redirect:'error',signal:init.signal?AbortSignal.any([init.signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)});
}
const clientOptions={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:guardedFetch}};

async function main() {
  const argumentsExpected=[`--project-ref=${TARGET}`,'--allow-test-writes'];
  ensure(process.argv.slice(2).length===2&&argumentsExpected.every(arg=>process.argv.includes(arg)),
    `Manual test requires --project-ref=${TARGET} --allow-test-writes. No operation performed.`);
  for(const name of ['.env.autonexus-test.keys.json','.env.autonexus-test.qa.json','.env.autonexus-test.qa.json.tmp']) {
    try {execFileSync('git',['check-ignore','--quiet','--',name],{cwd:ROOT,stdio:'ignore'});}
    catch {throw new SmokeFailure('Credential/checkpoint paths must be ignored by Git before running.');}
  }
  const keys=JSON.parse(await readFile(KEYS,'utf8'));
  ensure(Array.isArray(keys),'Expected the dedicated project API key array.');
  const publicKey=keys.find(key=>key.type==='publishable'&&key.disabled!==true)?.api_key??keys.find(key=>key.name==='anon'&&key.disabled!==true)?.api_key;
  const adminKey=keys.find(key=>key.name==='service_role'&&key.disabled!==true)?.api_key;
  ensure(typeof publicKey==='string'&&typeof adminKey==='string','Missing publishable/anon or service_role key.');
  // The admin legacy JWT embeds its project reference. Never accept a key from
  // the old project, even when a local file was accidentally copied over.
  let adminClaims;
  try {adminClaims=JSON.parse(Buffer.from(adminKey.split('.')[1],'base64url').toString('utf8'));}
  catch {throw new SmokeFailure('Expected the dedicated project legacy service_role JWT.');}
  ensure(adminClaims.ref===TARGET&&adminClaims.role==='service_role','Service role key target mismatch.');
  let state;
  try {state=JSON.parse(await readFile(CHECKPOINT,'utf8'));}
  catch(error){if(error.code!=='ENOENT')throw new SmokeFailure('Checkpoint could not be read; refusing to replace it.');}
  if(state)ensure(state.version===1&&state.targetRef===TARGET&&uuid(state.runId),'Checkpoint target/version mismatch.');
  else {
    const runId=randomUUID();
    state={version:1,targetRef:TARGET,runId,startedAt:new Date().toISOString(),users:{},requests:{},ids:{}};
    for(const role of ['owner','outsider'])state.users[role]={
      email:`autonexus-qa-${runId}-${role}@example.test`,password:randomBytes(32).toString('base64url'),
      dealerSlug:`qa-${runId}-${role}`,
    };
    for(const request of ['purchase','documentSettings','sale','payment','removal'])state.requests[request]=randomUUID();
    state.ids.photo=randomUUID();
  }
  ensure(state.users?.owner&&state.users?.outsider&&state.requests&&state.ids,'Incomplete checkpoint; inspect before retrying.');
  for(const role of ['owner','outsider']) {
    const user=state.users[role];
    ensure(user.email===`autonexus-qa-${state.runId}-${role}@example.test`&&typeof user.password==='string'&&user.password.length>=32,
      'Checkpoint identity does not match this QA run.');
    ensure(user.dealerSlug===`qa-${state.runId}-${role}`,'Checkpoint dealer slug mismatch.');
  }
  for(const request of ['purchase','documentSettings','sale','payment','removal'])ensure(uuid(state.requests[request]),'Checkpoint request ID is missing.');
  async function save() {
    state.updatedAt=new Date().toISOString();
    await writeFile(TEMP,JSON.stringify(state,null,2)+'\n',{mode:0o600});
    await rename(TEMP,CHECKPOINT);
  }
  await save(); // Persist credentials and idempotency keys BEFORE the first write.
  const admin=createClient(ORIGIN,adminKey,clientOptions);
  const clients={};
  for(const role of ['owner','outsider']) {
    const identity=state.users[role];
    if(!identity.id) {
      // A unique email and stored password allow recovery after a lost createUser
      // response. Only these two fictitious identities may be created by admin.
      const created=await admin.auth.admin.createUser({email:identity.email,password:identity.password,email_confirm:true,
        user_metadata:{full_name:`QA TEST ONLY ${role}`,qa_run:state.runId}});
      if(created.error&&!['email_exists','user_already_exists'].includes(created.error.code))checked(created,`Create QA ${role}`);
      if(created.data?.user?.id){identity.id=created.data.user.id;await save();}
    }
    const client=createClient(ORIGIN,publicKey,clientOptions);
    const signed=checked(await client.auth.signInWithPassword({email:identity.email,password:identity.password}),`Password login ${role}`);
    ensure(signed.user?.id&&signed.session?.access_token,'Auth did not return a real user session.');
    ensure(!identity.id||identity.id===signed.user.id,'Stored QA user does not match authenticated user.');
    identity.id=signed.user.id;
    const verified=checked(await client.auth.getUser(),`Verify Auth session ${role}`);
    ensure(verified.user?.id===identity.id,'Server session verification mismatch.');
    clients[role]=client;
    await save();
    // The authenticated lookup recovers onboarding if its response was lost.
    let dealer=checked(await client.from('dealers').select('id,name,slug').eq('slug',identity.dealerSlug).maybeSingle(),`Recover QA dealer ${role}`);
    if(!dealer) {
      ensure(!identity.dealerId,'Checkpoint dealer is not visible to its owner.');
      const id=checked(await client.rpc('create_dealer_with_owner',{p_name:`QA TEST ONLY ${role} ${state.runId.slice(0,8)}`,p_slug:identity.dealerSlug}),`Onboarding ${role}`);
      ensure(uuid(id),'Onboarding returned no dealer ID.');
      dealer=checked(await client.from('dealers').select('id,name,slug').eq('id',id).single(),`Read new QA dealer ${role}`);
    }
    ensure(!identity.dealerId||identity.dealerId===dealer.id,'Checkpoint dealer ID mismatch.');
    identity.dealerId=dealer.id;
    const membership=checked(await client.from('dealer_members').select('role,status').eq('dealer_id',dealer.id).eq('user_id',identity.id).single(),`Owner membership ${role}`);
    ensure(membership.role==='owner'&&membership.status==='active','Onboarding did not grant the expected owner membership.');
    await save();
  }
  console.log('PASS hosted Auth login, verified sessions and two separate QA owner tenants.');
  const owner=clients.owner,outsider=clients.outsider,dealer=state.users.owner.dealerId;
  const command=async(kind,id,input,request)=>checked(await owner.rpc('commercial_command',{
    p_dealer:dealer,p_command:kind,p_id:id,p_input:input,p_request:state.requests[request],
  }),`Commercial ${kind}`);
  const date=state.startedAt.slice(0,10);
  if(!state.ids.po) {
    const po=await command('purchase',null,{newVendor:{name:`QA TEST ONLY supplier ${state.runId.slice(0,8)}`},make:'QA TEST ONLY',model:'Smoke fixture',year:2020,
      registration:`QA${state.runId.replaceAll('-','').slice(0,10).toUpperCase()}`,km:1000,price:8000,vatScheme:'margin',
      invRef:`QA-${state.runId.slice(0,8)}`,purchaseDate:date,receivedOn:date,settlement:0},'purchase');
    ensure(uuid(po.id)&&uuid(po.vehicleId),'Purchase returned invalid IDs.');
    state.ids.po=po.id;state.ids.vehicle=po.vehicleId;await save();
  }
  const po=checked(await owner.from('purchase_orders').select('id,vehicle_id,vat_scheme').eq('dealer_id',dealer).eq('id',state.ids.po).single(),'Reopen PO');
  const car=checked(await owner.from('vehicles').select('id,originating_po_id,provenance_status').eq('dealer_id',dealer).eq('id',state.ids.vehicle).single(),'Read stock link');
  ensure(po.vehicle_id===car.id&&car.originating_po_id===po.id&&car.provenance_status==='verified','PO/stock link is inconsistent.');
  ensure(po.vat_scheme==='margin','PO tax scheme was not preserved.');
  const purchases=checked(await owner.rpc('purchase_balances',{p_dealer:dealer}),'Purchase balance list');
  ensure(purchases.some(row=>row.id===po.id&&Number(row.total)===8000),'Saved PO is absent from its balance report.');
  console.log('PASS hosted PO save/reopen, Margin scheme, stock provenance and payable report.');

  if(!state.documentSettingsSaved) {
    await command('document_settings',null,{legal_name:'QA TEST ONLY - NOT A REAL DEALER',address:'Disposable staging test address',agreement_terms:'TEST ONLY - no legal or financial transaction',invoice_notes:'TEST ONLY',vat_number:'TEST'},'documentSettings');
    state.documentSettingsSaved=true;await save();
  }
  if(!state.ids.deal) {
    const deal=await command('sale',null,{vehicleId:car.id,newCustomer:{name:`QA TEST ONLY buyer ${state.runId.slice(0,8)}`},salePrice:10000,priceReason:'Initial QA test price',salespersonId:state.users.owner.id},'sale');
    ensure(uuid(deal.id),'Sale returned no deal ID.');state.ids.deal=deal.id;await save();
  }
  const deal=checked(await owner.from('deals').select('id,customer_id,retail_price').eq('dealer_id',dealer).eq('id',state.ids.deal).single(),'Reopen Deal');
  ensure(Number(deal.retail_price)===10000,'Saved Deal price mismatch.');
  if(!state.ids.payment) {
    const paid=await command('payment',deal.id,{amount:100,kind:'deposit',method:'cash',paidOn:date,reference:`QA-${state.runId.slice(0,8)}`},'payment');
    ensure(uuid(paid.id),'Payment returned no receipt ID.');state.ids.payment=paid.id;await save();
  }
  if(!state.paymentRemoved) {
    const balance=checked(await owner.rpc('deal_balances',{p_dealer:dealer,p_deal:deal.id}),'Balance before correction');
    // After an interrupted response, correction may already be committed. The
    // stable request UUID below replays it, never creating a second correction.
    ensure([9900,10000].includes(Number(balance.balance)),'Unexpected Deal balance before correction.');
    checked(await owner.rpc('remove_deal_payment',{p_dealer:dealer,p_payment:state.ids.payment,p_request:state.requests.removal}),'Audited payment correction');
    state.paymentRemoved=true;await save();
  }
  const receipt=checked(await owner.from('payments').select('id,amount,kind').eq('dealer_id',dealer).eq('id',state.ids.payment).single(),'Retained original payment');
  ensure(Number(receipt.amount)===100&&receipt.kind==='deposit','Original payment was changed or removed.');
  const balance=checked(await owner.rpc('deal_balances',{p_dealer:dealer,p_deal:deal.id}),'Balance after correction');
  ensure(Number(balance.balance)===10000,'Payment correction did not restore the balance.');
  const events=checked(await owner.from('deal_events').select('id,kind,created_by,detail').eq('dealer_id',dealer).eq('deal_id',deal.id).in('kind',['payment_removed','receipt_reversed']),'Correction event log');
  const corrections=events.filter(event=>event.detail?.payment_id===state.ids.payment);
  ensure(corrections.length===1&&corrections[0].created_by===state.users.owner.id,'Correction must have exactly one attributable event.');
  console.log('PASS hosted Deal persistence and payment correction: original retained, balance restored, event attributed.');

  // Read and write isolation use the second real owner session, never service_role.
  for(const [table,id] of [['purchase_orders',po.id],['vehicles',car.id],['deals',deal.id],['payments',receipt.id],['customers',deal.customer_id]]) {
    const rows=checked(await outsider.from(table).select('id').eq('id',id),`Other-tenant ${table} read`);
    ensure(rows.length===0,`Cross-tenant ${table} disclosure.`);
  }
  const foreign=await outsider.rpc('deal_balances',{p_dealer:dealer,p_deal:deal.id});
  ensure(foreign.error?.message==='commercial_not_allowed','Foreign tenant Deal RPC was not denied by authorization.');
  const forbiddenContact=await outsider.from('customers').insert({dealer_id:dealer,name:'QA TEST ONLY unauthorized write'});
  ensure(forbiddenContact.error?.code==='42501','Cross-tenant contact write was not denied by RLS.');
  console.log('PASS hosted cross-tenant row reads, finance RPC and contact write isolation.');

  const path=`${dealer}/${car.id}/qa-smoke-${state.runId}.png`;
  const existing=await owner.storage.from('vehicle-photos').download(path);
  if(existing.error) {
    const missing=['404','400'].includes(String(existing.error.statusCode))&&/not found|does not exist/i.test(existing.error.message);
    ensure(missing,'Private Storage recovery failed unexpectedly; refusing blind upload.');
    checked(await owner.storage.from('vehicle-photos').upload(path,PNG,{contentType:'image/png',upsert:false}),'Private photo upload');
  }
  const downloaded=checked(await owner.storage.from('vehicle-photos').download(path),'Owner private photo download');
  ensure(Buffer.from(await downloaded.arrayBuffer()).equals(PNG),'Private Storage content mismatch.');
  const photo=checked(await owner.from('vehicle_photos').select('id,storage_path').eq('id',state.ids.photo).maybeSingle(),'Recover photo metadata');
  if(!photo)checked(await owner.from('vehicle_photos').insert({id:state.ids.photo,dealer_id:dealer,vehicle_id:car.id,storage_path:path}), 'Save photo metadata');
  else ensure(photo.storage_path===path,'Photo checkpoint belongs to a different object.');
  const otherRead=await outsider.storage.from('vehicle-photos').download(path);
  ensure(otherRead.error&&['400','403','404'].includes(String(otherRead.error.statusCode)),'Second tenant read the private photo or denial was not verified.');
  const otherWrite=await outsider.storage.from('vehicle-photos').upload(`${dealer}/${car.id}/qa-forbidden-${state.runId}.png`,PNG,{contentType:'image/png',upsert:false});
  ensure(otherWrite.error&&(/row-level security/i.test(otherWrite.error.message)||String(otherWrite.error.statusCode)==='403'),'Second tenant upload was not denied by Storage policy.');
  const publicResponse=await guardedFetch(`${ORIGIN}/storage/v1/object/public/vehicle-photos/${path}`);
  ensure([400,403,404].includes(publicResponse.status),'Private photo is reachable without authentication.');
  await publicResponse.body?.cancel();
  state.storagePath=path;state.completedAt=new Date().toISOString();await save();
  console.log('PASS private Storage upload/download, exact content, other-tenant denial and anonymous denial.');
  console.log(`PASS hosted staging smoke on ${TARGET}. QA records retained; reruns reuse checkpointed identities and requests.`);
}

main().catch(error=>{
  console.error(error instanceof SmokeFailure?error.message:'Hosted smoke stopped unexpectedly; no credential or response details logged.');
  process.exitCode=1;
});
