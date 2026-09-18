-- All commercial writes run through a transaction with server-owned actor and audit.
alter table public.crm_roles drop constraint crm_roles_permissions_check;
alter table public.crm_roles add constraint crm_roles_permissions_check check
  (permissions <@ array['read','work','assign','report','price','cost','purchase','payment']::text[]);
create function public.commercial_allowed(p_dealer_id uuid,p_permission text) returns boolean
language sql stable security definer set search_path=public as $$
  select coalesce((select d.modules->>'sales'='true' and case
    when m.role in ('owner','admin') then true
    when m.role='accountant' then p_permission in ('read','work','payment','cost','purchase','price')
    when m.role='sales' and m.crm_role_id is null then p_permission in ('read','work','payment')
    when m.role='sales' then 'read'=any(r.permissions) and p_permission=any(r.permissions)
    else false end from dealer_members m join dealers d on d.id=m.dealer_id
    left join crm_roles r on r.id=m.crm_role_id and r.dealer_id=m.dealer_id
    where m.dealer_id=p_dealer_id and m.user_id=auth.uid() and m.status='active'),false);
$$;
revoke all on function public.commercial_allowed(uuid,text) from public,anon;
grant execute on function public.commercial_allowed(uuid,text) to authenticated;

alter table public.deals add column so_no text, add column version integer not null default 1,
  add column finance_company text, add column finance_reference text,
  add column finance_expected numeric(14,2) not null default 0 check(finance_expected>=0),
  add column finance_status text not null default 'none' check(finance_status in ('none','pending','approved')),
  add column invoice_to_finance boolean not null default false, add column finance_address text;
alter table public.purchase_orders add column due_on date, add column settlement_valid_until date, add column finance_company text,
  add column finance_reference text, add column settlement_due numeric(14,2) not null default 0 check(settlement_due>=0),
  add column trade_credit numeric(14,2) not null default 0,
  add column deal_id uuid references public.deals(id);
alter table public.po_payments add column recipient text not null default 'vendor' check(recipient in ('vendor','finance'));
alter table public.deal_orders add column order_no text;
alter table public.deal_documents add column deal_version integer;
alter table public.deal_addons add column vat_rate numeric(5,2) not null default 23 check(vat_rate in (0,9,13.5,23));
create unique index commercial_so_no on public.deals(dealer_id,so_no) where so_no is not null;
create table public.commercial_numbers(dealer_id uuid references dealers(id),kind text,next_no bigint not null,primary key(dealer_id,kind));
create table public.commercial_requests(dealer_id uuid references dealers(id),request_id uuid,command text,input jsonb,result jsonb,primary key(dealer_id,request_id));
alter table public.commercial_numbers enable row level security;
alter table public.commercial_requests enable row level security;
revoke all on public.commercial_numbers,public.commercial_requests from anon,authenticated;
revoke insert,update,delete on public.audit_logs from anon,authenticated;
create function public.commercial_number(p_dealer uuid,p_kind text) returns text
language plpgsql security definer set search_path=public as $$
declare n bigint; candidate text;
begin
  loop
    insert into commercial_numbers values(p_dealer,p_kind,1) on conflict(dealer_id,kind)
      do update set next_no=commercial_numbers.next_no+1 returning next_no into n;
    candidate:=p_kind||'-'||lpad(n::text,8,'0');
    exit when not exists(select 1 from deals where dealer_id=p_dealer and (deal_no=candidate or so_no=candidate))
      and not exists(select 1 from purchase_orders where dealer_id=p_dealer and po_no=candidate)
      and not exists(select 1 from deal_documents where dealer_id=p_dealer and number=candidate);
  end loop;
  return candidate;
end $$;
revoke all on function public.commercial_number(uuid,text) from public,anon,authenticated;

create table public.document_settings (
  dealer_id uuid primary key references dealers(id), legal_name text not null,
  address text not null, vat_number text, company_number text, phone text, email text,
  bank_details text, agreement_terms text, invoice_notes text
);
alter table public.document_settings enable row level security;
revoke all on public.document_settings from anon,authenticated;
grant select on public.document_settings to authenticated;
create policy document_settings_read on public.document_settings for select using(commercial_allowed(dealer_id,'read'));

-- The sale vehicle cannot be swapped even by an accidental future writer.
create function public.fixed_sale_vehicle() returns trigger language plpgsql as $$
begin
  if old.kind='sale' and (new.vehicle_id is distinct from old.vehicle_id or new.deal_id<>old.deal_id or new.dealer_id<>old.dealer_id or new.kind<>old.kind) then
    raise exception 'sale_vehicle_locked';
  end if; return new;
end $$;
create trigger fixed_sale_vehicle before update on public.deal_orders for each row execute function public.fixed_sale_vehicle();

-- Replace every permissive legacy write policy; table writes would bypass the ledger.
do $$ declare t text; p record; perm text; begin
  foreach t in array array['deals','deal_orders','payments','deal_events','deal_documents','deal_addons','purchase_orders','po_lines','po_payments'] loop
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy %I on public.%I',p.policyname,t);
    end loop;
    execute format('revoke all on public.%I from anon,authenticated',t);
    if t<>'deal_addons' then execute format('grant select on public.%I to authenticated',t); end if;
    perm:=case when t in ('purchase_orders','po_lines','po_payments') then 'purchase' else 'read' end;
    execute format('create policy commercial_read on public.%I for select using(public.commercial_allowed(dealer_id,%L))',t,perm);
  end loop;
end $$;
grant select(id,dealer_id,deal_id,kind,name,price,vat_rate,months,terms,created_by,created_at) on public.deal_addons to authenticated;

create function public.vehicle_purchase_cost(p_dealer uuid,p_vehicle uuid) returns numeric
language plpgsql stable security definer set search_path=public as $$
begin
  if not commercial_allowed(p_dealer,'cost') then raise exception 'commercial_not_allowed'; end if;
  return (select purchase_price from vehicle_deals where dealer_id=p_dealer and vehicle_id=p_vehicle);
end $$;
revoke all on function public.vehicle_purchase_cost(uuid,uuid) from public,anon;
grant execute on function public.vehicle_purchase_cost(uuid,uuid) to authenticated;

create function public.commercial_totals(p_deal uuid) returns jsonb
language sql stable security definer set search_path=public as $$
 select jsonb_build_object('total',coalesce(d.retail_price,0)+coalesce(a.total,0),
   'equity',d.siv_total,'paid',coalesce(p.paid,0),
   'balance',coalesce(d.retail_price,0)+coalesce(a.total,0)-d.siv_total-coalesce(p.paid,0))
 from deals d left join lateral(select sum(price) total from deal_addons where deal_id=d.id) a on true
 left join lateral(select sum(case when kind='refund' then -amount when kind='trade_allowance' then 0 else amount end) paid from payments where deal_id=d.id) p on true where d.id=p_deal;
$$;
revoke all on function public.commercial_totals(uuid) from public,anon,authenticated;

-- Private document builder; callers validate permission, lock deal and verify state.
create function public.issue_commercial_document(p_deal uuid,p_kind text) returns uuid
language plpgsql security definer set search_path=public as $$
declare d deals; o deal_orders; v vehicles; c customers; s document_settings; doc uuid; num text;
  totals jsonb; snapshot jsonb; lines jsonb; vat numeric; total numeric;
begin
  select * into strict d from deals where id=p_deal;
  select * into strict o from deal_orders where deal_id=d.id and kind='sale';
  select * into strict v from vehicles where id=o.vehicle_id and dealer_id=d.dealer_id;
  select * into strict c from customers where id=d.customer_id and dealer_id=d.dealer_id;
  select * into s from document_settings where dealer_id=d.dealer_id;
  if s.dealer_id is null or length(trim(s.legal_name))<2 or length(trim(s.address))<5 then raise exception 'document_settings_required'; end if;
  if d.invoice_to_finance and (coalesce(length(trim(d.finance_company)),0)<2 or coalesce(length(trim(d.finance_address)),0)<5) then raise exception 'finance_invoice_details_required'; end if;
  if p_kind='invoice' then
    if o.vat_scheme in ('standard','margin') and coalesce(length(trim(s.vat_number)),0)=0 then raise exception 'vat_registration_required'; end if;
    if coalesce(length(trim(c.address_line1)),0)=0 then raise exception 'customer_address_required'; end if;
    select id into doc from deal_documents where deal_id=d.id and kind='invoice' and status<>'void' limit 1;
    if doc is not null then return doc; end if;
  end if;
  totals:=commercial_totals(d.id); total:=(totals->>'total')::numeric;
  -- Margin-scheme tax is not disclosed on the customer invoice or guessed from prep costs.
  vat:=case when o.vat_scheme='standard' then round(o.price*23/123,2) else 0 end + coalesce((select sum(round(price*vat_rate/(100+vat_rate),2)) from deal_addons where deal_id=d.id),0);
  num:=commercial_number(d.dealer_id,case p_kind when 'invoice' then 'INV' when 'agreement' then 'AGR' else 'QUO' end);
  select jsonb_agg(x) into lines from (
    select jsonb_build_object('description',v.year||' '||v.make||' '||v.model||' ('||coalesce(v.registration,'')||')','gross',o.price,'vat_rate',case when o.vat_scheme='standard' then 23 else null end,'vat',case when o.vat_scheme='standard' then round(o.price*23/123,2) else 0 end) x
    union all select jsonb_build_object('description',name,'gross',price,'vat_rate',vat_rate,'vat',round(price*vat_rate/(100+vat_rate),2)) from deal_addons where deal_id=d.id
  ) l;
  snapshot:=jsonb_build_object('kind',p_kind,'number',num,'date',current_date,'currency',d.currency,
    'deal_no',d.deal_no,'so_no',d.so_no,'agreement_number',(select number from deal_documents where deal_id=d.id and kind='agreement' and deal_version=d.version order by created_at desc limit 1),'dealer',to_jsonb(s),
    'customer',jsonb_build_object('name',c.name,'company',c.business_name,'address',concat_ws(', ',c.address_line1,c.city,c.county,c.eircode),'phone',c.phone,'email',c.email,'vat_number',c.vat_number),
    'finance',jsonb_build_object('company',d.finance_company,'address',d.finance_address,'reference',d.finance_reference,'invoice_to_finance',d.invoice_to_finance),
    'vehicle',jsonb_build_object('label',v.year||' '||v.make||' '||v.model,'reg',v.registration,'km',v.km),
    'lines',lines,'retail',d.retail_price,'siv',d.siv_total,'sale',total,'scheme',o.vat_scheme,'deposits',(totals->>'paid')::numeric,
    'trade_ins',coalesce((select jsonb_agg(jsonb_build_object('allowance',price,'settlement',settlement_amount,'provider',settlement_provider,'equity',net_equity)) from deal_orders where deal_id=d.id and is_trade_in),'[]'::jsonb),
    'payments',coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'method',method,'amount',amount,'date',paid_on,'reference',reference)) from payments where deal_id=d.id),'[]'::jsonb),
    'figures',jsonb_build_object('costToChange',total-d.siv_total,'net',total-vat,'vat',vat,'vatRate',case when o.vat_scheme='standard' then 23 else 0 end,
      'vatLabel',case when o.vat_scheme='margin' then 'Add-ons only; vehicle margin VAT not disclosed' else 'See line rates' end,
      'subTotal',total,'invoiceTotal',total,'balanceInvoice',(totals->>'balance')::numeric,'balanceAgreement',(totals->>'balance')::numeric));
  insert into deal_documents(dealer_id,deal_id,kind,number,status,snapshot,printed_at,created_by,deal_version)
    values(d.dealer_id,d.id,p_kind,num,case when p_kind='invoice' and (totals->>'balance')::numeric=0 then 'paid' else 'printed' end,snapshot,now(),auth.uid(),d.version) returning id into doc;
  insert into deal_events(dealer_id,deal_id,kind,detail,created_by) values(d.dealer_id,d.id,'document_issued',jsonb_build_object('message',p_kind||' '||num,'document_id',doc),auth.uid());
  return doc;
end $$;
revoke all on function public.issue_commercial_document(uuid,text) from public,anon,authenticated;

create function public.commercial_command(p_dealer uuid,p_command text,p_id uuid,p_input jsonb,p_request uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare d deals; v vehicles; po purchase_orders; o deal_orders; c uuid; vehicle uuid; result jsonb; cached commercial_requests;
  id uuid; number text; amount numeric; settlement numeric; equity numeric; paid numeric; total numeric; balance numeric;
  v_recipient text; permission text; nc jsonb; source text; price numeric; doc uuid; old jsonb;
begin
  permission:=case when p_command in ('purchase','approve_purchase','vendor_payment') then 'purchase'
    when p_command='payment' then 'payment' when p_command='price' then 'price' else 'work' end;
  if auth.uid() is null or not commercial_allowed(p_dealer,permission) then raise exception 'commercial_not_allowed'; end if;
  if p_request is null or p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>30000 then raise exception 'invalid_request'; end if;
  -- ponytail: serialize a dealer's financial commands; split per-deal locks if throughput warrants.
  perform 1 from dealers where dealers.id=p_dealer for update;
  select * into cached from commercial_requests where dealer_id=p_dealer and request_id=p_request;
  if found then
    if cached.command<>p_command or cached.input<>jsonb_build_object('id',p_id,'data',p_input) then raise exception 'request_reused'; end if;
    return cached.result;
  end if;
  result:='{}'; id:=p_id;
  if p_command in ('sale','purchase','trade') then
    amount:=case when p_command='sale' then (p_input->>'salePrice')::numeric when p_command='trade' then (p_input->>'allowance')::numeric else (p_input->>'price')::numeric end;
    if amount is null or amount<=0 or amount>100000000 or amount<>round(amount,2) then raise exception 'invalid_amount'; end if;
  end if;
  if p_command='sale' then
    select * into v from vehicles where vehicles.id=(p_input->>'vehicleId')::uuid and dealer_id=p_dealer for update;
    if not found or v.status='sold' then raise exception 'vehicle_unavailable'; end if;
    if exists(select 1 from purchase_orders tp join deals td on td.id=tp.deal_id where tp.vehicle_id=v.id and td.status<>'completed') then raise exception 'trade_acquisition_pending'; end if;
    if exists(select 1 from deal_orders so join deals x on x.id=so.deal_id where so.vehicle_id=v.id and so.kind='sale' and x.status not in ('cancelled','completed')) then raise exception 'vehicle_has_open_deal'; end if;
    if amount is distinct from v.sale_price and (not commercial_allowed(p_dealer,'price') or coalesce(length(trim(p_input->>'priceReason')),0)<3) then raise exception 'price_permission_reason_required'; end if;
    if nullif(p_input->>'salespersonId','') is not null and not exists(select 1 from dealer_members where dealer_id=p_dealer and user_id=(p_input->>'salespersonId')::uuid and status='active' and role in ('owner','admin','sales')) then raise exception 'invalid_assignee'; end if;
    c:=nullif(p_input->>'customerId','')::uuid; nc:=p_input->'newCustomer';
    if c is null then
      if coalesce(length(trim(nc->>'name')),0)<2 then raise exception 'customer_required'; end if;
      insert into customers(dealer_id,name,type,phone,email,address_line1,city,county,eircode,country,business_name,title,first_name,last_name,job_title,data_consent,ddi_phone,fax,mobile)
        values(p_dealer,left(nc->>'name',120),coalesce(nullif(nc->>'type',''),'individual'),left(nc->>'phone',40),left(nc->>'email',200),left(nc->>'address',400),left(nc->>'town',80),left(nc->>'county',80),left(nc->>'postCode',16),left(nc->>'country',4),left(nc->>'company',120),left(nc->>'title',20),left(nc->>'firstName',80),left(nc->>'lastName',80),left(nc->>'jobTitle',80),left(nc->>'dataConsent',40),left(nc->>'ddiPhone',40),left(nc->>'fax',40),left(nc->>'mobile',40)) returning customers.id into c;
    elsif not exists(select 1 from customers where customers.id=c and dealer_id=p_dealer and deleted_at is null) then raise exception 'invalid_customer'; end if;
    source:=left(p_input->>'source',40);
    if nullif(p_input->>'leadId','') is not null then
      if not crm_allowed(p_dealer,'read') or not exists(select 1 from leads where leads.id=(p_input->>'leadId')::uuid and dealer_id=p_dealer and (customer_id is null or customer_id=c)) then raise exception 'invalid_lead'; end if;
      select leads.source::text into source from leads where leads.id=(p_input->>'leadId')::uuid;
    end if;
    number:=commercial_number(p_dealer,'DEAL');
    insert into deals(dealer_id,deal_no,so_no,customer_id,retail_price,salesperson_id,lead_id,source,currency,notes,created_by)
      values(p_dealer,number,commercial_number(p_dealer,'SO'),c,amount,coalesce(nullif(p_input->>'salespersonId','')::uuid,auth.uid()),nullif(p_input->>'leadId','')::uuid,source,(select currency from dealers where dealers.id=p_dealer),left(p_input->>'notes',1000),auth.uid()) returning * into d;
    id:=d.id;
    insert into deal_orders(dealer_id,deal_id,kind,vehicle_id,price,vat_scheme,order_no) values(p_dealer,id,'sale',v.id,amount,coalesce(p_input->>'vatScheme','standard'),d.so_no);
    update vehicles set status='reserved' where vehicles.id=v.id;
    price:=coalesce((p_input->>'depositAmount')::numeric,0);
    if price<0 or price>amount or price<>round(price,2) then raise exception 'invalid_deposit'; end if;
    if price>0 then
      if not commercial_allowed(p_dealer,'payment') or coalesce(p_input->>'depositMethod','') not in ('cash','bank','card','finance') then raise exception 'invalid_payment'; end if;
      insert into payments(dealer_id,deal_id,kind,method,amount,currency,paid_on,created_by) values(p_dealer,id,'deposit',p_input->>'depositMethod',price,d.currency,coalesce(nullif(p_input->>'depositDate','')::date,current_date),auth.uid());
    end if;
    insert into deal_events(dealer_id,deal_id,kind,detail,created_by) values(p_dealer,id,'created',jsonb_build_object('message','Sale opened · vehicle locked','advertised_price',v.sale_price,'sale_price',amount,'price_reason',p_input->>'priceReason'),auth.uid());
    result:=jsonb_build_object('id',id);
  elsif p_command in ('purchase','trade') then
    if p_command='trade' then
      select * into d from deals where deals.id=p_id and dealer_id=p_dealer for update;
      if not found or d.status in ('completed','cancelled') then raise exception 'deal_closed_or_missing'; end if;
      if exists(select 1 from deal_orders where deal_id=d.id and is_trade_in) then raise exception 'trade_already_exists'; end if;
      c:=d.customer_id;
    else
      c:=nullif(p_input->>'vendorId','')::uuid; nc:=p_input->'newVendor';
      if c is null then
        if coalesce(length(trim(nc->>'name')),0)<2 then raise exception 'vendor_required'; end if;
        insert into customers(dealer_id,name,type,phone,email) values(p_dealer,left(nc->>'name',120),'business',left(nc->>'phone',40),left(nc->>'email',200)) returning customers.id into c;
      elsif not exists(select 1 from customers where customers.id=c and dealer_id=p_dealer and deleted_at is null) then raise exception 'invalid_vendor'; end if;
    end if;
    settlement:=coalesce((p_input->>'settlement')::numeric,0); equity:=amount-settlement;
    if settlement<0 or settlement>100000000 or settlement<>round(settlement,2) or (p_command='purchase' and settlement>amount) then raise exception 'invalid_settlement'; end if;
    if settlement>0 and (coalesce(length(trim(p_input->>'settlementProvider')),0)<2 or nullif(p_input->>'settlementValidUntil','') is null) then raise exception 'settlement_details_required'; end if;
    if coalesce(length(trim(p_input->>'make')),0)=0 or coalesce(length(trim(p_input->>'model')),0)=0 or coalesce(length(trim(p_input->>'registration')),0)=0 or coalesce((p_input->>'year')::int,0) not between 1950 and 2100 then raise exception 'invalid_vehicle'; end if;
    if exists(select 1 from vehicles where dealer_id=p_dealer and lower(regexp_replace(registration,'[^a-zA-Z0-9]','','g'))=lower(regexp_replace(p_input->>'registration','[^a-zA-Z0-9]','','g')) and status<>'sold') then raise exception 'duplicate_registration'; end if;
    insert into vehicles(dealer_id,make,model,year,registration,km,status,stock_class,created_by)
      values(p_dealer,left(p_input->>'make',60),left(p_input->>'model',80),(p_input->>'year')::int,upper(left(p_input->>'registration',20)),coalesce((p_input->>'km')::int,0),'bought',case when p_command='trade' then 'trade' else 'main' end,auth.uid()) returning vehicles.id into vehicle;
    number:=commercial_number(p_dealer,'PO');
    insert into purchase_orders(dealer_id,po_no,vendor_id,vehicle_id,vat_scheme,inv_ref,notes,created_by,due_on,finance_company,finance_reference,settlement_due,trade_credit,deal_id,settlement_valid_until)
      values(p_dealer,number,c,vehicle,coalesce(p_input->>'vatScheme','none'),left(p_input->>'invRef',60),left(p_input->>'notes',1000),auth.uid(),nullif(p_input->>'dueOn','')::date,left(p_input->>'settlementProvider',120),left(p_input->>'settlementReference',120),settlement,case when p_command='trade' then equity else 0 end,case when p_command='trade' then d.id else null end,nullif(p_input->>'settlementValidUntil','')::date) returning * into po;
    if po.due_on is null and settlement>0 then update purchase_orders set due_on=po.settlement_valid_until where purchase_orders.id=po.id; end if;
    insert into po_lines(dealer_id,po_id,vehicle_id,description,qty,net,vat,gross)
      values(p_dealer,po.id,vehicle,p_input->>'registration',1,amount-case when po.vat_scheme='standard' then round(amount*23/123,2) else 0 end,case when po.vat_scheme='standard' then round(amount*23/123,2) else 0 end,amount);
    insert into vehicle_deals(vehicle_id,dealer_id,purchase_price,purchase_date,supplier,vat_scheme,source)
      values(vehicle,p_dealer,amount,current_date,(select name from customers where customers.id=c),po.vat_scheme,case when p_command='trade' then 'part_exchange' else 'other' end);
    if p_command='trade' then
      insert into deal_orders(dealer_id,deal_id,kind,vehicle_id,is_trade_in,price,settlement_amount,settlement_provider,settlement_valid_until,net_equity,order_no)
        values(p_dealer,d.id,'purchase',vehicle,true,amount,settlement,po.finance_company,nullif(p_input->>'settlementValidUntil','')::date,equity,number);
      update deals set siv_total=equity,version=version+1,updated_at=now() where deals.id=d.id;
      insert into deal_events(dealer_id,deal_id,kind,detail,created_by) values(p_dealer,d.id,'trade_in',jsonb_build_object('message','Trade-in and lender liability recorded','allowance',amount,'settlement',settlement,'equity',equity,'po_id',po.id),auth.uid());
    end if;
    insert into audit_logs(dealer_id,user_id,action,entity,entity_id,meta) values(p_dealer,auth.uid(),'purchase_created','purchase_order',po.id,jsonb_build_object('vehicle_id',vehicle,'total',amount,'settlement',settlement,'trade_credit',po.trade_credit));
    result:=jsonb_build_object('id',po.id,'vehicleId',vehicle);
  elsif p_command in ('approve_purchase','vendor_payment') then
    select * into po from purchase_orders where purchase_orders.id=p_id and dealer_id=p_dealer for update;
    if not found or po.status='cancelled' then raise exception 'purchase_missing_or_cancelled'; end if;
    if p_command='approve_purchase' then
      if user_role_in(p_dealer) not in ('owner','admin') or po.status<>'to_be_paid' then raise exception 'approval_not_allowed'; end if;
      update purchase_orders set status='approved',approved_by=auth.uid(),approved_at=now(),updated_at=now() where purchase_orders.id=po.id;
    else
      if po.status<>'approved' then raise exception 'purchase_not_approved'; end if;
      v_recipient:=p_input->>'recipient'; amount:=(p_input->>'amount')::numeric;
      if v_recipient is null or v_recipient not in ('vendor','finance') or amount is null or amount<=0 or amount<>round(amount,2) or coalesce(p_input->>'method','') not in ('cash','bank','card','finance') then raise exception 'invalid_payment'; end if;
      select coalesce(sum(gross),0) into total from po_lines where po_id=po.id;
      select coalesce(sum(pp.amount),0) into paid from po_payments pp where po_id=po.id and pp.recipient=v_recipient;
      balance:=case when v_recipient='finance' then po.settlement_due else total-po.trade_credit-po.settlement_due end-paid;
      if amount>balance then raise exception 'payment_exceeds_balance'; end if;
      insert into po_payments(dealer_id,po_id,amount,method,paid_on,reference,created_by,recipient) values(p_dealer,po.id,amount,p_input->>'method',coalesce(nullif(p_input->>'paidOn','')::date,current_date),left(p_input->>'reference',120),auth.uid(),v_recipient);
      if total-po.trade_credit=(select coalesce(sum(pp.amount),0) from po_payments pp where po_id=po.id) then update purchase_orders set status='paid',updated_at=now() where purchase_orders.id=po.id; end if;
    end if;
    insert into audit_logs(dealer_id,user_id,action,entity,entity_id,meta) values(p_dealer,auth.uid(),p_command,'purchase_order',po.id,jsonb_build_object('amount',amount,'recipient',v_recipient));
  elsif p_command='document_settings' then
    if user_role_in(p_dealer) not in ('owner','admin') then raise exception 'commercial_not_allowed'; end if;
    if coalesce(length(trim(p_input->>'legal_name')),0)<2 or coalesce(length(trim(p_input->>'address')),0)<5 then raise exception 'document_settings_required'; end if;
    select to_jsonb(s) into old from document_settings s where dealer_id=p_dealer;
    insert into document_settings values(p_dealer,left(p_input->>'legal_name',160),left(p_input->>'address',500),left(p_input->>'vat_number',40),left(p_input->>'company_number',40),left(p_input->>'phone',40),left(p_input->>'email',200),left(p_input->>'bank_details',500),left(p_input->>'agreement_terms',5000),left(p_input->>'invoice_notes',2000))
    on conflict(dealer_id) do update set legal_name=excluded.legal_name,address=excluded.address,vat_number=excluded.vat_number,company_number=excluded.company_number,phone=excluded.phone,email=excluded.email,bank_details=excluded.bank_details,agreement_terms=excluded.agreement_terms,invoice_notes=excluded.invoice_notes;
    insert into audit_logs(dealer_id,user_id,action,entity,entity_id,meta) values(p_dealer,auth.uid(),p_command,'dealer',p_dealer,jsonb_build_object('before',old,'after',p_input));
  else
    select * into d from deals where deals.id=p_id and dealer_id=p_dealer for update;
    if not found then raise exception 'deal_missing'; end if;
    if d.status in ('completed','cancelled') and p_command<>'document' then raise exception 'deal_closed'; end if;
    if p_command='payment' then
      amount:=(p_input->>'amount')::numeric;
      if amount is null or amount<=0 or amount>100000000 or amount<>round(amount,2) or coalesce(p_input->>'kind','') not in ('deposit','balance','finance_payout','refund') or coalesce(p_input->>'method','') not in ('cash','bank','card','finance') then raise exception 'invalid_payment'; end if;
      result:=commercial_totals(d.id); balance:=(result->>'balance')::numeric; paid:=(result->>'paid')::numeric; total:=(result->>'total')::numeric;
      if (p_input->>'kind'='refund' and amount>paid+greatest(d.siv_total-total,0)) or (p_input->>'kind'<>'refund' and amount>balance) then raise exception 'payment_exceeds_balance'; end if;
      if p_input->>'kind'='finance_payout' and (d.finance_status<>'approved' or amount>d.finance_expected-coalesce((select sum(p.amount) from payments p where p.deal_id=d.id and p.kind='finance_payout'),0)) then raise exception 'finance_not_approved'; end if;
      insert into payments(dealer_id,deal_id,kind,method,amount,currency,paid_on,reference,created_by) values(p_dealer,d.id,p_input->>'kind',p_input->>'method',amount,d.currency,coalesce(nullif(p_input->>'paidOn','')::date,current_date),left(p_input->>'reference',120),auth.uid());
    elsif p_command='price' then
      amount:=(p_input->>'price')::numeric;
      if amount is null or amount<=0 or amount>100000000 or amount<>round(amount,2) or coalesce(length(trim(p_input->>'reason')),0)<3 then raise exception 'price_permission_reason_required'; end if;
      if (p_input->>'version')::int is distinct from d.version then raise exception 'stale_deal'; end if;
      update deals set retail_price=amount,version=version+1,updated_at=now() where deals.id=d.id;
      update deal_orders set price=amount where deal_id=d.id and kind='sale';
    elsif p_command='finance' then
      amount:=coalesce((p_input->>'finance_expected')::numeric,0);
      if amount<0 or amount>100000000 or amount<>round(amount,2) then raise exception 'invalid_amount'; end if;
      if amount>0 and coalesce(length(trim(p_input->>'finance_company')),0)<2 then raise exception 'finance_details_required'; end if;
      if amount<coalesce((select sum(p.amount) from payments p where p.deal_id=d.id and p.kind='finance_payout'),0) then raise exception 'finance_below_received'; end if;
      update deals set finance_company=left(p_input->>'finance_company',120),finance_reference=left(p_input->>'finance_reference',120),finance_address=left(p_input->>'finance_address',500),finance_expected=amount,finance_status=coalesce(p_input->>'finance_status','none'),invoice_to_finance=coalesce((p_input->>'invoice_to_finance')::boolean,false),version=version+1,updated_at=now() where deals.id=d.id;
    elsif p_command='stage' then
      if p_input->>'stage'='after_sales' then raise exception 'complete_sale_first'; end if;
      update deals set stage=p_input->>'stage',updated_at=now() where deals.id=d.id;
    elsif p_command='checklist' then
      if coalesce(p_input->>'key','') not in ('dl_front','dl_back','utility_bill','trade_vrc') then raise exception 'invalid_checklist'; end if;
      update deals set required_docs=required_docs||jsonb_build_object(p_input->>'key',(p_input->>'received')::boolean),updated_at=now() where deals.id=d.id;
    elsif p_command='addon' then
      amount:=(p_input->>'price')::numeric;
      if amount is null or amount<0 or amount>1000000 or coalesce(length(trim(p_input->>'name')),0)<2 then raise exception 'invalid_addon'; end if;
      if coalesce((p_input->>'cost')::numeric,0)<0 or coalesce((p_input->>'cost')::numeric,0)>1000000 then raise exception 'invalid_addon'; end if;
      if coalesce((p_input->>'cost')::numeric,0)<>0 and not commercial_allowed(p_dealer,'cost') then raise exception 'commercial_not_allowed'; end if;
      insert into deal_addons(dealer_id,deal_id,kind,name,price,cost,months,terms,created_by,vat_rate) values(p_dealer,d.id,p_input->>'kind',left(p_input->>'name',80),round(amount,2),coalesce((p_input->>'cost')::numeric,0),nullif(p_input->>'months','')::int,left(p_input->>'terms',1000),auth.uid(),coalesce((p_input->>'vatRate')::numeric,23));
      update deals set version=version+1 where deals.id=d.id;
    elsif p_command='remove_addon' then
      delete from deal_addons where deal_id=d.id and deal_addons.id=(p_input->>'id')::uuid;
      if not found then raise exception 'addon_missing'; end if;
      update deals set version=version+1 where deals.id=d.id;
    elsif p_command='document' then
      if coalesce(p_input->>'kind','') not in ('quote','agreement','invoice') or d.status='cancelled' or (d.status='completed' and p_input->>'kind'<>'invoice') then raise exception 'invalid_document'; end if;
      if p_input->>'kind'='invoice' and d.status<>'completed' then raise exception 'complete_sale_first'; end if;
      doc:=issue_commercial_document(d.id,p_input->>'kind'); result:=jsonb_build_object('id',doc);
    elsif p_command='status' then
      if p_input->>'status'='completed' then
        if d.status not in ('agreed','finance') then raise exception 'agreement_status_required'; end if;
        if not exists(select 1 from deal_documents where deal_id=d.id and kind='agreement' and deal_version=d.version and status<>'void') then raise exception 'current_agreement_required'; end if;
        if (commercial_totals(d.id)->>'balance')::numeric<>0 then raise exception 'clear_balance_first'; end if;
        if d.finance_expected>coalesce((select sum(p.amount) from payments p where p.deal_id=d.id and kind='finance_payout'),0) then raise exception 'finance_payout_pending'; end if;
        select * into strict o from deal_orders where deal_id=d.id and kind='sale';
        update vehicles set status='sold' where vehicles.id=o.vehicle_id and dealer_id=p_dealer;
        update deals set status='completed',stage='after_sales',closed_at=now(),updated_at=now() where deals.id=d.id;
        insert into vehicle_deals(vehicle_id,dealer_id,sale_price,part_exchange_value,sale_status,sold_date,finance_provider,buyer_name)
          values(o.vehicle_id,p_dealer,d.retail_price,d.siv_total,'sold',current_date,d.finance_company,(select name from customers where customers.id=d.customer_id))
          on conflict(vehicle_id) do update set sale_price=excluded.sale_price,part_exchange_value=excluded.part_exchange_value,sale_status=excluded.sale_status,sold_date=excluded.sold_date,finance_provider=excluded.finance_provider,buyer_name=excluded.buyer_name;
        if d.lead_id is not null then
          update leads set stage='sold',next_action=null,next_action_at=null,version=version+1,updated_at=now() where leads.id=d.lead_id and dealer_id=p_dealer;
          insert into lead_activities(dealer_id,lead_id,type,body,created_by,detail) values(p_dealer,d.lead_id,'note','Sale completed: '||d.deal_no,auth.uid(),jsonb_build_object('deal_id',d.id));
        end if;
        doc:=issue_commercial_document(d.id,'invoice'); result:=jsonb_build_object('id',doc);
      elsif p_input->>'status'='cancelled' then
        if (commercial_totals(d.id)->>'paid')::numeric<>0 or exists(select 1 from purchase_orders where deal_id=d.id) then raise exception 'refund_or_resolve_trade_first'; end if;
        update vehicles set status='ready_for_sale' where vehicles.id in(select vehicle_id from deal_orders where deal_id=d.id and kind='sale');
        update deals set status='cancelled',stage='cancelled',closed_at=now() where deals.id=d.id;
      elsif p_input->>'status' in ('agreed','finance','quoted') then update deals set status=p_input->>'status',updated_at=now() where deals.id=d.id;
      else raise exception 'invalid_status'; end if;
    else raise exception 'invalid_command'; end if;
    if p_command<>'document' then
      insert into deal_events(dealer_id,deal_id,kind,detail,created_by) values(p_dealer,d.id,p_command,jsonb_build_object('message',replace(p_command,'_',' ')||' recorded','input',p_input-'cost','previous_price',case when p_command='price' then d.retail_price else null end),auth.uid());
    end if;
  end if;
  insert into commercial_requests values(p_dealer,p_request,p_command,jsonb_build_object('id',p_id,'data',p_input),result);
  return result;
end $$;
revoke all on function public.commercial_command(uuid,text,uuid,jsonb,uuid) from public,anon;
grant execute on function public.commercial_command(uuid,text,uuid,jsonb,uuid) to authenticated;
