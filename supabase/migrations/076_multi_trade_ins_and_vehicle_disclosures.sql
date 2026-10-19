-- Multiple trade-ins are separate PO-backed acquisitions. Preserve the tested
-- trade command and change only its one-trade guard and equity accumulator.
do $$
declare original_body text; revised_body text;
  one_trade_rule text := 'if exists(select 1 from deal_orders where deal_id=d.id and is_trade_in) then raise exception ''trade_already_exists''; end if;';
  old_equity_rule text := 'update deals set siv_total=equity,version=version+1,updated_at=now() where deals.id=d.id;';
begin
  select prosrc into original_body from pg_proc
    where oid='public.commercial_command_v041(uuid,text,uuid,jsonb,uuid)'::regprocedure;
  if original_body is null or position(one_trade_rule in original_body)=0
    or position(old_equity_rule in original_body)=0 then
    raise exception 'trade_command_rule_not_found';
  end if;
  revised_body:=replace(replace(original_body,one_trade_rule,''),
    old_equity_rule,'update deals set siv_total=siv_total+equity,version=version+1,updated_at=now() where deals.id=d.id;');
  revised_body:=replace(revised_body,
    'if not found or d.status in (''completed'',''cancelled'') then raise exception ''deal_closed_or_missing''; end if;',
    'if not found or d.status in (''completed'',''cancelled'',''reversed'') then raise exception ''deal_closed_or_missing''; end if;');
  execute format('create or replace function public.commercial_command_v041(
    p_dealer uuid,p_command text,p_id uuid,p_input jsonb,p_request uuid)
    returns jsonb language plpgsql security definer set search_path=public as %L',revised_body);
end $$;

create table public.vehicle_history_reports (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  source text not null default 'dealer_declaration' check (source in ('dealer_declaration','customer_declaration','vehicle_report')),
  report_reference text,
  reported_on date not null default current_date,
  accident_status text not null default 'unknown' check (accident_status in ('unknown','no','yes')),
  write_off_status text not null default 'unknown' check (write_off_status in ('unknown','no','yes')),
  stolen_status text not null default 'unknown' check (stolen_status in ('unknown','no','yes')),
  mileage_discrepancy_status text not null default 'unknown' check (mileage_discrepancy_status in ('unknown','no','yes')),
  notes text,
  originating_po_id uuid unique references public.purchase_orders(id),
  recorded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index vehicle_history_reports_vehicle_idx on public.vehicle_history_reports(dealer_id,vehicle_id,created_at desc);
alter table public.vehicle_history_reports enable row level security;
revoke all on public.vehicle_history_reports from anon,authenticated;
grant select on public.vehicle_history_reports to authenticated;
create policy vehicle_history_reports_read on public.vehicle_history_reports for select
  using (public.commercial_allowed(dealer_id,'read'));

create function public.record_vehicle_history_report(p_dealer uuid,p_vehicle uuid,p_data jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare report_id uuid; source_value text; accident text; write_off text; stolen text; mileage text;
begin
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'work') then raise exception 'commercial_not_allowed'; end if;
  if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>5000 then raise exception 'invalid_vehicle_history'; end if;
  perform 1 from public.vehicles where id=p_vehicle and dealer_id=p_dealer for update;
  if not found then raise exception 'vehicle_missing'; end if;
  source_value:=coalesce(p_data->>'source','');accident:=coalesce(p_data->>'accident','');
  write_off:=coalesce(p_data->>'writeOff','');stolen:=coalesce(p_data->>'stolen','');
  mileage:=coalesce(p_data->>'mileageDiscrepancy','');
  if source_value not in ('dealer_declaration','customer_declaration','vehicle_report')
    or accident not in ('unknown','no','yes') or write_off not in ('unknown','no','yes')
    or stolen not in ('unknown','no','yes') or mileage not in ('unknown','no','yes')
    or length(coalesce(p_data->>'reportReference',''))>120 or length(coalesce(p_data->>'notes',''))>2000
    then raise exception 'invalid_vehicle_history'; end if;
  insert into public.vehicle_history_reports(dealer_id,vehicle_id,source,report_reference,reported_on,
    accident_status,write_off_status,stolen_status,mileage_discrepancy_status,notes,recorded_by)
    values(p_dealer,p_vehicle,source_value,nullif(trim(p_data->>'reportReference'),''),
      coalesce(nullif(p_data->>'reportedOn','')::date,current_date),accident,write_off,stolen,mileage,
      nullif(trim(p_data->>'notes'),''),auth.uid()) returning id into report_id;
  insert into public.audit_logs(dealer_id,user_id,action,entity,entity_id,meta)
    values(p_dealer,auth.uid(),'vehicle_history_report_recorded','vehicle',p_vehicle,jsonb_build_object('report_id',report_id,'source',source_value));
  return report_id;
end $$;
revoke all on function public.record_vehicle_history_report(uuid,uuid,jsonb) from public,anon;
grant execute on function public.record_vehicle_history_report(uuid,uuid,jsonb) to authenticated;

create table public.deal_vehicle_disclosures (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  deal_id uuid not null references public.deals(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id),
  customer_id uuid not null references public.customers(id),
  report_ids uuid[] not null,
  findings jsonb not null,
  consent_method text not null check (consent_method in ('verbal','written')),
  evidence_reference text,
  consent_confirmed boolean not null check (consent_confirmed),
  confirmed_by uuid not null references auth.users(id),
  confirmed_at timestamptz not null default now(),
  unique (deal_id,vehicle_id)
);
alter table public.deal_vehicle_disclosures enable row level security;
revoke all on public.deal_vehicle_disclosures from anon,authenticated;
grant select on public.deal_vehicle_disclosures to authenticated;
create policy deal_vehicle_disclosures_read on public.deal_vehicle_disclosures for select
  using (public.commercial_allowed(dealer_id,'read'));

create function public.record_trade_in(
  p_dealer uuid,p_deal uuid,p_data jsonb,p_request uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; v_vehicle_id uuid; po_id uuid; history jsonb;
  accident text; write_off text; stolen text; mileage text;
begin
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'work') then raise exception 'commercial_not_allowed'; end if;
  if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>5000 then raise exception 'invalid_trade_in'; end if;
  if coalesce((p_data->>'km')::integer,-1)<0 or coalesce((p_data->>'km')::integer,0)>5000000 then raise exception 'invalid_mileage'; end if;
  history:=coalesce(p_data->'history','{}'::jsonb);
  accident:=coalesce(history->>'accident','unknown');
  write_off:=coalesce(history->>'writeOff','unknown');
  stolen:=coalesce(history->>'stolen','unknown');
  mileage:=coalesce(history->>'mileageDiscrepancy','unknown');
  if accident not in ('unknown','no','yes') or write_off not in ('unknown','no','yes')
    or stolen not in ('unknown','no','yes') or mileage not in ('unknown','no','yes')
    or coalesce(length(history->>'notes'),0)>2000
    or coalesce(length(history->>'reportReference'),0)>120
    or coalesce(history->>'source','dealer_declaration') not in ('dealer_declaration','customer_declaration','vehicle_report')
    then raise exception 'invalid_vehicle_history'; end if;
  if nullif(p_data->>'vin','') is not null and length(trim(p_data->>'vin'))>17 then raise exception 'invalid_vin'; end if;
  result:=public.commercial_command(p_dealer,'trade',p_deal,p_data-'history'-'vin'-'colour',p_request);
  v_vehicle_id:=(result->>'vehicleId')::uuid;po_id:=(result->>'id')::uuid;
  insert into public.vehicle_details(vehicle_id,dealer_id,vin,colour,condition_notes)
  values(v_vehicle_id,p_dealer,nullif(upper(trim(p_data->>'vin')),''),nullif(left(trim(p_data->>'colour'),40),''),nullif(left(trim(p_data->>'conditionNotes'),2000),''))
  on conflict(vehicle_id) do nothing;
  insert into public.vehicle_history_reports(dealer_id,vehicle_id,source,report_reference,reported_on,
    accident_status,write_off_status,stolen_status,mileage_discrepancy_status,notes,originating_po_id,recorded_by)
  values(p_dealer,v_vehicle_id,coalesce(history->>'source','dealer_declaration'),nullif(left(trim(history->>'reportReference'),120),''),
    coalesce(nullif(history->>'reportedOn','')::date,current_date),accident,write_off,stolen,mileage,
    nullif(left(trim(history->>'notes'),2000),''),po_id,auth.uid())
  on conflict(originating_po_id) do nothing;
  return result;
end $$;
revoke all on function public.record_trade_in(uuid,uuid,jsonb,uuid) from public,anon;
grant execute on function public.record_trade_in(uuid,uuid,jsonb,uuid) to authenticated;

create table public.deal_sheet_trade_requests (
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  request_id uuid not null,
  input jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(dealer_id,request_id)
);
revoke all on public.deal_sheet_trade_requests from anon,authenticated;

create function public.create_deal_with_trade_ins(
  p_dealer uuid,p_sale jsonb,p_terms jsonb,p_mode text,p_trades jsonb,p_request uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare cached public.deal_sheet_trade_requests; payload jsonb; result jsonb; item jsonb; pos integer:=0;
  agreement jsonb; current_version integer;
begin
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'work') then raise exception 'commercial_not_allowed'; end if;
  if p_request is null or p_sale is null or p_mode not in ('deal','edit','agreement')
    or jsonb_typeof(p_trades)<>'array' or jsonb_array_length(p_trades) not between 1 and 10
    or octet_length(p_trades::text)>40000 then raise exception 'invalid_trade_ins'; end if;
  payload:=jsonb_build_object('sale',p_sale,'terms',p_terms,'mode',p_mode,'trades',p_trades);
  perform 1 from public.dealers where id=p_dealer for update;
  select * into cached from public.deal_sheet_trade_requests where dealer_id=p_dealer and request_id=p_request;
  if found then
    if cached.input<>payload then raise exception 'request_reused'; end if;
    return cached.result;
  end if;
  result:=public.create_deal_from_sheet(p_dealer,p_sale,p_terms,null,
    case when p_mode='agreement' then 'deal' else p_mode end,p_request);
  for item in select value from jsonb_array_elements(p_trades) loop
    pos:=pos+1;
    perform public.record_trade_in(p_dealer,(result->>'id')::uuid,item,gen_random_uuid());
  end loop;
  if p_mode='agreement' then
    select version into current_version from public.deals where id=(result->>'id')::uuid;
    agreement:=public.commercial_command(p_dealer,'force_agreement',(result->>'id')::uuid,
      jsonb_build_object('expectedVersion',current_version),gen_random_uuid());
    result:=result||jsonb_build_object('documentId',agreement->>'id','mode','agreement');
  end if;
  insert into public.deal_sheet_trade_requests(dealer_id,request_id,input,result)
    values(p_dealer,p_request,payload,result);
  return result;
end $$;
revoke all on function public.create_deal_with_trade_ins(uuid,jsonb,jsonb,text,jsonb,uuid) from public,anon;
grant execute on function public.create_deal_with_trade_ins(uuid,jsonb,jsonb,text,jsonb,uuid) to authenticated;

create function public.vehicle_history_findings(p_dealer uuid,p_vehicle uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare findings jsonb;
begin
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'read') then raise exception 'commercial_not_allowed'; end if;
  select jsonb_build_object(
    'accident',coalesce(bool_or(accident_status='yes'),false),
    'writeOff',coalesce(bool_or(write_off_status='yes'),false),
    'stolen',coalesce(bool_or(stolen_status='yes'),false),
    'mileageDiscrepancy',coalesce(bool_or(mileage_discrepancy_status='yes'),false),
    'reportIds',coalesce(array_agg(id order by created_at,id) filter(where accident_status='yes' or write_off_status='yes' or stolen_status='yes' or mileage_discrepancy_status='yes'),array[]::uuid[])
  ) into findings from public.vehicle_history_reports where dealer_id=p_dealer and vehicle_id=p_vehicle;
  return findings;
end $$;
revoke all on function public.vehicle_history_findings(uuid,uuid) from public,anon;
grant execute on function public.vehicle_history_findings(uuid,uuid) to authenticated;

create function public.confirm_vehicle_history_disclosure(
  p_dealer uuid,p_deal uuid,p_method text,p_reference text
) returns uuid language plpgsql security definer set search_path=public as $$
declare d public.deals; v_vehicle_id uuid; findings jsonb; disclosure_id uuid;
begin
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'work') then raise exception 'commercial_not_allowed'; end if;
  if p_method not in ('verbal','written') or length(coalesce(p_reference,''))>200 then raise exception 'invalid_disclosure'; end if;
  perform 1 from public.dealers where id=p_dealer for update;
  select * into d from public.deals where id=p_deal and dealer_id=p_dealer for update;
  if not found or d.status in ('completed','cancelled','reversed') then raise exception 'deal_closed'; end if;
  select sale_order.vehicle_id into v_vehicle_id from public.deal_orders sale_order where sale_order.deal_id=d.id and sale_order.dealer_id=p_dealer and sale_order.kind='sale';
  findings:=public.vehicle_history_findings(p_dealer,v_vehicle_id);
  if not coalesce((findings->>'accident')::boolean,false) and not coalesce((findings->>'writeOff')::boolean,false)
    and not coalesce((findings->>'stolen')::boolean,false) and not coalesce((findings->>'mileageDiscrepancy')::boolean,false)
    then raise exception 'no_disclosure_required'; end if;
  insert into public.deal_vehicle_disclosures(dealer_id,deal_id,vehicle_id,customer_id,report_ids,findings,
    consent_method,evidence_reference,consent_confirmed,confirmed_by)
  values(p_dealer,d.id,v_vehicle_id,d.customer_id,array(select jsonb_array_elements_text(findings->'reportIds')::uuid),
    findings,p_method,nullif(trim(p_reference),''),true,auth.uid())
  on conflict(deal_id,vehicle_id) do update set report_ids=excluded.report_ids,findings=excluded.findings,
    consent_method=excluded.consent_method,evidence_reference=excluded.evidence_reference,
    confirmed_by=excluded.confirmed_by,confirmed_at=now()
  returning id into disclosure_id;
  insert into public.deal_events(dealer_id,deal_id,kind,detail,created_by)
    values(p_dealer,d.id,'vehicle_history_disclosed',jsonb_build_object('message','Buyer informed and consent confirmed before invoice',
      'vehicle_id',v_vehicle_id,'findings',findings,'method',p_method,'reference',p_reference),auth.uid());
  insert into public.audit_logs(dealer_id,user_id,action,entity,entity_id,meta)
    values(p_dealer,auth.uid(),'vehicle_history_disclosed','deal',d.id,jsonb_build_object('disclosure_id',disclosure_id,'findings',findings,'method',p_method));
  return disclosure_id;
end $$;
revoke all on function public.confirm_vehicle_history_disclosure(uuid,uuid,text,text) from public,anon;
grant execute on function public.confirm_vehicle_history_disclosure(uuid,uuid,text,text) to authenticated;

-- A current disclosure is required for any recorded positive history finding.
create function public.guard_invoice_vehicle_disclosure() returns trigger
language plpgsql security definer set search_path=public as $$
declare sale_vehicle uuid; findings jsonb; accepted public.deal_vehicle_disclosures; trades jsonb;
begin
  if new.kind not in ('quote','agreement','invoice') then return new; end if;
  select vehicle_id into sale_vehicle from public.deal_orders
    where dealer_id=new.dealer_id and deal_id=new.deal_id and kind='sale';
  findings:=public.vehicle_history_findings(new.dealer_id,sale_vehicle);
  new.snapshot:=new.snapshot||jsonb_build_object('vehicle_history_report',findings);
  select coalesce(jsonb_agg(jsonb_build_object('vehicleId',v.id,'registration',v.registration,
    'label',v.year||' '||v.make||' '||v.model,'allowance',o.price,'settlement',o.settlement_amount,
    'provider',o.settlement_provider,'equity',o.net_equity) order by o.created_at,o.id),'[]'::jsonb)
    into trades from public.deal_orders o join public.vehicles v on v.id=o.vehicle_id
    where o.dealer_id=new.dealer_id and o.deal_id=new.deal_id and o.kind='purchase' and o.is_trade_in;
  new.snapshot:=new.snapshot||jsonb_build_object('trade_ins',trades);
  if new.kind<>'invoice' then return new; end if;
  if coalesce((findings->>'accident')::boolean,false) or coalesce((findings->>'writeOff')::boolean,false)
    or coalesce((findings->>'stolen')::boolean,false) or coalesce((findings->>'mileageDiscrepancy')::boolean,false) then
    select * into accepted from public.deal_vehicle_disclosures
      where dealer_id=new.dealer_id and deal_id=new.deal_id and vehicle_id=sale_vehicle;
    if not found or accepted.customer_id is distinct from (select customer_id from public.deals where id=new.deal_id)
      or accepted.report_ids is distinct from array(select jsonb_array_elements_text(findings->'reportIds')::uuid)
      then raise exception 'vehicle_history_disclosure_required'; end if;
    new.snapshot:=new.snapshot||jsonb_build_object('vehicle_history_disclosure',jsonb_build_object(
      'findings',accepted.findings,'method',accepted.consent_method,'reference',accepted.evidence_reference,
      'confirmed_at',accepted.confirmed_at,'confirmed_by',accepted.confirmed_by));
  end if;
  return new;
end $$;
create trigger guard_invoice_vehicle_disclosure before insert on public.deal_documents
  for each row execute function public.guard_invoice_vehicle_disclosure();
revoke all on function public.guard_invoice_vehicle_disclosure() from public,anon,authenticated;

-- A returned trade-in remains in the audit trail but is no longer dealer stock.
alter type public.vehicle_status add value if not exists 'returned_to_customer';

do $$
declare original_body text; revised_body text;
  old_registration_rule text := 'and status<>''sold'') then raise exception ''duplicate_registration'';';
begin
  select prosrc into original_body from pg_proc
    where oid='public.commercial_command_v041(uuid,text,uuid,jsonb,uuid)'::regprocedure;
  if original_body is null or position(old_registration_rule in original_body)=0
    then raise exception 'trade_registration_rule_not_found'; end if;
  revised_body:=replace(original_body,old_registration_rule,
    'and status not in (''sold'',''returned_to_customer'')) then raise exception ''duplicate_registration'';');
  revised_body:=replace(revised_body,
    'if not found or v.status=''sold'' then raise exception ''vehicle_unavailable''; end if;',
    'if not found or v.status in (''sold'',''returned_to_customer'') then raise exception ''vehicle_unavailable''; end if;');
  execute format('create or replace function public.commercial_command_v041(
    p_dealer uuid,p_command text,p_id uuid,p_input jsonb,p_request uuid)
    returns jsonb language plpgsql security definer set search_path=public as %L',revised_body);
end $$;

do $$
declare original_body text;
begin
  select prosrc into original_body from pg_proc where oid='public.create_sales_quote(uuid,jsonb,uuid)'::regprocedure;
  if original_body is null or position('if not found or v.status=''sold'' then raise exception ''vehicle_unavailable''; end if;' in original_body)=0
    then raise exception 'quote_vehicle_rule_not_found'; end if;
  original_body:=replace(original_body,
      'if not found or v.status=''sold'' then raise exception ''vehicle_unavailable''; end if;',
      'if not found or v.status in (''sold'',''returned_to_customer'') then raise exception ''vehicle_unavailable''; end if;');
  original_body:=replace(original_body,'insert into public.sales_quotes(dealer_id,quote_no',
    'snap:=snap||jsonb_build_object(''vehicle_history_report'',public.vehicle_history_findings(p_dealer,v.id));
     insert into public.sales_quotes(dealer_id,quote_no');
  execute format('create or replace function public.create_sales_quote(p_dealer uuid,p_input jsonb,p_request uuid)
    returns jsonb language plpgsql security definer set search_path=public as %L',original_body);
end $$;

create function public.reverse_sale_with_trade_choices(
  p_dealer uuid,p_deal uuid,p_input jsonb,p_request uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare d public.deals; old_po public.purchase_orders; new_po public.purchase_orders;
  trade_order public.deal_orders; cached public.commercial_requests; choice jsonb; choices jsonb;
  reason text; new_price numeric; carried numeric; credit_id uuid; net_paid numeric;
  customer_paid numeric; finance_paid numeric; prior_refunds numeric; sale_vehicle uuid;
  refund_method text; result jsonb; items jsonb:='[]'::jsonb; item_count integer:=0;
  payment_row record; payment_net numeric;
begin
  if auth.uid() is null or public.user_role_in(p_dealer)::text not in ('owner','admin')
    or not public.commercial_allowed(p_dealer,'purchase') then raise exception 'trade_reversal_not_allowed'; end if;
  if p_request is null or p_input is null or jsonb_typeof(p_input)<>'object'
    or octet_length(p_input::text)>40000 then raise exception 'invalid_request'; end if;
  choices:=p_input->'tradeChoices';
  if jsonb_typeof(choices)<>'array' or jsonb_array_length(choices) not between 1 and 10
    then raise exception 'trade_choices_required'; end if;
  perform 1 from public.dealers where id=p_dealer for update;
  select * into cached from public.commercial_requests where dealer_id=p_dealer and request_id=p_request;
  if found then
    if cached.command<>'return_trade_sale_multi' or cached.input<>jsonb_build_object('id',p_deal,'data',p_input)
      then raise exception 'request_reused'; end if;
    return cached.result;
  end if;
  select * into d from public.deals where id=p_deal and dealer_id=p_dealer for update;
  if not found or d.status<>'completed' then raise exception 'completed_invoice_required'; end if;
  if (p_input->>'expectedVersion')::integer is distinct from d.version then raise exception 'stale_deal'; end if;
  reason:=trim(p_input->>'reason');
  if reason is null or char_length(reason) not between 3 and 500 then raise exception 'credit_reason_required'; end if;
  if (select count(*) from public.deal_orders where dealer_id=p_dealer and deal_id=d.id and kind='purchase' and is_trade_in)
    <>jsonb_array_length(choices) then raise exception 'trade_choices_incomplete'; end if;

  for trade_order in select * from public.deal_orders
    where dealer_id=p_dealer and deal_id=d.id and kind='purchase' and is_trade_in order by created_at,id for update loop
    select value into choice from jsonb_array_elements(choices)
      where value->>'vehicleId'=trade_order.vehicle_id::text;
    if not found or (select count(*) from jsonb_array_elements(choices)
      where value->>'vehicleId'=trade_order.vehicle_id::text)<>1
      or jsonb_typeof(choice->'keep')<>'boolean' then raise exception 'trade_choices_incomplete'; end if;
    select * into old_po from public.purchase_orders
      where dealer_id=p_dealer and deal_id=d.id and vehicle_id=trade_order.vehicle_id for update;
    if not found or old_po.status='cancelled' then raise exception 'purchase_missing_or_cancelled'; end if;
    perform 1 from public.vehicles where id=trade_order.vehicle_id and dealer_id=p_dealer for update;
    if exists(select 1 from public.deal_orders downstream
      join public.deals downstream_deal on downstream_deal.id=downstream.deal_id
      where downstream.vehicle_id=trade_order.vehicle_id and downstream.kind='sale'
        and downstream.deal_id<>d.id and downstream_deal.status not in ('cancelled','reversed'))
      then raise exception 'trade_vehicle_has_downstream_deal'; end if;

    if (choice->>'keep')::boolean then
      new_price:=(choice->>'newPurchasePrice')::numeric;
      if new_price is null or new_price<=0 or new_price>100000000 or new_price<>round(new_price,2)
        or new_price<old_po.settlement_due then raise exception 'invalid_replacement_purchase_value'; end if;
      insert into public.purchase_orders(
        dealer_id,po_no,vendor_id,vehicle_id,inv_ref,status,vat_scheme,notes,
        approved_by,approved_at,created_by,due_on,settlement_valid_until,
        finance_company,finance_reference,settlement_due,trade_credit,deal_id,replaces_po_id
      ) values(
        p_dealer,public.commercial_number(p_dealer,'PO'),old_po.vendor_id,old_po.vehicle_id,
        nullif(left(choice->>'supplierReference',60),''),'approved',old_po.vat_scheme,
        left('Replacement purchase after returned sale: '||reason,1000),auth.uid(),now(),auth.uid(),
        old_po.due_on,old_po.settlement_valid_until,old_po.finance_company,old_po.finance_reference,
        old_po.settlement_due,0,null,old_po.id
      ) returning * into new_po;
      insert into public.po_lines(dealer_id,po_id,vehicle_id,description,nominal_code,qty,net,vat,gross)
      select p_dealer,new_po.id,old_po.vehicle_id,description,nominal_code,qty,
        new_price-case when old_po.vat_scheme='standard' then round(new_price*23/123,2) else 0 end,
        case when old_po.vat_scheme='standard' then round(new_price*23/123,2) else 0 end,new_price
      from public.po_lines where po_id=old_po.id order by created_at limit 1;
      if not found then raise exception 'purchase_line_missing'; end if;
      for payment_row in select * from public.po_payments
        where po_id=old_po.id and entry_kind<>'reversal' order by created_at loop
        select payment_row.amount-coalesce(sum(amount),0) into payment_net
          from public.po_payments where po_id=old_po.id and entry_kind='reversal'
            and source_payment_id=payment_row.id;
        if payment_net<0 then raise exception 'purchase_payment_over_reversed'; end if;
        if payment_net>0 then
          insert into public.po_payments(dealer_id,po_id,amount,method,paid_on,reference,created_by,
            recipient,entry_kind,source_payment_id)
          values(p_dealer,new_po.id,payment_net,payment_row.method,payment_row.paid_on,
            left('Carried from '||old_po.po_no||coalesce(' · '||payment_row.reference,''),120),
            auth.uid(),payment_row.recipient,'carry_forward',payment_row.id);
        end if;
      end loop;
      select coalesce(sum(amount),0) into carried from public.po_payments where po_id=new_po.id;
      if carried>new_price then raise exception 'replacement_purchase_overpaid'; end if;
      if carried=new_price then update public.purchase_orders set status='paid' where id=new_po.id; end if;
      update public.purchase_orders set status='cancelled',replaced_by_po_id=new_po.id,
        cancellation_reason=reason,cancelled_by=auth.uid(),cancelled_at=now(),updated_at=now()
        where id=old_po.id;
      update public.vehicle_deals set purchase_price=new_price,source='other'
        where dealer_id=p_dealer and vehicle_id=trade_order.vehicle_id;
      update public.vehicles set originating_po_id=new_po.id,provenance_status='verified',status='preparation'
        where dealer_id=p_dealer and id=trade_order.vehicle_id;
      items:=items||jsonb_build_array(jsonb_build_object('vehicleId',trade_order.vehicle_id,
        'oldPoId',old_po.id,'newPoId',new_po.id,'kept',true,'newPurchasePrice',new_price,'carriedPayments',carried));
    else
      select coalesce(sum(case when entry_kind='reversal' then -amount else amount end),0)
        into carried from public.po_payments where po_id=old_po.id;
      if carried<>0 then raise exception 'trade_return_payments_pending'; end if;
      update public.purchase_orders set status='cancelled',cancellation_reason=reason,
        cancelled_by=auth.uid(),cancelled_at=now(),updated_at=now() where id=old_po.id;
      update public.vehicles set status='returned_to_customer'
        where dealer_id=p_dealer and id=trade_order.vehicle_id;
      items:=items||jsonb_build_array(jsonb_build_object('vehicleId',trade_order.vehicle_id,
        'oldPoId',old_po.id,'kept',false,'returnedToCustomer',true));
    end if;
    item_count:=item_count+1;
  end loop;

  credit_id:=public.issue_deal_credit_note(p_dealer,d.id,reason,null,true);
  net_paid:=(public.commercial_totals(d.id)->>'paid')::numeric;
  select coalesce(sum(amount),0) into customer_paid from public.payments
    where deal_id=d.id and kind in ('deposit','balance');
  select coalesce(sum(amount),0) into finance_paid from public.payments
    where deal_id=d.id and kind='finance_payout';
  select coalesce(sum(amount),0) into prior_refunds from public.payments
    where deal_id=d.id and kind in ('refund','receipt_reversal');
  customer_paid:=greatest(customer_paid-prior_refunds,0);
  if net_paid<>customer_paid+finance_paid then raise exception 'refund_allocation_mismatch'; end if;
  refund_method:=coalesce(nullif(p_input->>'refundMethod',''),'bank');
  if refund_method not in ('cash','bank','card') then raise exception 'invalid_payment'; end if;
  if customer_paid>0 then
    insert into public.payments(dealer_id,deal_id,kind,method,amount,currency,paid_on,reference,created_by,credit_note_id,refund_recipient)
    values(p_dealer,d.id,'refund',refund_method,customer_paid,d.currency,current_date,
      left(p_input->>'reference',120),auth.uid(),credit_id,'customer');
  end if;
  if finance_paid>0 then
    insert into public.payments(dealer_id,deal_id,kind,method,amount,currency,paid_on,reference,created_by,credit_note_id,refund_recipient)
    values(p_dealer,d.id,'refund','finance',finance_paid,d.currency,current_date,
      left(p_input->>'financeReference',120),auth.uid(),credit_id,'finance_company');
  end if;
  select vehicle_id into sale_vehicle from public.deal_orders
    where deal_id=d.id and dealer_id=p_dealer and kind='sale';
  update public.vehicles set status='preparation' where id=sale_vehicle and dealer_id=p_dealer;
  update public.vehicle_deals set sale_status='none',sold_date=null,delivered_date=null
    where vehicle_id=sale_vehicle and dealer_id=p_dealer;
  update public.deals set status='reversed',stage='cancelled',version=version+1,
    cancellation_reason=reason,cancelled_by=auth.uid(),closed_at=now(),updated_at=now()
    where id=d.id;
  insert into public.deal_events(dealer_id,deal_id,kind,detail,created_by)
    values(p_dealer,d.id,'trade_sale_reversed',jsonb_build_object(
      'message','Vehicle returned; trade-ins resolved individually',
      'credit_note_id',credit_id,'trade_ins',items,'customer_refund',customer_paid,
      'finance_refund',finance_paid,'reason',reason),auth.uid());
  insert into public.audit_logs(dealer_id,user_id,action,entity,entity_id,meta)
    values(p_dealer,auth.uid(),'trade_sale_reversed','deal',d.id,jsonb_build_object(
      'credit_note_id',credit_id,'trade_ins',items,'reason',reason));
  result:=jsonb_build_object('id',credit_id,'status','reversed','vehicleId',sale_vehicle,
    'refunded',net_paid,'tradeIns',items,'tradeCount',item_count);
  insert into public.commercial_requests(dealer_id,request_id,command,input,result)
    values(p_dealer,p_request,'return_trade_sale_multi',jsonb_build_object('id',p_deal,'data',p_input),result);
  return result;
end $$;
revoke all on function public.reverse_sale_with_trade_choices(uuid,uuid,jsonb,uuid) from public,anon;
grant execute on function public.reverse_sale_with_trade_choices(uuid,uuid,jsonb,uuid) to authenticated;
