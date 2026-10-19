-- A quotation precedes a Deal: issuing one never reserves the vehicle or creates an SO.
create table public.sales_quotes (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  quote_no text not null,
  customer_id uuid not null references public.customers(id),
  vehicle_id uuid not null references public.vehicles(id),
  salesperson_id uuid not null references auth.users(id),
  location_id uuid references public.dealer_locations(id),
  lead_id uuid references public.leads(id),
  source text,
  sale_price numeric(14,2) not null check (sale_price>0),
  price_reason text,
  currency text not null,
  vat_scheme text not null check (vat_scheme in ('standard','margin','none')),
  valid_days integer not null check (valid_days between 1 and 365),
  issued_on date not null default current_date,
  valid_until date not null,
  status text not null default 'open' check (status in ('open','converted')),
  deal_id uuid unique references public.deals(id),
  converted_at timestamptz,
  conversion_request_id uuid,
  snapshot jsonb not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(dealer_id,quote_no),
  check (valid_until=issued_on+valid_days-1)
);
create index sales_quotes_status_expiry on public.sales_quotes(dealer_id,status,valid_until desc);
alter table public.sales_quotes enable row level security;
revoke all on public.sales_quotes from anon,authenticated;
grant select on public.sales_quotes to authenticated;
create policy sales_quotes_read on public.sales_quotes for select
  using (public.commercial_allowed(dealer_id,'read'));

create table public.sales_quote_requests (
  dealer_id uuid not null references public.dealers(id),request_id uuid not null,
  input jsonb not null,result jsonb not null,primary key(dealer_id,request_id)
);
revoke all on public.sales_quote_requests from anon,authenticated;

create function public.create_sales_quote(p_dealer uuid,p_input jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare cached public.sales_quote_requests; v public.vehicles; c public.customers;
  s public.document_settings; warranty public.dealer_warranty_presets;
  lender public.dealer_finance_companies; q public.sales_quotes; rep_name text;
  price numeric; window_price numeric; days integer; chosen_on date;
  chosen_rep uuid; chosen_location uuid; chosen_lead uuid; quote_number text;
  warranty_snapshot jsonb; finance_snapshot jsonb; snap jsonb; result jsonb;
begin
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'work') then raise exception 'commercial_not_allowed'; end if;
  if p_request is null or p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>30000 then raise exception 'invalid_request'; end if;
  perform 1 from public.dealers where id=p_dealer for update;
  select * into cached from public.sales_quote_requests where dealer_id=p_dealer and request_id=p_request;
  if found then
    if cached.input<>p_input then raise exception 'request_reused'; end if;
    return cached.result;
  end if;
  select * into c from public.customers where id=nullif(p_input->>'customerId','')::uuid and dealer_id=p_dealer and deleted_at is null;
  if not found then raise exception 'customer_missing'; end if;
  select * into v from public.vehicles where id=nullif(p_input->>'vehicleId','')::uuid and dealer_id=p_dealer for share;
  if not found or v.status='sold' then raise exception 'vehicle_unavailable'; end if;
  price:=nullif(p_input->>'salePrice','')::numeric;
  window_price:=v.sale_price;
  if price is null or price<=0 or price>100000000 or price<>round(price,2) then raise exception 'invalid_amount'; end if;
  if price is distinct from window_price and (not public.commercial_allowed(p_dealer,'price')
    or char_length(trim(coalesce(p_input->>'priceReason','')))<3) then raise exception 'price_permission_reason_required'; end if;
  if coalesce(p_input->>'vatScheme','') not in ('standard','margin','none') then raise exception 'invalid_vat_scheme'; end if;
  days:=nullif(p_input->>'validDays','')::integer;
  if days is null or days<1 or days>365 then raise exception 'quote_validity_required'; end if;
  if length(coalesce(p_input->>'quoteTerms',''))>500 or length(coalesce(p_input->>'notes',''))>2000
    or length(coalesce(p_input->>'financeTerms',''))>1000 then raise exception 'invalid_deal_terms'; end if;
  chosen_rep:=coalesce(nullif(p_input->>'salespersonId','')::uuid,auth.uid());
  if not exists(select 1 from public.dealer_members where dealer_id=p_dealer and user_id=chosen_rep and status='active'
    and role in ('owner','admin','sales')) then raise exception 'invalid_salesperson'; end if;
  select coalesce(nullif(trim(p.full_name),''),u.email) into rep_name
    from auth.users u left join public.profiles p on p.id=u.id where u.id=chosen_rep;
  chosen_location:=nullif(p_input->>'locationId','')::uuid;
  if chosen_location is not null and not exists(select 1 from public.dealer_locations
    where id=chosen_location and dealer_id=p_dealer and active) then raise exception 'invalid_location'; end if;
  chosen_lead:=nullif(p_input->>'leadId','')::uuid;
  if chosen_lead is not null and not exists(select 1 from public.leads
    where id=chosen_lead and dealer_id=p_dealer and customer_id=c.id) then raise exception 'invalid_lead'; end if;
  select * into s from public.document_settings where dealer_id=p_dealer;
  if s.dealer_id is null or length(trim(s.legal_name))<2 or length(trim(s.address))<5 then raise exception 'document_settings_required'; end if;
  if nullif(p_input->>'warrantyId','') is not null then
    select * into warranty from public.dealer_warranty_presets
      where id=(p_input->>'warrantyId')::uuid and dealer_id=p_dealer and active;
    if not found then raise exception 'warranty_preset_missing'; end if;
    warranty_snapshot:=jsonb_build_object('name',warranty.name,'terms',warranty.terms);
  end if;
  if nullif(p_input->>'financeCompanyId','') is not null then
    select * into lender from public.dealer_finance_companies
      where id=(p_input->>'financeCompanyId')::uuid and dealer_id=p_dealer and active;
    if not found then raise exception 'finance_company_missing'; end if;
    finance_snapshot:=jsonb_build_object('company',lender.name,'address',lender.invoice_address,
      'invoice_to_finance',coalesce((p_input->>'invoiceToFinance')::boolean,false));
  elsif coalesce((p_input->>'invoiceToFinance')::boolean,false) then raise exception 'finance_company_missing'; end if;
  chosen_on:=current_date;
  quote_number:=public.commercial_number(p_dealer,'SQU');
  snap:=jsonb_build_object('kind','quote','number',quote_number,'date',chosen_on,'valid_days',days,
    'valid_until',chosen_on+days-1,'currency',(select currency from public.dealers where id=p_dealer),
    'dealer',to_jsonb(s),'customer',jsonb_build_object('name',c.name,'company',c.business_name,
      'address',concat_ws(', ',c.address_line1,c.city,c.county,c.eircode),'phone',c.phone,'email',c.email),
    'salesperson',jsonb_build_object('id',chosen_rep,'name',coalesce(rep_name,'Sales representative')),
    'vehicle',jsonb_build_object('label',v.year||' '||v.make||' '||v.model,'reg',v.registration,'km',v.km),
    'sale_price',price,'window_price',window_price,'scheme',p_input->>'vatScheme',
    'quote_terms',nullif(trim(p_input->>'quoteTerms'),''),'deal_comments',nullif(trim(p_input->>'notes'),''),
    'finance_terms',nullif(trim(p_input->>'financeTerms'),''),'warranty',warranty_snapshot,'finance',finance_snapshot);
  insert into public.sales_quotes(dealer_id,quote_no,customer_id,vehicle_id,salesperson_id,location_id,lead_id,source,
    sale_price,price_reason,currency,vat_scheme,valid_days,issued_on,valid_until,snapshot,created_by)
    values(p_dealer,quote_number,c.id,v.id,chosen_rep,chosen_location,chosen_lead,left(p_input->>'source',80),
    price,nullif(left(trim(p_input->>'priceReason'),500),''),(select currency from public.dealers where id=p_dealer),
    p_input->>'vatScheme',days,chosen_on,chosen_on+days-1,snap,auth.uid()) returning * into q;
  result:=jsonb_build_object('id',q.id,'number',q.quote_no);
  insert into public.sales_quote_requests(dealer_id,request_id,input,result) values(p_dealer,p_request,p_input,result);
  insert into public.audit_logs(dealer_id,user_id,action,entity,entity_id,meta)
    values(p_dealer,auth.uid(),'sales_quote_issued','sales_quote',q.id,
      jsonb_build_object('number',q.quote_no,'customer_id',c.id,'vehicle_id',v.id,'valid_until',q.valid_until));
  return result;
end $$;
revoke all on function public.create_sales_quote(uuid,jsonb,uuid) from public,anon;
grant execute on function public.create_sales_quote(uuid,jsonb,uuid) to authenticated;

alter table public.deals add column source_quote_id uuid references public.sales_quotes(id);
grant select(source_quote_id) on public.deals to authenticated;
create unique index deals_source_quote_unique on public.deals(dealer_id,source_quote_id) where source_quote_id is not null;

alter function public.create_deal_from_sheet(uuid,jsonb,jsonb,jsonb,text,uuid)
  rename to create_deal_from_sheet_v073;
revoke all on function public.create_deal_from_sheet_v073(uuid,jsonb,jsonb,jsonb,text,uuid) from public,anon,authenticated;
create function public.create_deal_from_sheet(p_dealer uuid,p_sale jsonb,p_terms jsonb,p_finance jsonb,p_mode text,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare source_quote public.sales_quotes; result jsonb; source_id uuid;
begin
  source_id:=nullif(p_sale->>'sourceQuoteId','')::uuid;
  if source_id is null then
    return public.create_deal_from_sheet_v073(p_dealer,p_sale,p_terms,p_finance,p_mode,p_request);
  end if;
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'work') then raise exception 'commercial_not_allowed'; end if;
  perform 1 from public.dealers where id=p_dealer for update;
  select * into source_quote from public.sales_quotes where id=source_id and dealer_id=p_dealer for update;
  if not found then raise exception 'quote_missing'; end if;
  if source_quote.status='converted' and source_quote.conversion_request_id=p_request then
    return public.create_deal_from_sheet_v073(p_dealer,p_sale,p_terms,p_finance,p_mode,p_request);
  end if;
  if source_quote.status<>'open' or source_quote.valid_until<current_date then raise exception 'quote_not_open'; end if;
  if nullif(p_sale->>'customerId','')::uuid is distinct from source_quote.customer_id
    or nullif(p_sale->>'vehicleId','')::uuid is distinct from source_quote.vehicle_id then raise exception 'quote_parties_changed'; end if;
  result:=public.create_deal_from_sheet_v073(p_dealer,p_sale,p_terms,p_finance,p_mode,p_request);
  update public.sales_quotes set status='converted',deal_id=(result->>'id')::uuid,
    converted_at=now(),conversion_request_id=p_request where id=source_id;
  update public.deals set source_quote_id=source_id where id=(result->>'id')::uuid and dealer_id=p_dealer;
  insert into public.audit_logs(dealer_id,user_id,action,entity,entity_id,meta)
    values(p_dealer,auth.uid(),'sales_quote_converted','sales_quote',source_id,
      jsonb_build_object('deal_id',result->>'id','original_price',source_quote.sale_price,'deal_price',p_sale->>'salePrice'));
  return result;
end $$;
revoke all on function public.create_deal_from_sheet(uuid,jsonb,jsonb,jsonb,text,uuid) from public,anon;
grant execute on function public.create_deal_from_sheet(uuid,jsonb,jsonb,jsonb,text,uuid) to authenticated;
