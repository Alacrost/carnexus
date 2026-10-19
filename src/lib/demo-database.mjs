// Local-only PostgreSQL sandbox. It never accepts a remote database URL.
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {mkdir,readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';

export function demoEntityId(value){
  if(!value||/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value))return value;
  const hex=createHash('sha256').update(`autonexus-local-demo:${value}`).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
const identifier=value=>{if(!/^[a-z_][a-z0-9_]*$/i.test(value))throw new Error('Unsupported local demo query');return `"${value}"`;};
const errorResult=error=>({data:null,error:{message:error.message??'Local demo operation failed',code:error.code??'DEMO_LOCAL'},count:null});

export async function openDemoDatabase({dataDir,migrationsDir,seed}){
  if(/^[a-z]+:\/\//i.test(dataDir))throw new Error('Demo database must be a local directory');
  await mkdir(resolve(dataDir),{recursive:true});
  const db=new PGlite(resolve(dataDir),{extensions:{pgcrypto}});
  try{
    await db.exec('create schema if not exists demo_meta; create table if not exists demo_meta.migrations(name text primary key,hash text not null);');
    const initialized=await db.query("select 1 from pg_namespace where nspname='auth'");
    if(!initialized.rows.length)await db.exec(`
      create role anon; create role authenticated; create schema auth; create schema storage;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
      grant usage on schema public,auth,storage to anon,authenticated;
      grant execute on function auth.uid() to anon,authenticated;
      create table storage.buckets(id text primary key,name text,public boolean);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
      alter table storage.objects enable row level security;
      create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1,'/'); $$;
      alter default privileges in schema public grant all on tables to authenticated,anon;
    `);
    for(const name of (await readdir(migrationsDir)).filter(x=>/^\d+.*\.sql$/.test(x)).sort()){
      const sql=await readFile(resolve(migrationsDir,name),'utf8');const hash=createHash('sha256').update(sql).digest('hex');
      const existing=await db.query('select hash from demo_meta.migrations where name=$1',[name]);
      if(existing.rows.length){if(existing.rows[0].hash!==hash)throw new Error(`Local demo migration ${name} changed after application. Preserve the existing demo database and use a new migration.`);continue;}
      await db.transaction(async tx=>{await tx.exec(sql);await tx.query('insert into demo_meta.migrations(name,hash) values($1,$2)',[name,hash]);});
    }
    await db.transaction(async tx=>{
      const existing=await tx.query('select id from public.dealers where id=$1',[seed.dealerId]);
      if(existing.rows.length)return;
      for(const [index,staff] of seed.staff.entries()){
        const id=index===0?seed.ownerId:`00000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`;
        await tx.query('insert into auth.users(id,email) values($1,$2)',[id,`demo-staff-${index}@example.test`]);
        await tx.query('update public.profiles set full_name=$2 where id=$1',[id,staff.name]);
      }
      await tx.query("insert into public.dealers(id,name,slug,plan,modules) values($1,'Demo Motors — TEST ONLY','demo-local','professional','{\"sales\":true,\"marketing\":true,\"website\":true}')",[seed.dealerId]);
      for(const [index,staff] of seed.staff.entries())await tx.query('insert into public.dealer_members(dealer_id,user_id,role) values($1,$2,$3)',[seed.dealerId,index===0?seed.ownerId:`00000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,staff.role]);
      for(const customer of seed.customers)await tx.query('insert into public.customers(id,dealer_id,name,type,phone,email,address_line1) values($1,$2,$3,$4,$5,$6,$7)',[demoEntityId(customer.id),seed.dealerId,customer.name,customer.type,customer.phone,customer.email,'Demo address — test data only']);
      for(const lead of seed.leads.slice(0,4))await tx.query('insert into public.leads(id,dealer_id,title,source,stage) values($1,$2,$3,$4,$5)',[demoEntityId(lead.id),seed.dealerId,lead.notes,lead.source,lead.stage]);
      // Seed cars as-is; purchase readiness is never invented. Missing POs still
      // block invoice completion until the user creates a local test PO.
      for(const vehicle of seed.vehicles)await tx.query('insert into public.vehicles(id,dealer_id,make,model,year,km,registration,fuel,transmission,sale_price,status) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[demoEntityId(vehicle.id),seed.dealerId,vehicle.make,vehicle.model,vehicle.year,vehicle.km,vehicle.registration,vehicle.fuel,vehicle.transmission,vehicle.sale_price,vehicle.status]);
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[seed.ownerId]);
      await tx.exec('set local role authenticated');
      await tx.query("select public.commercial_command($1,'document_settings',null,$2::jsonb,gen_random_uuid())",[seed.dealerId,JSON.stringify({legal_name:'DEMO MOTORS — TEST ONLY',address:'Local demonstration — not a real transaction',agreement_terms:'TEST DOCUMENT — no legal or financial transaction. Do not send to real customers.',invoice_notes:'TEST ONLY',vat_number:'DEMO-NOT-VALID'})]);
    });
  }catch(error){await db.close();throw error;}

  const run=async(sql,params=[])=>db.transaction(async tx=>{
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[seed.ownerId]);
    await tx.exec('set local role authenticated');
    const result=await tx.query(sql,params);
    // Match the JSON transport used by Supabase (not native Date/numeric strings).
    result.rows=result.rows.map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[
      key,value instanceof Date?(result.fields.find(field=>field.name===key)?.dataTypeID===1082?value.toISOString().slice(0,10):value.toISOString()):result.fields.find(field=>field.name===key)?.dataTypeID===1700&&value!==null?Number(value):value,
    ])));
    return result;
  });
  class Query {
    constructor(table){this.table=identifier(table);this.fields='*';this.filters=[];this.values=[];this.sort=[];this.max=null;this.one=false;this.exact=false;}
    select(fields='*',options={}){this.fields=fields.split(',').map(x=>x.trim()==='*'?'*':identifier(x.trim())).join(',');this.exact=options.count==='exact';return this;}
    where(field,operator,value){this.values.push(value);this.filters.push(`${identifier(field)} ${operator} $${this.values.length}`);return this;}
    eq(field,value){return this.where(field,'=',value);}
    neq(field,value){return this.where(field,'<>',value);}
    gt(field,value){return this.where(field,'>',value);}
    gte(field,value){return this.where(field,'>=',value);}
    lt(field,value){return this.where(field,'<',value);}
    lte(field,value){return this.where(field,'<=',value);}
    is(field,value){if(value!==null)throw new Error('Unsupported demo filter');this.filters.push(`${identifier(field)} is null`);return this;}
    in(field,values){if(!values.length){this.filters.push('false');return this;}const slots=values.map(value=>{this.values.push(value);return `$${this.values.length}`;});this.filters.push(`${identifier(field)} in (${slots.join(',')})`);return this;}
    not(field,op,value){if(op!=='in')throw new Error('Unsupported demo filter');const values=value.replace(/^\(|\)$/g,'').split(',');const slots=values.map(v=>{this.values.push(v);return `$${this.values.length}`;});this.filters.push(`${identifier(field)} not in (${slots.join(',')})`);return this;}
    or(expression){const clauses=expression.split(',').map(part=>{const m=part.match(/^([a-z_]+)\.ilike\.(.*)$/i);if(!m)throw new Error('Unsupported demo search');this.values.push(m[2]);return `${identifier(m[1])} ilike $${this.values.length}`;});this.filters.push(`(${clauses.join(' or ')})`);return this;}
    order(field,options={}){this.sort.push(`${identifier(field)} ${options.ascending===false?'desc':'asc'}`);return this;}
    limit(value){if(!Number.isInteger(value)||value<0||value>10000)throw new Error('Invalid demo limit');this.max=value;return this;}
    maybeSingle(){this.one=true;return this;}
    single(){this.one=true;return this;}
    async execute(){try{const result=await run(`select ${this.fields} from public.${this.table}${this.filters.length?' where '+this.filters.join(' and '):''}${this.sort.length?' order by '+this.sort.join(','):''}${this.max!==null?' limit '+this.max:''}`,this.values);if(this.one&&result.rows.length>1)throw new Error('Expected one demo record');return{data:this.one?result.rows[0]??null:result.rows,error:null,count:this.exact?result.rows.length:null};}catch(error){return errorResult(error);}}
    then(resolve,reject){return this.execute().then(resolve,reject);}
  }
  return {
    from:table=>new Query(table),
    async rpc(name,args={}){try{
      const entries=Object.entries(args);const sql=`select public.${identifier(name)}(${entries.map(([key],i)=>`${identifier(key)} => $${i+1}`).join(',')}) as result`;
      const result=await run(sql,entries.map(([key,value])=>key==='p_kinds'&&Array.isArray(value)?value:value&&typeof value==='object'?JSON.stringify(value):value));
      return{data:result.rows[0]?.result??null,error:null};
    }catch(error){return errorResult(error);}},
    close:()=>db.close(),
  };
}
