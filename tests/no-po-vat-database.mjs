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
  const files=(await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')&&Number(f.slice(0,3))<95).sort();
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
  const privileged=async(sql,args=[])=>{await db.exec('reset role');try{return(await db.query(sql,args)).rows;}finally{await db.exec('set role authenticated');}};
  const stock=async(model='Focus')=>{
    const id=randomUUID();await privileged("insert into vehicles(id,dealer_id,make,model,year,km,sale_price,status) values($1,$2,'Ford',$3,2020,1000,12300,'ready_for_sale')",[id,dealer,model]);return id;
  };
  const agreement=async id=>{const version=(await db.query('select version from deals where id=$1',[id])).rows[0].version;const doc=await cmd('force_agreement',id,{expectedVersion:version});return(await db.query('select id,snapshot from deal_documents where id=$1',[doc.id])).rows[0];};
  const order=async id=>(await privileged("select vat_scheme,vat_rate from deal_orders where deal_id=$1 and kind='sale'",[id]))[0];
  // Before migration: preserve proof of an already issued legacy VAT document.
  const legacyStock=await stock();const legacy=await cmd('sale',null,{vehicleId:legacyStock,customerId:customer,salePrice:12300,salespersonId:owner});
  const historic=await agreement(legacy.id);assert.equal(historic.snapshot.scheme,'standard');assert.equal(Number(historic.snapshot.figures.vat),2300);
  const explicitNone=randomUUID(),explicitStandard=randomUUID();
  for(const [id,scheme] of [[explicitNone,'none'],[explicitStandard,'standard']]){
    await privileged("insert into dealers(id,name,slug,modules) values($1,'EXPLICIT CONFIG',$2,'{\"sales\":true}')",[id,'tax-'+id]);
    await privileged("insert into dealer_members(dealer_id,user_id,role) values($1,$2,'owner')",[id,owner]);
    await db.query('select commercial_command($1,$2,null,$3::jsonb,$4)',[id,'tax_settings',JSON.stringify({defaultVatScheme:scheme,standardVatRate:21}),randomUUID()]);
  }
  await db.exec('reset role');
  const newMigrations=(await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')&&Number(f.slice(0,3))>=95).sort();
  assert.ok(newMigrations.some(f=>f.startsWith('095')));
  for(const file of newMigrations)await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  await db.exec('set role authenticated');
  const setting=async id=>(await db.query('select financial_tax_settings($1) x',[id])).rows[0].x;
  assert.equal((await setting(dealer)).defaultVatScheme,'margin','untouched existing none becomes margin');
  assert.equal((await setting(explicitNone)).defaultVatScheme,'none');assert.equal((await setting(explicitStandard)).defaultVatScheme,'standard');
  const newDealer=randomUUID();await privileged("insert into dealers(id,name,slug,modules) values($1,'NEW DEFAULT',$2,'{\"sales\":true}')",[newDealer,'tax-'+newDealer]);await privileged("insert into dealer_members(dealer_id,user_id,role) values($1,$2,'owner')",[newDealer,owner]);assert.equal((await setting(newDealer)).defaultVatScheme,'margin');
  assert.deepEqual((await db.query('select snapshot from deal_documents where id=$1',[historic.id])).rows[0].snapshot,historic.snapshot,'migration leaves issued document unchanged');
  // A new revision of that legacy sale must not invent VAT without acquisition data.
  await cmd('payment',legacy.id,{kind:'balance',amount:100,method:'cash',paidOn:'2026-01-01'});
  const corrected=await agreement(legacy.id);assert.notEqual(corrected.id,historic.id);assert.equal(corrected.snapshot.scheme,'margin');assert.equal(Number(corrected.snapshot.figures.vat),0);assert.equal(Number(corrected.snapshot.figures.invoiceTotal),12300);assert.equal(Number(corrected.snapshot.figures.balanceAgreement),12200);
  assert.deepEqual((await db.query('select snapshot from deal_documents where id=$1',[historic.id])).rows[0].snapshot,historic.snapshot);
  const plainStock=await stock();const plain=await cmd('sale',null,{vehicleId:plainStock,customerId:customer,salePrice:12300,salespersonId:owner,vatScheme:'standard'});assert.equal((await order(plain.id)).vat_scheme,'margin','client standard request cannot invent PO tax');const plainDoc=await agreement(plain.id);assert.equal(Number(plainDoc.snapshot.figures.vat),0);
  const vanStock=await stock('Transit Custom');await privileged("insert into vehicle_details(vehicle_id,dealer_id,body_style) values($1,$2,'Panel van') on conflict(vehicle_id) do update set body_style=excluded.body_style",[vanStock,dealer]);
  const van=await cmd('sale',null,{vehicleId:vanStock,customerId:customer,salePrice:12300,salespersonId:owner});assert.equal((await order(van.id)).vat_scheme,'margin');assert.equal(Number((await agreement(van.id)).snapshot.figures.vat),0,'van category never supplies tax authority');
  const autoVehicle=await stock(),switchVehicle=await stock('Transit');const autoSession=randomUUID();
  const input={sale:{customerId:customer,vehicleId:autoVehicle,salespersonId:owner,salePrice:12300},terms:{},deposits:[],trades:[],agreement:false};
  const autosave=async(revision,data)=>(await db.query('select autosave_new_deal($1,$2,$3,$4::jsonb,$5) x',[dealer,autoSession,revision,JSON.stringify(data),randomUUID()])).rows[0].x;
  const auto=await autosave(0,input);assert.equal((await order(auto.id)).vat_scheme,'margin');
  await assert.rejects(()=>autosave(1,{...input,sale:{...input.sale,vehicleId:switchVehicle}}),/sale_vehicle|vehicle.*fixed|immutable/i);
  assert.equal((await order(auto.id)).vat_scheme,'margin','rejected vehicle switch preserves margin fallback');
  const otherAuto=(await db.query('select autosave_new_deal($1,$2,0,$3::jsonb,$4) x',[dealer,randomUUID(),JSON.stringify({...input,sale:{...input.sale,vehicleId:switchVehicle,vatScheme:'standard'}}),randomUUID()])).rows[0].x;
  assert.equal((await order(otherAuto.id)).vat_scheme,'margin','new autosave cannot invent VAT from client payload');
  const po=await cmd('purchase',null,{newVendor:{name:'Explicit VAT Supplier'},make:'Ford',model:'Transit',year:2020,registration:'VAT-AUTHORITY',km:1000,price:8000,vatScheme:'standard',vatRate:23,invRef:'VAT-PO',purchaseDate:'2026-01-01',receivedOn:'2026-01-01'});
  await privileged("update vehicles set sale_price=12300,status='ready_for_sale' where id=$1",[po.vehicleId]);
  const taxed=await cmd('sale',null,{vehicleId:po.vehicleId,customerId:customer,salePrice:12300,salespersonId:owner,vatScheme:'margin'});assert.equal((await order(taxed.id)).vat_scheme,'standard');const taxDoc=await agreement(taxed.id);assert.equal(Number(taxDoc.snapshot.figures.vat),2300);assert.equal(Number(taxDoc.snapshot.figures.invoiceTotal),12300,'valid PO VAT remains in unchanged total');
  for(const scheme of ['none','margin']){
    const acquired=await cmd('purchase',null,{newVendor:{name:'Preserved Scheme Supplier'},make:'Ford',model:'Focus',year:2020,registration:'PO-'+scheme,km:1000,price:8000,vatScheme:scheme,invRef:'SCHEME-'+scheme,purchaseDate:'2026-01-01',receivedOn:'2026-01-01'});
    await privileged("update vehicles set sale_price=12300,status='ready_for_sale' where id=$1",[acquired.vehicleId]);
    const deal=await cmd('sale',null,{vehicleId:acquired.vehicleId,customerId:customer,salePrice:12300,salespersonId:owner});assert.equal((await order(deal.id)).vat_scheme,scheme);assert.equal(Number((await agreement(deal.id)).snapshot.figures.vat),0);
  }
  console.log('PASS no-PO VAT: migration defaults preserve explicit settings, no automatic car/van VAT, sale/autosave switch, legacy new documents corrected, historical snapshots immutable, PO VAT authoritative');
}finally{await db.close();}
