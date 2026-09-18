import assert from 'node:assert/strict';
import { testCommercial } from './commercial-database.mjs';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

// Disposable real PostgreSQL engine; Supabase auth/storage schemas are minimal test scaffolding.
const db = new PGlite({extensions:{pgcrypto}});
try {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
    $$;
    grant usage on schema public,auth,storage to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;
    create table storage.buckets(id text primary key,name text,public boolean);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1,'/'); $$;
    alter default privileges in schema public grant all on tables to authenticated,anon;
  `);
  for (const file of (await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort()) {
    try { await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8')); }
    catch (error) { throw new Error(`Migration ${file}: ${error.message}`); }
  }
  const owner='00000000-0000-0000-0000-000000000001', sales='00000000-0000-0000-0000-000000000002', outsider='00000000-0000-0000-0000-000000000003', agency='00000000-0000-0000-0000-000000000004', admin='00000000-0000-0000-0000-000000000005';
  const dealer='00000000-0000-0000-0000-000000000010', other='00000000-0000-0000-0000-000000000020';
  const vehicle='00000000-0000-0000-0000-000000000030';
  await db.exec(`insert into auth.users(id,email) values ('${owner}','owner@example.test'),('${sales}','sales@example.test'),('${outsider}','other@example.test'),('${agency}','agency@example.test'),('${admin}','admin@example.test');
    insert into public.dealers(id,name,slug) values ('${dealer}','First dealer','first-dealer'),('${other}','Second dealer','second-dealer');
    insert into public.dealer_members(dealer_id,user_id,role) values ('${dealer}','${owner}','owner'),('${dealer}','${sales}','sales'),('${other}','${outsider}','owner'),('${dealer}','${agency}','agency'),('${dealer}','${admin}','admin');
    insert into public.vehicles(id,dealer_id,make,model,year) values ('${vehicle}','${other}','Ford','Focus',2020);`);
  async function login(id,role='authenticated') { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']); await db.exec(`set role ${role}`); }
  async function denied(fn,pattern) { await assert.rejects(fn,pattern); }
  const input={title:'Golf enquiry',customer_id:'',customer_name:'Test Buyer',email:'buyer@example.test',phone:'123',vehicle_id:'',assigned_to:sales,stage:'new',source:'facebook',score:'warm',notes:'Interested in finance',next_action:'Call buyer',next_action_at:'2026-09-16T10:00:00Z',lost_reason:''};
  const save=(id,version,payload=input)=>db.query('select public.save_crm_lead($1,$2,$3,$4::jsonb) as id',[dealer,id,version,JSON.stringify(payload)]);
  await login(outsider);
  await denied(()=>db.query("select create_invitation($1,'other@example.test','owner')",[dealer]),/not allowed/);
  await denied(()=>db.query('select spend_ai_credits($1,1)',[dealer]),/not_authorised/);
  await denied(()=>save(null,0),/crm_not_allowed/);
  await login(null,'anon');
  await denied(()=>db.query('select spend_ai_credits($1,1)',[dealer]),/permission denied/);
  await login(admin);
  await denied(()=>db.query("update dealer_members set role='owner' where dealer_id=$1 and user_id=$2",[dealer,admin]),/row-level security/);
  await login(owner);
  const profile=(await db.query("insert into crm_roles(dealer_id,name,permissions) values ($1,'Manager',array['read','work','assign','report']) returning id",[dealer])).rows[0].id;
  await db.query('update dealer_members set crm_role_id=$1 where dealer_id=$2 and user_id=$3',[profile,dealer,sales]);
  await login(sales);
  const lead=(await save(null,0)).rows[0].id;
  const row=(await db.query('select * from leads where id=$1',[lead])).rows[0];
  assert.equal(row.assigned_to,sales); assert.equal(row.version,1);
  assert.equal((await db.query('select * from lead_activities where lead_id=$1',[lead])).rows[0].created_by,sales);
  await denied(()=>db.query("update leads set stage='sold' where id=$1",[lead]),/permission denied/);
  await denied(()=>save(lead,1,{...input,customer_id:row.customer_id,vehicle_id:vehicle}),/invalid_vehicle/);
  await denied(()=>save(lead,1,{...input,customer_id:row.customer_id,assigned_to:outsider}),/invalid_assignee/);
  await denied(()=>save(lead,1,{...input,customer_id:row.customer_id,stage:'lost'}),/loss_reason_required/);
  await denied(()=>save(lead,1,{...input,customer_id:row.customer_id,stage:'sold'}),/completed_deal_required/);
  await save(lead,1,{...input,customer_id:row.customer_id,stage:'contacted'});
  await denied(()=>save(lead,1,{...input,customer_id:row.customer_id}),/stale_lead/);
  await db.query("select record_crm_activity($1,$2,'call','Discussed availability')",[dealer,lead]);
  assert.equal((await db.query('select count(*)::int as n from lead_activities where lead_id=$1',[lead])).rows[0].n,3);
  await denied(()=>db.query('delete from lead_activities where lead_id=$1',[lead]),/permission denied/);
  const report=(await db.query("select crm_report($1,'2020-01-01','2100-01-01') as data",[dealer])).rows[0].data;
  assert.equal(report.total,1); assert.equal(report.open,1); assert.equal(report.sources[0].label,'facebook');
  await login(agency);
  assert.equal((await db.query('select * from leads')).rows.length,0);
  await denied(()=>db.query("select crm_report($1,'2020-01-01','2100-01-01')",[dealer]),/crm_not_allowed/);
  await login(outsider);
  assert.equal((await db.query('select * from lead_activities')).rows.length,0);
  await login(owner);
  await db.query("update crm_roles set permissions='{}' where id=$1",[profile]);
  await login(sales);
  assert.equal((await db.query('select * from leads')).rows.length,0);
  await denied(()=>save(lead,2,{...input,customer_id:row.customer_id}),/crm_not_allowed/);
  await login(owner);
  await db.query('update dealer_members set crm_role_id=null where dealer_id=$1 and user_id=$2',[dealer,sales]);
  await login(sales);
  await denied(()=>save(lead,2,{...input,customer_id:row.customer_id,assigned_to:owner}),/assignment_not_allowed/);
  await save(lead,2,{...input,customer_id:row.customer_id,stage:'lost',lost_reason:'Bought elsewhere'});
  const closed=(await db.query('select next_action_at,version from leads where id=$1',[lead])).rows[0];
  assert.equal(closed.next_action_at,null); assert.equal(closed.version,3);
  await login(owner);
  // Invalid work rolls back the contact too if audit insertion fails at the end.
  await db.exec('reset role');
  await db.exec(`create function public.test_audit_failure() returns trigger language plpgsql as $$ begin raise exception 'test_audit_failure'; end $$;
    create trigger test_audit_failure before insert on public.lead_activities for each row execute function public.test_audit_failure();`);
  const before=(await db.query('select count(*)::int as n from customers')).rows[0].n;
  await login(owner);
  await denied(()=>save(null,0),/test_audit_failure/);
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int as n from customers')).rows[0].n,before);
  await db.exec('drop trigger test_audit_failure on public.lead_activities; drop function public.test_audit_failure();');
  await login(owner);
  assert.ok((await db.query("select count(*)::int as n from audit_logs where entity in ('crm_roles','dealer_members')")).rows[0].n>=4);
  await denied(()=>db.query("update dealers set ai_credits=999999 where id=$1",[dealer]),/permission denied/);
  await denied(()=>db.query("update dealers set modules='{}' where id=$1",[dealer]),/permission denied/);
  await db.exec('reset role');
  await db.query("update dealers set modules=jsonb_set(modules,'{website}','true') where id=$1",[other]);
  await db.query('insert into website_settings(dealer_id,enabled) values($1,true)',[other]);
  await db.query("update vehicles set status='ready_for_sale',buy_price=5000 where id=$1",[vehicle]);
  await login(null,'anon');
  assert.equal((await db.query('select make from vehicles where id=$1',[vehicle])).rows[0].make,'Ford');
  await denied(()=>db.query('select buy_price from vehicles where id=$1',[vehicle]),/permission denied/);
  await denied(()=>db.query('select ai_credits from dealers'),/permission denied/);
  assert.equal((await db.query("select name from public_dealer('second-dealer')")).rows[0].name,'Second dealer');
  await login(sales);
  await denied(()=>db.query('select buy_price from vehicles'),/permission denied/);
  await db.exec('reset role');
  await db.query("update dealers set modules='{}' where id=$1",[other]);
  await login(null,'anon');
  assert.equal((await db.query('select make from vehicles where id=$1',[vehicle])).rows.length,0);
  await db.exec('reset role');
  await db.query("update dealers set modules='{}' where id=$1",[dealer]);
  await login(owner);
  await denied(()=>save(null,0),/crm_not_allowed/);
  console.log('PASS: all migrations; cross-tenant denial; anonymous RPC denial; no admin escalation; atomic lead workflow; optimistic lock; immutable activities; reports; custom profile revocation; product gate.');
  await testCommercial(db,{owner,sales,outsider,dealer,login});
} finally { await db.close(); }
