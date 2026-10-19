-- Reusable business terms and finance recipients, with a per-deal snapshot.
create table public.dealer_warranty_presets (
  id uuid primary key default gen_random_uuid(), dealer_id uuid not null references public.dealers(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 100),
  terms text not null check (char_length(trim(terms)) between 5 and 3000),
  active boolean not null default true, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), created_by uuid references auth.users(id),
  unique (dealer_id,name)
);
create table public.dealer_finance_companies (
  id uuid primary key default gen_random_uuid(), dealer_id uuid not null references public.dealers(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 120),
  invoice_address text not null check (char_length(trim(invoice_address)) between 5 and 500),
  active boolean not null default true, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), created_by uuid references auth.users(id),
  unique (dealer_id,name)
);
alter table public.dealer_warranty_presets enable row level security;
alter table public.dealer_finance_companies enable row level security;
revoke all on public.dealer_warranty_presets,public.dealer_finance_companies from anon,authenticated;
grant select on public.dealer_warranty_presets,public.dealer_finance_companies to authenticated;
create policy dealer_warranty_presets_read on public.dealer_warranty_presets for select
  using (public.commercial_allowed(dealer_id,'read'));
create policy dealer_finance_companies_read on public.dealer_finance_companies for select
  using (public.commercial_allowed(dealer_id,'read'));

alter table public.deals add column quote_terms text,
  add column deal_comments text,
  add column finance_terms text,
  add column warranty_name text,
  add column warranty_terms text;
grant select(quote_terms,deal_comments,finance_terms,warranty_name,warranty_terms) on public.deals to authenticated;

create function public.deal_reference_command(p_dealer uuid,p_kind text,p_id uuid,p_name text,p_text text,p_active boolean)
returns uuid language plpgsql security definer set search_path=public as $$
declare result uuid; old_row jsonb;
begin
  if auth.uid() is null or coalesce(public.user_role_in(p_dealer)::text,'') not in ('owner','admin')
    then raise exception 'commercial_not_allowed'; end if;
  if p_kind='warranty' then
    if p_id is null then
      insert into public.dealer_warranty_presets(dealer_id,name,terms,created_by)
        values(p_dealer,trim(p_name),trim(p_text),auth.uid()) returning id into result;
    else
      select to_jsonb(w) into old_row from public.dealer_warranty_presets w where id=p_id and dealer_id=p_dealer;
      update public.dealer_warranty_presets set name=trim(p_name),terms=trim(p_text),active=p_active,updated_at=now()
        where id=p_id and dealer_id=p_dealer returning id into result;
    end if;
  elsif p_kind='finance' then
    if p_id is null then
      insert into public.dealer_finance_companies(dealer_id,name,invoice_address,created_by)
        values(p_dealer,trim(p_name),trim(p_text),auth.uid()) returning id into result;
    else
      select to_jsonb(f) into old_row from public.dealer_finance_companies f where id=p_id and dealer_id=p_dealer;
      update public.dealer_finance_companies set name=trim(p_name),invoice_address=trim(p_text),active=p_active,updated_at=now()
        where id=p_id and dealer_id=p_dealer returning id into result;
    end if;
  else raise exception 'invalid_reference_kind'; end if;
  if result is null then raise exception 'reference_missing'; end if;
  insert into public.audit_logs(dealer_id,user_id,action,entity,entity_id,meta)
    values(p_dealer,auth.uid(),'deal_reference_saved',p_kind,result,
      jsonb_build_object('before',old_row,'name',p_name,'text',p_text,'active',p_active));
  return result;
end $$;
revoke all on function public.deal_reference_command(uuid,text,uuid,text,text,boolean) from public,anon;
grant execute on function public.deal_reference_command(uuid,text,uuid,text,text,boolean) to authenticated;

alter function public.commercial_command(uuid,text,uuid,jsonb,uuid) rename to commercial_command_v072;
revoke all on function public.commercial_command_v072(uuid,text,uuid,jsonb,uuid) from public,anon,authenticated;
create function public.commercial_command(p_dealer uuid,p_command text,p_id uuid,p_input jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare d public.deals; w public.dealer_warranty_presets; result jsonb; cached public.commercial_requests;
  chosen_name text; chosen_terms text; old_state jsonb;
begin
  if p_command='document' and p_input->>'kind'='quote' then
    result:=public.commercial_command_v072(p_dealer,p_command,p_id,p_input,p_request);
    update public.deals set status='quoted',updated_at=now()
      where id=p_id and dealer_id=p_dealer and status='draft'
        and not exists(select 1 from public.payments where deal_id=p_id and kind='deposit');
    if found then
      insert into public.deal_events(dealer_id,deal_id,kind,detail,created_by)
        values(p_dealer,p_id,'quote_opened',jsonb_build_object('message','Quote issued without deposit or agreement','document_id',result->>'id'),auth.uid());
    end if;
    return result;
  end if;
  if p_command<>'deal_terms' then return public.commercial_command_v072(p_dealer,p_command,p_id,p_input,p_request); end if;
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'work') then raise exception 'commercial_not_allowed'; end if;
  if p_request is null or p_input is null or jsonb_typeof(p_input)<>'object' then raise exception 'invalid_request'; end if;
  perform 1 from public.dealers where id=p_dealer for update;
  select * into cached from public.commercial_requests where dealer_id=p_dealer and request_id=p_request;
  if found then
    if cached.command<>p_command or cached.input<>jsonb_build_object('id',p_id,'data',p_input) then raise exception 'request_reused'; end if;
    return cached.result;
  end if;
  select * into d from public.deals where id=p_id and dealer_id=p_dealer for update;
  if not found or d.status in ('completed','cancelled','reversed') then raise exception 'deal_closed'; end if;
  if (p_input->>'expectedVersion')::integer is distinct from d.version then raise exception 'stale_deal'; end if;
  if length(coalesce(p_input->>'quoteTerms',''))>500 or length(coalesce(p_input->>'notes',''))>2000
    or length(coalesce(p_input->>'financeTerms',''))>1000 then raise exception 'invalid_deal_terms'; end if;
  if nullif(p_input->>'warrantyId','') is not null then
    select * into w from public.dealer_warranty_presets
      where id=(p_input->>'warrantyId')::uuid and dealer_id=p_dealer and active;
    if not found then raise exception 'warranty_preset_missing'; end if;
    chosen_name:=w.name; chosen_terms:=w.terms;
  end if;
  old_state:=jsonb_build_object('quote_terms',d.quote_terms,'deal_comments',d.deal_comments,'finance_terms',d.finance_terms,
    'warranty_name',d.warranty_name,'warranty_terms',d.warranty_terms);
  update public.deals set quote_terms=nullif(trim(p_input->>'quoteTerms'),''),
    deal_comments=nullif(trim(p_input->>'notes'),''),finance_terms=nullif(trim(p_input->>'financeTerms'),''),
    warranty_name=chosen_name,warranty_terms=chosen_terms,
    version=version+1,updated_at=now() where id=d.id;
  result:=jsonb_build_object('id',d.id,'version',d.version+1);
  insert into public.deal_events(dealer_id,deal_id,kind,detail,created_by)
    values(p_dealer,d.id,'deal_terms_changed',jsonb_build_object('message','Quote terms or warranty updated',
      'before',old_state,'after',jsonb_build_object('quote_terms',p_input->>'quoteTerms','deal_comments',p_input->>'notes',
      'finance_terms',p_input->>'financeTerms',
      'warranty_name',chosen_name,'warranty_terms',chosen_terms)),auth.uid());
  insert into public.commercial_requests(dealer_id,request_id,command,input,result)
    values(p_dealer,p_request,p_command,jsonb_build_object('id',p_id,'data',p_input),result);
  return result;
end $$;
revoke all on function public.commercial_command(uuid,text,uuid,jsonb,uuid) from public,anon;
grant execute on function public.commercial_command(uuid,text,uuid,jsonb,uuid) to authenticated;

alter function public.issue_commercial_document(uuid,text) rename to issue_commercial_document_v072;
revoke all on function public.issue_commercial_document_v072(uuid,text) from public,anon,authenticated;
create function public.issue_commercial_document(p_deal uuid,p_kind text) returns uuid
language plpgsql security definer set search_path=public as $$
declare doc uuid; d public.deals;
begin
  doc:=public.issue_commercial_document_v072(p_deal,p_kind);
  if p_kind not in ('quote','agreement','invoice') then return doc; end if;
  select * into d from public.deals where id=p_deal;
  update public.deal_documents set snapshot=snapshot||jsonb_build_object(
    'quote_terms',d.quote_terms,'deal_comments',d.deal_comments,'finance_terms',d.finance_terms,
    'warranty',case when d.warranty_name is null then null else jsonb_build_object('name',d.warranty_name,'terms',d.warranty_terms) end)
    where id=doc and deal_id=p_deal;
  return doc;
end $$;
revoke all on function public.issue_commercial_document(uuid,text) from public,anon,authenticated;

-- The final Deal-sheet action is one transaction: no orphan Deal if document
-- settings or selected warranty make quote/agreement issuance fail.
create table public.deal_sheet_requests (
  dealer_id uuid not null references public.dealers(id),request_id uuid not null,
  input jsonb not null,result jsonb not null,primary key(dealer_id,request_id)
);
revoke all on public.deal_sheet_requests from public,anon,authenticated;
create function public.create_deal_from_sheet(p_dealer uuid,p_sale jsonb,p_terms jsonb,p_finance jsonb,p_mode text,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare cached public.deal_sheet_requests; deal_result jsonb; doc_result jsonb; result jsonb; d public.deals;
  payload jsonb;
begin
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'work') then raise exception 'commercial_not_allowed'; end if;
  if p_request is null or p_mode not in ('deal','quote','agreement','trade','edit') or p_sale is null then raise exception 'invalid_request'; end if;
  if p_mode in ('quote','agreement') and (jsonb_array_length(coalesce(p_sale->'deposits','[]'::jsonb))>0
    or coalesce((p_sale->>'depositAmount')::numeric,0)>0) then raise exception 'deposit_requires_deal'; end if;
  payload:=jsonb_build_object('sale',p_sale,'terms',p_terms,'finance',p_finance,'mode',p_mode);
  perform 1 from public.dealers where id=p_dealer for update;
  select * into cached from public.deal_sheet_requests where dealer_id=p_dealer and request_id=p_request;
  if found then
    if cached.input<>payload then raise exception 'request_reused'; end if;
    return cached.result;
  end if;
  deal_result:=public.commercial_command(p_dealer,'sale',null,p_sale,p_request);
  select * into d from public.deals where id=(deal_result->>'id')::uuid and dealer_id=p_dealer;
  if not found then raise exception 'deal_missing'; end if;
  if p_terms is not null then
    perform public.commercial_command(p_dealer,'deal_terms',d.id,p_terms||jsonb_build_object('expectedVersion',d.version),gen_random_uuid());
  end if;
  if p_finance is not null and p_finance<>'null'::jsonb then
    perform public.commercial_command(p_dealer,'finance',d.id,p_finance,gen_random_uuid());
  end if;
  if p_mode='quote' then
    doc_result:=public.commercial_command(p_dealer,'document',d.id,jsonb_build_object('kind','quote'),gen_random_uuid());
  elsif p_mode='agreement' then
    select * into d from public.deals where id=d.id;
    doc_result:=public.commercial_command(p_dealer,'force_agreement',d.id,jsonb_build_object('expectedVersion',d.version),gen_random_uuid());
  end if;
  result:=jsonb_build_object('id',d.id,'documentId',doc_result->>'id','mode',p_mode);
  insert into public.deal_sheet_requests(dealer_id,request_id,input,result) values(p_dealer,p_request,payload,result);
  return result;
end $$;
revoke all on function public.create_deal_from_sheet(uuid,jsonb,jsonb,jsonb,text,uuid) from public,anon;
grant execute on function public.create_deal_from_sheet(uuid,jsonb,jsonb,jsonb,text,uuid) to authenticated;
