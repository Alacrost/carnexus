import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';

// Disposable PostgreSQL only. No connection to hosted Supabase or persisted demo.
const db=new PGlite({extensions:{pgcrypto}});
try {
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth,storage to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;
    create table storage.buckets(id text primary key,name text,public boolean);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
    alter default privileges in schema public grant all on tables to authenticated,anon;`);
  const files=(await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')&&!f.startsWith('087')).sort();
  for(const file of files) await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  const dealer=randomUUID(),owner=randomUUID(),customer=randomUUID();
  await db.query('insert into auth.users(id,email) values($1,$2)',[owner,'agreement@fixture.test']);
  await db.query("insert into dealers(id,name,slug,modules) values($1,'TEST ONLY','agreement-test','{\"sales\":true}')",[dealer]);
  await db.query("insert into dealer_members(dealer_id,user_id,role) values($1,$2,'owner')",[dealer,owner]);
  await db.query("insert into customers(id,dealer_id,name) values($1,$2,'Test')",[customer,dealer]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
  const cmd=async(kind,id,data={},request=randomUUID())=>(await db.query('select commercial_command($1,$2,$3,$4::jsonb,$5) result',[dealer,kind,id,JSON.stringify(data),request])).rows[0].result;
  await db.exec('set role authenticated');
  await cmd('document_settings',null,{legal_name:'TEST ONLY',address:'Test address',agreement_terms:'Test terms',invoice_notes:'Test',vat_number:'TEST'});
  const create=async(deposits=[],trades=[],agreement=false)=>{
    await db.exec('reset role');const vehicle=randomUUID();
    await db.query("insert into vehicles(id,dealer_id,make,model,year,km,sale_price,status) values($1,$2,'Ford','Focus',2020,1000,10000,'ready_for_sale')",[vehicle,dealer]);
    await db.exec('set role authenticated');
    const input={sale:{customerId:customer,vehicleId:vehicle,salespersonId:owner,salePrice:10000},terms:{},deposits,trades,agreement};
    return (await db.query('select autosave_new_deal($1,$2,0,$3::jsonb,$4) result',[dealer,randomUUID(),JSON.stringify(input),randomUUID()])).rows[0].result;
  };
  const count=async id=>{await db.exec('reset role');const n=(await db.query("select count(*)::int n from deal_documents where deal_id=$1 and kind='agreement' and status<>'void'",[id])).rows[0].n;await db.exec('set role authenticated');return n;};
  const deposit={amount:100,method:'cash',paidOn:'2026-01-01'};
  const none=await create();assert.equal(none.status,'vehicle_interest');assert.equal(await count(none.id),0);
  const pending=await create([{...deposit,method:'bank',fundsConfirmed:false}]);assert.equal(pending.status,'agreed');assert.equal(await count(pending.id),0,'pending autosave does not force agreement');
  await assert.rejects(()=>cmd('document',pending.id,{kind:'quote'}),/agreement_required/);
  await db.exec('reset role');const receipt=(await db.query("select id from payments where deal_id=$1 and kind='deposit'",[pending.id])).rows[0].id;await db.exec('set role authenticated');
  const clearRequest=randomUUID();await cmd('clear_receipt',receipt,{reference:'TEST CONFIRMED'},clearRequest);
  const afterClear=await count(pending.id);assert.ok(afterClear>0);await cmd('clear_receipt',receipt,{reference:'TEST CONFIRMED'},clearRequest);assert.equal(await count(pending.id),afterClear,'clearing replay no new document');
  await cmd('clear_receipt',receipt,{reference:'TEST CONFIRMED AGAIN'});assert.equal(await count(pending.id),afterClear,'already confirmed receipt creates no new agreement');
  await db.exec('reset role');
  const clearedState=(await db.query("select d.status,doc.kind,doc.snapshot from deals d join deal_documents doc on doc.deal_id=d.id and doc.deal_version=d.version and doc.kind='agreement' where d.id=$1 order by doc.created_at desc limit 1",[pending.id])).rows[0];
  assert.equal(clearedState.status,'agreed');assert.equal(clearedState.kind,'agreement');assert.equal(Number(clearedState.snapshot.deposits),100);assert.equal(Number(clearedState.snapshot.figures.balanceAgreement),9900);
  await db.exec('set role authenticated');
  await assert.rejects(()=>cmd('document',pending.id,{kind:'quote'}),/agreement_required/);
  const cash=await create([deposit]);assert.equal(cash.status,'agreed');assert.ok(cash.documentId);assert.ok(await count(cash.id)>0);
  const confirmedBank=await create([{...deposit,method:'bank',fundsConfirmed:true}]);assert.equal(confirmedBank.status,'agreed');assert.ok(await count(confirmedBank.id)>0);
  const trade={make:'Toyota',model:'Yaris',year:2018,registration:'TEST-TRADE-A',km:5000,allowance:2000,settlement:0};
  const tradeOnly=await create([],[trade]);assert.equal(tradeOnly.status,'agreed');assert.ok(await count(tradeOnly.id)>0);
  const both=await create([deposit],[{...trade,registration:'TEST-TRADE-B'}]);assert.equal(both.status,'agreed');assert.ok(await count(both.id)>0);
  const balance=await create();await cmd('payment',balance.id,{...deposit,kind:'balance'});assert.equal(await count(balance.id),0,'balance does not auto-agree');
  const savedPending=await create();await cmd('document',savedPending.id,{kind:'quote'});await cmd('payment',savedPending.id,{...deposit,kind:'deposit',method:'bank',fundsConfirmed:false});assert.equal(await count(savedPending.id),0,'saved pending payment remains quotation');
  const savedDeposit=await create();await cmd('document',savedDeposit.id,{kind:'quote'});await cmd('payment',savedDeposit.id,{...deposit,kind:'deposit'});assert.ok(await count(savedDeposit.id)>0,'deposit on existing quotation creates agreement');
  const savedTrade=await create();await cmd('document',savedTrade.id,{kind:'quote'});await cmd('trade',savedTrade.id,{...trade,registration:'TEST-SAVED-TRADE'});assert.ok(await count(savedTrade.id)>0,'trade on existing quotation creates agreement');
  const nonTrade=await create();await db.exec('reset role');
  await db.query("insert into purchase_orders(dealer_id,deal_id,po_no,vendor_id,vat_scheme) values($1,$2,'TEST NONTRADE',$3,'none')",[dealer,nonTrade.id,customer]);
  assert.equal((await db.query('select deal_agreement_triggered($1,$2) qualifies',[dealer,nonTrade.id])).rows[0].qualifies,false,'ordinary PO is not a trade');await db.exec('set role authenticated');
  await cmd('document',nonTrade.id,{kind:'quote'});
  const lender=await create();await cmd('finance',lender.id,{finance_company:'Test lender',finance_reference:'TEST',finance_expected:1000,finance_status:'approved'});await cmd('payment',lender.id,{...deposit,kind:'finance_payout',method:'finance'});assert.equal(await count(lender.id),0,'lender payment does not auto-agree');
  await db.exec('reset role');const cashReceipt=(await db.query("select id from payments where deal_id=$1 and kind='deposit'",[cash.id])).rows[0].id;await db.exec('set role authenticated');
  const originalCount=await count(cash.id);await cmd('reverse_receipt',cashReceipt,{reason:'TEST reversal',reversedOn:'2026-01-01'});assert.equal(await count(cash.id),originalCount,'history retained on reversal');
  const forced=await create([],[],true);assert.equal(forced.status,'agreed');assert.ok(await count(forced.id)>0,'explicit agreement unaffected');
  for(const fundsConfirmed of [false,true]) {
    await db.exec('reset role');const directVehicle=randomUUID();
    await db.query("insert into vehicles(id,dealer_id,make,model,year,km,sale_price,status) values($1,$2,'Ford','Direct',2020,1000,10000,'ready_for_sale')",[directVehicle,dealer]);await db.exec('set role authenticated');
    const sale={customerId:customer,vehicleId:directVehicle,salespersonId:owner,salePrice:10000,deposits:[{...deposit,method:'bank',fundsConfirmed}]};
    const direct=(await db.query("select create_deal_from_sheet($1,$2::jsonb,'{}'::jsonb,null,'deal',$3) result",[dealer,JSON.stringify(sale),randomUUID()])).rows[0].result;
    assert.equal((await count(direct.id))>0,fundsConfirmed,'direct sheet honors actual confirmed deposit');
    await db.exec('reset role');assert.equal((await db.query('select status from deals where id=$1',[direct.id])).rows[0].status,'agreed');await db.exec('set role authenticated');
  }
  await assert.rejects(()=>cmd('document',randomUUID(),{kind:'quote'}),/deal_missing|deal_closed/);
  console.log('PASS confirmed agreements: pending activates without deduction/agreement, confirmed cash/bank, trade/both, clearing/replay, balance/lender excluded from auto-agreement, reversal history, explicit agreement, missing Deal');
} finally {await db.close();}
