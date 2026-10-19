import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';

// In-memory only: no credentials, remote connection or persistent demo database.
// Exercise both extension layouts and explicit hosted function defaults as well
// as opt-in exposure. No table defaults are added: existing minimal grants remain tested.
const internalTables=['customer_intake_requests','deal_sheet_requests','deal_sheet_trade_requests',
  'location_requests','new_deal_sessions','open_deal_pairs','sales_quote_requests'];
for(const cryptoSchema of ['public','extensions']) for(const functionDefaults of ['opt-in','explicit']) {
  const db=new PGlite({extensions:{pgcrypto}});
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema storage; create schema extensions;
      create extension pgcrypto with schema ${cryptoSchema};
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
      $$;
      grant usage on schema public,auth,storage to anon,authenticated;
      grant execute on function auth.uid() to anon,authenticated;
      create table storage.buckets(id text primary key,name text,public boolean);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
      alter table storage.objects enable row level security;
      create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
      grant execute on function storage.foldername(text) to anon,authenticated;
      alter default privileges revoke execute on functions from public;
    `);
    if(functionDefaults==='explicit')await db.exec('alter default privileges in schema public grant execute on functions to anon, authenticated');
    const migrations=(await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort();
    for(const file of migrations) {
      if(file.endsWith('_internal_request_rls_and_payment_acl.sql')) {
        assert.equal((await db.query("select has_function_privilege('anon','public.remove_deal_payment(uuid,uuid,uuid)','EXECUTE') allowed")).rows[0].allowed,functionDefaults==='explicit','reproduce explicit hosted anon grant before the fix');
      }
      try { await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8')); }
      catch(error){throw new Error(`${cryptoSchema}: migration ${file}: ${error.message}`);}
    }
    // Every new grant is intentional. Application forms need these operations;
    // all referenced tables must remain protected by RLS.
    const required={
      customers:['INSERT'],vehicle_photos:['SELECT','INSERT','DELETE'],
      brand_kits:['SELECT','INSERT','UPDATE'],business_profiles:['SELECT','INSERT','UPDATE'],
      dealer_integrations:['SELECT','INSERT','UPDATE'],promotions:['SELECT','INSERT','UPDATE'],
      ad_scripts:['SELECT','INSERT','DELETE'],description_templates:['SELECT','INSERT','DELETE'],
      campaign_templates:['SELECT','INSERT','DELETE'],background_templates:['SELECT','INSERT','DELETE'],
      overlay_patterns:['SELECT','INSERT','UPDATE','DELETE'],scheduled_content:['SELECT','INSERT','UPDATE','DELETE'],
      generated_descriptions:['INSERT'],campaigns:['INSERT'],
    };
    for(const [table,operations] of Object.entries(required)) {
      assert.equal((await db.query('select relrowsecurity from pg_class where oid=$1::regclass',[`public.${table}`])).rows[0].relrowsecurity,true);
      for(const operation of operations)assert.equal((await db.query("select has_table_privilege('authenticated',$1,$2) allowed",[`public.${table}`,operation])).rows[0].allowed,true,`${table}.${operation}`);
    }
    const query=(sql,args=[])=>db.query(sql,args);
    for(const table of internalTables) {
      assert.equal((await query('select relrowsecurity from pg_class where oid=$1::regclass',[`public.${table}`])).rows[0].relrowsecurity,true,`${table}: RLS enabled`);
      assert.equal((await query("select count(*)::int n from pg_policies where schemaname='public' and tablename=$1",[table])).rows[0].n,0,`${table}: no direct-access policies`);
      for(const role of ['anon','authenticated']) {
        assert.equal((await query("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') allowed",[role,`public.${table}`])).rows[0].allowed,false,`${role}: ${table} stays private`);
        assert.equal((await query("select has_any_column_privilege($1,$2,'SELECT,INSERT,UPDATE,REFERENCES') allowed",[role,`public.${table}`])).rows[0].allowed,false);
      }
    }
    assert.equal((await query("select has_function_privilege('anon','public.remove_deal_payment(uuid,uuid,uuid)','EXECUTE') allowed")).rows[0].allowed,false);
    assert.equal((await query("select has_function_privilege('authenticated','public.remove_deal_payment(uuid,uuid,uuid)','EXECUTE') allowed")).rows[0].allowed,true);
    const login=async(id,role='authenticated')=>{
      await db.exec('reset role');
      await query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);
      await db.exec(`set role ${role}`);
    };
    const denied=async(sql,args=[])=>assert.rejects(()=>query(sql,args),/permission denied|row-level security|not allowed|not_allowed|not_authorised/);
    const ids=Object.fromEntries(['owner','sales','agency','outsider','invitee','admin'].map(key=>[key,randomUUID()]));
    for(const [name,id] of Object.entries(ids))await query('insert into auth.users(id,email) values($1,$2)',[id,`${name}@example.test`]);
    await login(ids.owner);
    const dealer=(await query("select create_dealer_with_owner('Staging QA','staging-qa') id")).rows[0].id;
    await login(ids.outsider);
    const other=(await query("select create_dealer_with_owner('Other QA','other-qa') id")).rows[0].id;
    await db.exec('reset role');
    await query("select set_config('request.jwt.claim.sub',$1,false)",[ids.owner]);
    for(const role of ['sales','agency','admin'])await query('insert into dealer_members(dealer_id,user_id,role) values($1,$2,$3)',[dealer,ids[role],role]);
    const vehicle=randomUUID();
    await query("insert into vehicles(id,dealer_id,make,model,year) values($1,$2,'QA','Vehicle',2020)",[vehicle,dealer]);
    await login(ids.owner);

    // Actual contact/photo/studio operations that previously relied on defaults.
    const customer=(await query("insert into customers(dealer_id,name) values($1,'Test buyer') returning id",[dealer])).rows[0].id;
    const photo=(await query('insert into vehicle_photos(dealer_id,vehicle_id,storage_path) values($1,$2,$3) returning id',[dealer,vehicle,`${dealer}/${vehicle}/test.jpg`])).rows[0].id;
    assert.equal((await query('select storage_path from vehicle_photos where id=$1',[photo])).rows.length,1);
    await query('delete from vehicle_photos where id=$1',[photo]);
    await query('insert into vehicle_photos(id,dealer_id,vehicle_id,storage_path) values($1,$2,$3,$4)',[photo,dealer,vehicle,`${dealer}/${vehicle}/test.jpg`]);
    await query('insert into brand_kits(dealer_id) values($1)',[dealer]);
    await query("insert into dealer_integrations(dealer_id,website_url) values($1,'https://example.test')",[dealer]);
    assert.equal((await query('select dealer_id from brand_kits')).rows.length,1);
    await query("update vehicles set description='Reviewed description' where id=$1",[vehicle]);
    await denied('select buy_price from vehicles');
    await denied("update vehicles set status='sold' where id=$1",[vehicle]);
    await denied('update dealers set modules=modules where id=$1',[dealer]);
    for(const table of ['payments','purchase_orders','po_payments','vehicle_deals','vehicle_costs','dealer_members','invitations','deal_events']) {
      for(const operation of ['INSERT','UPDATE','DELETE'])assert.equal((await query('select has_table_privilege(current_user,$1,$2) allowed',[`public.${table}`,operation])).rows[0].allowed,false,`${table}.${operation}: direct writes stay blocked`);
    }
    const internalFunctions=(await query("select p.oid::regprocedure::text signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~ '^commercial_command_v[0-9]+$' or p.proname in ('commercial_number','commercial_totals','issue_commercial_document','sync_cancelled_deal_refunds','cancel_deal_with_refund_obligation'))")).rows;
    assert.ok(internalFunctions.length>5);
    for(const {signature} of internalFunctions)for(const role of ['anon','authenticated'])assert.equal((await query("select has_function_privilege($1,$2,'EXECUTE') allowed",[role,signature])).rows[0].allowed,false,`${role} cannot execute ${signature}`);
    await query("insert into promotions(dealer_id,title,status) values($1,'Draft QA','draft'),($1,'Public QA','active')",[dealer]);

    // The originally failing purchase path, read back through normal role grants.
    const command=async(kind,id,input={},request=randomUUID())=>(await query('select commercial_command($1,$2,$3,$4::jsonb,$5) result',[dealer,kind,id,JSON.stringify(input),request])).rows[0].result;
    const purchase={newVendor:{name:'Disposable supplier'},make:'QA',model:'Purchase',year:2020,registration:'STAGING-QA',km:1000,price:8000,vatScheme:'margin',invRef:'QA-PO',purchaseDate:'2026-10-01',receivedOn:'2026-10-01',settlement:0};
    const po=await command('purchase',null,purchase);
    assert.equal((await query('select vehicle_id from purchase_orders where id=$1',[po.id])).rows[0].vehicle_id,po.vehicleId);
    assert.equal((await query('select originating_po_id from vehicles where id=$1',[po.vehicleId])).rows[0].originating_po_id,po.id);
    assert.ok((await query('select purchase_balances($1) data',[dealer])).rows[0].data.some(row=>row.id===po.id));
    await command('document_settings',null,{legal_name:'TEST ONLY',address:'Disposable test address',agreement_terms:'Test terms',invoice_notes:'TEST ONLY',vat_number:'TEST'});
    const deal=await command('sale',null,{vehicleId:po.vehicleId,customerId:customer,salePrice:10000,priceReason:'Initial test price',salespersonId:ids.owner});
    await command('payment',deal.id,{amount:100,kind:'deposit',method:'cash'});
    const payment=(await query("select id from payments where deal_id=$1 and kind='deposit'",[deal.id])).rows[0].id;
    await query('select remove_deal_payment($1,$2,$3)',[dealer,payment,randomUUID()]);
    assert.equal((await query('select id from payments where id=$1',[payment])).rows.length,1,'correction preserves original receipt');
    assert.equal((await query("select count(*)::int n from deal_events where deal_id=$1 and kind in ('payment_removed','receipt_reversed')",[deal.id])).rows[0].n,1);

    // Creation, rotation, acceptance and audit all resolve the actual pgcrypto schema.
    const token=(await query("select create_invitation($1,'invitee@example.test','sales') token",[dealer])).rows[0].token;
    const invite=(await query("select id from invitations where dealer_id=$1 and email='invitee@example.test'",[dealer])).rows[0].id;
    const rotated=(await query("select team_command($1,'resend_invitation',$2,'{}') result",[dealer,invite])).rows[0].result.token;
    assert.notEqual(token,rotated);
    await login(ids.admin);
    await assert.rejects(()=>query("select create_invitation($1,'owner-escalation@example.test','owner')",[dealer]),/admins cannot invite owners/);
    await login(ids.invitee);
    await assert.rejects(()=>query('select accept_invitation($1)',[token]),/invitation invalid or expired/);
    assert.equal((await query('select accept_invitation($1) dealer',[rotated])).rows[0].dealer,dealer);
    await assert.rejects(()=>query('select accept_invitation($1)',[rotated]),/invitation invalid or expired/);

    await login(ids.sales);
    await denied("insert into brand_kits(dealer_id) values($1)",[other]);
    assert.equal((await query("update brand_kits set tone_of_voice='blocked' where dealer_id=$1 returning dealer_id",[dealer])).rows.length,0);
    await denied('insert into vehicle_photos(dealer_id,vehicle_id,storage_path) values($1,$2,$3)',[dealer,vehicle,`${dealer}/blocked.jpg`]);
    assert.equal((await query('delete from vehicle_photos where id=$1 returning id',[photo])).rows.length,0);
    await denied("select create_invitation($1,'unauthorized@example.test','sales')",[dealer]);
    await login(ids.agency);
    assert.equal((await query('select id from customers where id=$1',[customer])).rows.length,0);
    await query("update brand_kits set tone_of_voice='Professional' where dealer_id=$1",[dealer]);
    assert.equal((await query('select dealer_id from dealer_integrations where dealer_id=$1',[dealer])).rows.length,0);
    await login(ids.outsider);
    assert.equal((await query('select id from customers where dealer_id=$1',[dealer])).rows.length,0);
    assert.equal((await query('select dealer_id from brand_kits where dealer_id=$1',[dealer])).rows.length,0);
    assert.equal((await query('select id from vehicle_photos where id=$1',[photo])).rows.length,0);
    await denied("insert into customers(dealer_id,name) values($1,'Cross tenant')",[dealer]);
    await denied("select create_invitation($1,'cross@example.test','sales')",[dealer]);
    await login(null,'anon');
    await assert.rejects(()=>query('select remove_deal_payment($1,$2,$3)',[dealer,payment,randomUUID()]),/permission denied for function remove_deal_payment/);
    assert.deepEqual((await query('select title from promotions order by title')).rows,[{title:'Public QA'}]);
    await denied('select created_by from promotions');
    await denied('select id from customers');
    await denied('select dealer_id from brand_kits');
    await denied("select create_dealer_with_owner('Anonymous','anonymous')");
    await denied("select create_invitation($1,'anon@example.test','sales')",[dealer]);
    await denied('select accept_invitation($1)',[rotated]);
    await db.exec('reset role');
    assert.equal((await query("select count(*)::int n from audit_logs where dealer_id=$1 and action='invitation_accepted'",[dealer])).rows[0].n,1);
    // Do not allow definer search paths to acquire an untrusted extension schema.
    await db.exec(`grant create on schema ${cryptoSchema} to authenticated`);
    const compatibility=migrations.find(file=>file.endsWith('_explicit_api_grants_and_invitation_crypto.sql'));
    const readCompatibility=await readFile(new URL('../supabase/migrations/'+compatibility,import.meta.url),'utf8');
    await assert.rejects(()=>db.exec(readCompatibility),/untrusted_invitation_search_path/);
    console.log(`PASS staging readiness: ${migrations.length} migrations, ${functionDefaults} function grants, private-table RLS, tenant/role boundaries, payment removal and invitation lifecycle with pgcrypto in ${cryptoSchema}`);
  } catch(error) {
    console.error(`FAIL staging readiness (${cryptoSchema}, ${functionDefaults}): ${error.message}`);
    if(error.query)console.error(error.query);
    if(error.where)console.error(error.where);
    process.exitCode=1;
    break;
  } finally {await db.close();}
}
