import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {openDemoDatabase} from '../src/lib/demo-database.mjs';

// Disposable local PostgreSQL only. Never opens the app's demo data or a remote DB.
const migrationsDir=fileURLToPath(new URL('../supabase/migrations/',import.meta.url));
const db=new PGlite({extensions:{pgcrypto}});
const dealer=randomUUID(),otherDealer=randomUUID(),owner=randomUUID(),outsider=randomUUID(),agency=randomUUID();
const fields={
  name:'Alex Seller',type:'individual',business_name:'Seller Trading',title:'Ms',first_name:'Alex',last_name:'Seller',
  job_title:'Director',phone:'+353 1 555 0100',mobile:'+353 87 555 0100',ddi_phone:'+353 1 555 0101',fax:'+353 1 555 0102',
  email:'alex@seller.example',address_line1:'10 Test Street',address_line2:'Unit 2',city:'Dublin',county:'Dublin',
  eircode:'D02 TEST',country:'IE',vat_number:'TEST-ONLY',notes:'Seller contact test, not a real transaction',
};
const purchase=(registration,newVendor=fields)=>({
  make:'Ford',model:'Focus',year:2020,registration,km:12300,price:8000,vatScheme:'margin',
  invRef:'TEST-'+registration,purchaseDate:'2026-01-01',receivedOn:'2026-01-02',newVendor,
});
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
  const migrationFiles=(await readdir(migrationsDir)).filter(f=>f.endsWith('.sql')).sort();
  const vendorMigration=migrationFiles.find(f=>f.endsWith('_purchase_vendor_contact_details.sql'));
  assert.ok(vendorMigration);
  const priorBodies={};
  for(const file of migrationFiles){
    if(file===vendorMigration){
      assert.equal((await db.query("select to_regprocedure('public.purchase_vendor_schema_version(uuid)') fn")).rows[0].fn,null);
      for(const name of ['commercial_command_v053','commercial_command_v069','commercial_command']){
        priorBodies[name]=(await db.query('select prosrc,proacl::text acl from pg_proc where oid=to_regprocedure($1)',[`public.${name}(uuid,text,uuid,jsonb,uuid)`])).rows[0];
      }
    }
    try{await db.exec(await readFile(join(migrationsDir,file),'utf8'));}
    catch(error){throw new Error(`Migration ${file}: ${error.message}`);}
  }
  // No ACL broadening and no outer-wrapper alteration.
  for(const [name,before] of Object.entries(priorBodies)){
    const after=(await db.query('select prosrc,proacl::text acl from pg_proc where oid=to_regprocedure($1)',[`public.${name}(uuid,text,uuid,jsonb,uuid)`])).rows[0];
    assert.equal(after.acl,before.acl,`${name} ACL unchanged`);
    if(name==='commercial_command')assert.equal(after.prosrc,before.prosrc);
  }
  for(const [id,email] of [[owner,'owner@test.example'],[outsider,'outsider@test.example'],[agency,'agency@test.example']])
    await db.query('insert into auth.users(id,email) values($1,$2)',[id,email]);
  for(const id of [dealer,otherDealer])await db.query("insert into dealers(id,name,slug,modules) values($1,'TEST ONLY',$2,'{\"sales\":true}')",[id,'vendor-'+id]);
  await db.query("insert into dealer_members(dealer_id,user_id,role) values($1,$2,'owner'),($3,$4,'owner'),($1,$5,'agency')",[dealer,owner,otherDealer,outsider,agency]);
  const login=async(user,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user??'']);await db.exec(`set role ${role}`);};
  const privileged=async(sql,args=[])=>{await db.exec('reset role');try{return(await db.query(sql,args)).rows;}finally{await db.exec('set role authenticated');}};
  const command=async(kind,input,request=randomUUID())=>(await db.query('select commercial_command($1,$2,null,$3::jsonb,$4) result',[dealer,kind,JSON.stringify(input),request])).rows[0].result;
  const contact=async(id)=>(await db.query('select c.* from customers c join purchase_orders p on p.vendor_id=c.id and p.dealer_id=c.dealer_id where p.id=$1',[id])).rows[0];
  const counts=async()=>(await privileged(`select (select count(*)::int from customers) contacts,
    (select count(*)::int from vehicles) vehicles,(select count(*)::int from purchase_orders) orders,
    (select count(*)::int from commercial_requests) requests,(select count(*)::int from audit_logs) audits`))[0];
  const existingInput=async(registration,vendor)=>{
    const input=purchase(registration,vendor),id=randomUUID();
    await privileged('insert into vehicles(id,dealer_id,make,model,year,registration,km) values($1,$2,$3,$4,$5,$6,$7)',[id,dealer,input.make,input.model,input.year,input.registration,input.km]);
    return {...input,existingVehicleId:id};
  };
  await login(owner);
  assert.equal((await db.query('select purchase_vendor_schema_version($1) version',[dealer])).rows[0].version,1);
  for(const kind of ['purchase','purchase_existing']){
    for(const [country,type] of [['IE','individual'],['GB','business'],['CA','business']]){
      const vendor={...fields,country,type,name:`${country} ${type} seller`};
      const input=kind==='purchase'?purchase(`${kind}-${country}`,vendor):await existingInput(`existing-${country}`,vendor);
      const request=randomUUID(),before=await counts();
      const created=await command(kind,input,request);
      const stored=await contact(created.id);
      for(const [key,value] of Object.entries(vendor))assert.equal(stored[key],value,`${kind} ${country} ${key}`);
      assert.equal(stored.dealer_id,dealer);
      const after=await counts();assert.equal(after.contacts,before.contacts+1);assert.equal(after.orders,before.orders+1);
      assert.equal(after.vehicles,before.vehicles+(kind==='purchase'?1:0));
      assert.deepEqual(await command(kind,input,request),created,'exact retry returns same result');
      assert.deepEqual(await counts(),after,'retry adds no contact/order/audit/request');
      await assert.rejects(()=>command(kind,{...input,newVendor:{...vendor,notes:'Changed retry'}},request),/request_reused/);
      assert.deepEqual(await counts(),after);
      assert.ok((await db.query("select 1 from audit_logs where entity_id=$1 and action in ('purchase_created','existing_vehicle_purchase_created')",[created.id])).rows.length,'purchase audit retained');
    }
    // Existing selection wins; even an invalid submitted newVendor cannot overwrite it.
    const existing=(await privileged("insert into customers(dealer_id,name,type,country,notes) values($1,'Existing vendor','individual','IE','Keep me') returning *",[dealer]))[0];
    const selected=kind==='purchase'?purchase(`selected-${kind}`):await existingInput(`selected-${kind}`,fields);
    selected.vendorId=existing.id;selected.newVendor={name:'Overwrite',type:'wrong',country:'XX'};
    const saved=await command(kind,selected);assert.equal((await contact(saved.id)).id,existing.id);
    assert.deepEqual((await privileged('select * from customers where id=$1',[existing.id]))[0],existing);
    // Legacy clients retain business + IE defaults.
    const legacy=kind==='purchase'?purchase(`legacy-${kind}`,{name:'Legacy vendor'}):await existingInput(`legacy-${kind}`,{name:'Legacy vendor'});
    const legacyRow=await contact((await command(kind,legacy)).id);assert.equal(legacyRow.type,'business');assert.equal(legacyRow.country,'IE');
    // Fail after the contact and PO were inserted: everything must roll back.
    const rollback=kind==='purchase'?purchase(`rollback-${kind}`):await existingInput(`rollback-${kind}`,fields);
    await db.exec('reset role');
    await db.exec(`create function vendor_test_fail_audit() returns trigger language plpgsql as $$begin raise exception 'vendor_test_audit_failure';end$$;
      create trigger vendor_test_fail_audit before insert on audit_logs for each row execute function vendor_test_fail_audit();`);
    await login(owner);const rollbackBefore=await counts();
    await assert.rejects(()=>command(kind,rollback),/vendor_test_audit_failure/);assert.deepEqual(await counts(),rollbackBefore);
    await db.exec('reset role');await db.exec('drop trigger vendor_test_fail_audit on audit_logs;drop function vendor_test_fail_audit();');await login(owner);
    for(const [bad,error] of [[{type:'company'},/invalid_vendor_type/],[{country:'US'},/invalid_vendor_country/],[{email:'not-an-email'},/invalid_vendor_email/],[{notes:'x'.repeat(2001)},/invalid_vendor_field/],[{phone:123},/invalid_vendor_field/]]){
      const invalid={...rollback,newVendor:{...fields,...bad}};const before=await counts();
      await assert.rejects(()=>command(kind,invalid),error);assert.deepEqual(await counts(),before);
    }
    const foreign=(await privileged("insert into customers(dealer_id,name) values($1,'Other dealer contact') returning id",[otherDealer]))[0].id;
    await assert.rejects(()=>command(kind,{...rollback,vendorId:foreign}),/invalid_vendor/);
  }
  // No additional public entry point into customer creation.
  await assert.rejects(()=>db.query('select create_purchase_vendor($1,$2::jsonb)',[dealer,JSON.stringify(fields)]),/permission denied/);
  for(const user of [agency,outsider]){
    await login(user);await assert.rejects(()=>db.query('select purchase_vendor_schema_version($1)',[dealer]),/commercial_not_allowed/);
    for(const kind of ['purchase','purchase_existing'])await assert.rejects(()=>command(kind,purchase('denied')),/commercial_not_allowed/);
  }
  await login(null,'anon');await assert.rejects(()=>db.query('select purchase_vendor_schema_version($1)',[dealer]),/permission denied/);
  console.log('PASS vendor database: all fields IE/GB/CA, both purchase paths, legacy defaults, existing preservation, retry/reused request, atomic rollback, validation, ACL and dealer permissions');
}finally{await db.close();}

// Exercise the same adapter used by the local app, in a fresh temporary folder.
const temp=await mkdtemp(join(tmpdir(),'autonexus-vendor-test-'));
let demo;
try{
  demo=await openDemoDatabase({dataDir:temp,migrationsDir,seed:{dealerId:dealer,ownerId:owner,staff:[{name:'Test Owner',role:'owner'}],customers:[],leads:[],vehicles:[]}});
  const capability=await demo.rpc('purchase_vendor_schema_version',{p_dealer:dealer});assert.equal(capability.error,null);assert.equal(capability.data,1);
  const created=await demo.rpc('commercial_command',{p_dealer:dealer,p_command:'purchase',p_id:null,p_input:purchase('ADAPTER-TEST',{...fields,country:'CA',type:'business'}),p_request:randomUUID()});
  assert.equal(created.error,null,created.error?.message);
  const po=await demo.from('purchase_orders').select('vendor_id').eq('id',created.data.id).single();assert.equal(po.error,null);
  const vendor=await demo.from('customers').select('*').eq('id',po.data.vendor_id).single();assert.equal(vendor.error,null);
  for(const [key,value] of Object.entries({...fields,country:'CA',type:'business'}))assert.equal(vendor.data[key],value,`adapter ${key}`);
  console.log('PASS vendor local adapter: capability + full-contact purchase round trip; no app data touched');
}finally{
  await demo?.close();
  const resolved=resolve(temp),root=resolve(tmpdir())+sep;
  if(!resolved.startsWith(root)||!resolved.split(sep).at(-1).startsWith('autonexus-vendor-test-'))throw new Error('Unexpected test cleanup path');
  await rm(resolved,{recursive:true,force:true});
}
