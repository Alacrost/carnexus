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
    const session=randomUUID(),request=randomUUID();
    return {...(await db.query('select autosave_new_deal($1,$2,0,$3::jsonb,$4) result',[dealer,session,JSON.stringify(input),request])).rows[0].result,_replay:{session,request,input}};
  };
  const remove=async(payment,request=randomUUID())=>(await db.query('select remove_deal_payment($1,$2,$3) result',[dealer,payment,request])).rows[0].result;
  for(const method of ['cash','bank']){
    const deal=await create([{amount:100,method,paidOn:'2026-01-01',fundsConfirmed:false}]);
    await db.exec('reset role');
    const payment=(await db.query("select id from payments where deal_id=$1 and kind='deposit'",[deal.id])).rows[0].id;
    await db.exec('set role authenticated');
    const request=randomUUID();const removed=await remove(payment,request);
    assert.equal(removed.id,payment);assert.deepEqual(await remove(payment,request),removed);
    await db.exec('reset role');
    const events=(await db.query("select kind,detail from deal_events where deal_id=$1 and kind in ('payment_removed','receipt_reversed')",[deal.id])).rows;
    assert.equal(events.length,1);assert.equal(events[0].detail.reason,'Payment removed: entered incorrectly');assert.equal(Number(events[0].detail.amount),100);
    assert.equal((await db.query('select count(*)::int n from payments where id=$1',[payment])).rows[0].n,1,'audit retains original entry');
    if(method==='bank')assert.equal((await db.query('select clearance_status from payments where id=$1',[payment])).rows[0].clearance_status,'rejected');
    await db.exec('set role authenticated');
    await assert.rejects(()=>remove(payment),/receipt_already_rejected|receipt_not_pending/);
  }
  await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[randomUUID()]);await db.exec('set role authenticated');
  await assert.rejects(()=>remove(randomUUID()),/financial_reversal_not_allowed/);
  console.log('PASS: cash and pending transfer removal, log, replay, audit retention and unauthorized user.');
}finally{await db.close();}