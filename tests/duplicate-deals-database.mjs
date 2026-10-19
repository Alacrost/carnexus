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
  for(const file of files.filter(f=>f<'085')) await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  const dealer=randomUUID(),owner=randomUUID(),customer=randomUUID(),otherCustomer=randomUUID(),vehicle=randomUUID(),otherVehicle=randomUUID();
  await db.query('insert into auth.users(id,email) values($1,$2)',[owner,'owner@example.test']);
  await db.query("insert into dealers(id,name,slug,modules) values($1,'Test dealer','duplicates-test','{\"sales\":true}')",[dealer]);
  await db.query("insert into dealer_members(dealer_id,user_id,role) values($1,$2,'owner')",[dealer,owner]);
  for(const id of [customer,otherCustomer]) await db.query("insert into customers(id,dealer_id,name) values($1,$2,'Same name is not identity')",[id,dealer]);
  for(const id of [vehicle,otherVehicle]) await db.query("insert into vehicles(id,dealer_id,make,model,year,sale_price,status) values($1,$2,'Ford','Focus',2020,10000,'ready_for_sale')",[id,dealer]);
  async function rawDeal(c=customer,v=vehicle,status='vehicle_interest') {
    const id=randomUUID();
    await db.transaction(async tx=>{
      await tx.query('insert into deals(id,dealer_id,deal_no,customer_id,status) values($1,$2,$3,$4,$5)',[id,dealer,id,c,status]);
      await tx.query("insert into deal_orders(dealer_id,deal_id,kind,vehicle_id) values($1,$2,'sale',$3)",[dealer,id,v]);
    });return id;
  }
  const legacy1=await rawDeal(),legacy2=await rawDeal();
  for(const file of files.filter(f=>f>='085')) await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  assert.equal((await db.query('select cardinality(deal_ids) n from open_deal_pairs')).rows[0].n,2,'legacy rows are preserved');
  await db.query("update deals set notes='Legacy remains editable' where id=$1",[legacy2]);
  await assert.rejects(()=>rawDeal(),/existing_open_deal/);
  const differentCustomer=await rawDeal(otherCustomer),differentVehicle=await rawDeal(customer,otherVehicle);
  await assert.rejects(()=>db.query('update deals set customer_id=$1 where id=$2',[customer,differentCustomer]),/existing_open_deal/);
  await assert.rejects(()=>db.query('update deal_orders set vehicle_id=$1 where deal_id=$2',[vehicle,differentVehicle]),/existing_open_deal|sale_vehicle_locked/);
  await assert.rejects(()=>db.query("insert into deal_orders(dealer_id,deal_id,kind,vehicle_id) values($1,$2,'sale',$3)",[dealer,differentVehicle,vehicle]),/existing_open_deal/);
  await db.query("update deals set status='cancelled' where id=$1",[legacy1]);
  await assert.rejects(()=>rawDeal(),/existing_open_deal/);
  await db.query("update deals set status='completed' where id=$1",[legacy2]);
  const replacement=await rawDeal();
  await assert.rejects(()=>db.query("update deals set status='vehicle_interest' where id=$1",[legacy1]),/existing_open_deal/);
  await db.query("update deals set status='reversed' where id=$1",[replacement]);
  await db.query("update deals set status='vehicle_interest' where id=$1",[legacy1]);
  assert.equal((await db.query('select deal_ids from open_deal_pairs where customer_id=$1 and vehicle_id=$2',[customer,vehicle])).rows[0].deal_ids[0],legacy1);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
  await db.exec('set role authenticated');
  await assert.rejects(()=>db.query('select * from open_deal_pairs'),/permission denied/);
  const snapshot={sale:{customerId:customer,vehicleId:vehicle,salespersonId:owner,salePrice:10000},terms:{},deposits:[{amount:100,method:'cash',paidOn:'2026-10-04'}],trades:[],agreement:true};
  const session=randomUUID(),request=randomUUID();
  const autosave=(s=session,r=request,input=snapshot)=>db.query('select autosave_new_deal($1,$2,0,$3::jsonb,$4) result',[dealer,s,JSON.stringify(input),r]);
  const reused=(await autosave()).rows[0].result;
  assert.equal(reused.existingDeal.id,legacy1);
  assert.deepEqual((await autosave()).rows[0].result,reused);
  await assert.rejects(()=>autosave(session,request,{...snapshot,agreement:false}),/request_reused/);
  const attempts=await Promise.all(Array.from({length:6},()=>autosave(randomUUID(),randomUUID())));
  assert.ok(attempts.every(x=>x.rows[0].result.existingDeal.id===legacy1));
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int n from new_deal_sessions')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from payments')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from deal_documents')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from deals')).rows[0].n,5,'failed creates rolled back');
  const newPairSnapshot={...snapshot,sale:{...snapshot.sale,customerId:otherCustomer,vehicleId:otherVehicle},deposits:[],agreement:false};
  assert.equal((await db.query("select count(*)::int n from deals d join deal_orders o on o.deal_id=d.id where d.customer_id=$1 and o.vehicle_id=$2 and o.kind='sale'",[otherCustomer,otherVehicle])).rows[0].n,0);
  await db.exec('set role authenticated');
  // Concurrent callers enter the same disposable PGlite connection's queue.
  // This exercises first-create/reuse behavior, not multi-connection lock timing.
  const firstAttempts=await Promise.all(Array.from({length:6},()=>autosave(randomUUID(),randomUUID(),newPairSnapshot)));
  const firstResults=firstAttempts.map(x=>x.rows[0].result);
  const created=firstResults.filter(x=>x.id);
  assert.equal(created.length,1,'only one new session creates the initial Deal');
  assert.equal(firstResults.filter(x=>x.existingDeal?.id===created[0].id).length,5);
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int n from deals')).rows[0].n,6);
  assert.equal((await db.query("select count(*)::int n from deals d join deal_orders o on o.deal_id=d.id where d.customer_id=$1 and o.vehicle_id=$2 and o.kind='sale'",[otherCustomer,otherVehicle])).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int n from new_deal_sessions where deal_id=$1',[created[0].id])).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int n from payments')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from deal_documents')).rows[0].n,0);
  console.log('PASS duplicate Deal guards: legacy preservation, UUID identity, order/customer updates, terminal release, reopen protection, first-create/reuse requests, replay and no financial side effects');
} finally {await db.close();}
