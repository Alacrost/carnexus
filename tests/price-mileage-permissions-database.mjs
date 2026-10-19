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
  const files=(await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort();
  for(const file of files) await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  const dealer=randomUUID(),otherDealer=randomUUID(),owner=randomUUID(),admin=randomUUID(),sales=randomUUID(),accountant=randomUUID(),agency=randomUUID(),customer=randomUUID(),vehicle=randomUUID();
  const users=[[owner,'owner'],[admin,'admin'],[sales,'sales'],[accountant,'accountant'],[agency,'agency']];
  for(const [id,role] of users) await db.query('insert into auth.users(id,email) values($1,$2)',[id,role+'@permissions.test']);
  for(const [id,slug] of [[dealer,'price-test'],[otherDealer,'price-other']]) await db.query("insert into dealers(id,name,slug,modules) values($1,'TEST ONLY',$2,'{\"sales\":true}')",[id,slug]);
  for(const [id,role] of users) await db.query('insert into dealer_members(dealer_id,user_id,role) values($1,$2,$3)',[dealer,id,role]);
  await db.query("insert into customers(id,dealer_id,name) values($1,$2,'Test customer')",[customer,dealer]);
  await db.query("insert into vehicles(id,dealer_id,make,model,year,km,sale_price,status) values($1,$2,'Ford','Focus',2020,1000,10000,'ready_for_sale')",[vehicle,dealer]);
  const actor=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
  const allowed=async id=>{await actor(id);return (await db.query("select commercial_allowed($1,'price') price, commercial_allowed($1,'work') work, price_adjustment_allowed($2) other",[dealer,otherDealer])).rows[0];};
  for(const id of [owner,admin]) {const p=await allowed(id);assert.equal(p.price,true);assert.equal(p.other,false);}
  for(const id of [sales,accountant,agency]) {const p=await allowed(id);assert.equal(p.price,false);assert.equal(p.other,false);}
  for(const id of [sales,accountant]) assert.equal((await allowed(id)).work,true,'other permissions preserved');
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
  const profile=randomUUID();
  await db.query("insert into crm_roles(id,dealer_id,name,permissions) values($1,$2,'Sales Manager',array['read','work'])",[profile,dealer]);
  await db.query('update dealer_members set crm_role_id=$3 where dealer_id=$1 and user_id=$2',[dealer,sales,profile]);
  assert.equal((await allowed(sales)).price,false,'display name does not confer price authority');
  await actor(sales);
  const input={sale:{customerId:customer,vehicleId:vehicle,salespersonId:sales,salePrice:10000},terms:{},deposits:[],trades:[],agreement:false};
  const session=randomUUID();
  const save=async(revision=0,data=input)=>(await db.query('select autosave_new_deal($1,$2,$3,$4::jsonb,$5) result',[dealer,session,revision,JSON.stringify(data),randomUUID()])).rows[0].result;
  const created=await save();
  const notes=await save(1,{...input,sale:{...input.sale,notes:'Normal sales edit remains allowed'}});
  await assert.rejects(()=>save(2,{...input,sale:{...input.sale,salePrice:9000,priceReason:'Discount requested'}}),/commercial_not_allowed|price_mileage_not_allowed/);
  await assert.rejects(()=>db.query("select commercial_command($1,'price',$2,$3::jsonb,gen_random_uuid())",[dealer,created.id,JSON.stringify({price:9000,reason:'Discount request',version:notes.version})]),/commercial_not_allowed/);
  await actor(accountant);
  await assert.rejects(()=>db.query("select commercial_command($1,'price',$2,$3::jsonb,gen_random_uuid())",[dealer,created.id,JSON.stringify({price:9000,reason:'Discount request',version:notes.version})]),/commercial_not_allowed/);
  // Exercise actual field writes with an end-user JWT, just like definer RPCs.
  await db.exec('reset role');
  await assert.rejects(()=>db.query('update vehicles set km=2000 where id=$1',[vehicle]),/price_mileage_not_allowed/);
  await assert.rejects(()=>db.query('update vehicles set sale_price=9000 where id=$1',[vehicle]),/price_mileage_not_allowed/);
  await assert.rejects(()=>db.query('update deals set retail_price=9000 where id=$1',[created.id]),/price_mileage_not_allowed/);
  await assert.rejects(()=>db.query('update deal_orders set discount=100 where deal_id=$1',[created.id]),/price_mileage_not_allowed/);
  await assert.rejects(()=>db.query('update deal_orders set price=9000 where deal_id=$1',[created.id]),/price_mileage_not_allowed/);
  await assert.rejects(()=>db.query('insert into vehicle_trade_prices(vehicle_id,dealer_id,trade_price) values($1,$2,8000)',[vehicle,dealer]),/price_mileage_not_allowed/);
  await assert.rejects(()=>db.query("insert into vehicles(dealer_id,make,model,year,km,sale_price) values($1,'Ford','Test',2020,0,9000)",[dealer]),/price_mileage_not_allowed/);
  await db.query('update vehicles set km=km,sale_price=sale_price,model=$2 where id=$1',[vehicle,'Unrelated permitted field']);
  await actor(admin);await db.exec('reset role');
  await db.query('update vehicles set km=2000,sale_price=11000 where id=$1',[vehicle]);
  await db.query('update deals set retail_price=11000 where id=$1',[created.id]);
  await db.query('update deal_orders set price=11000,discount=100 where deal_id=$1',[created.id]);
  assert.equal((await db.query('select km,sale_price from vehicles where id=$1',[vehicle])).rows[0].km,2000);
  await db.query("update dealer_members set status='suspended' where dealer_id=$1 and user_id=$2",[dealer,admin]);
  await actor(admin);
  assert.equal((await db.query('select price_adjustment_allowed($1) allowed',[dealer])).rows[0].allowed,false);
  console.log('PASS price/mileage authorization: owner/admin authority, sales/accountant/agency denial, tenant isolation, active membership, autosave and other fields, actual price/discount/km writes and insert guards');
} finally {await db.close();}
