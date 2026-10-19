-- Direct-purchase intake requirements and guarded PO + vehicle deletion.

alter table public.purchase_orders
  add column purchase_date date,
  add column received_on date,
  add column purchase_amount_known boolean not null default true;

create or replace function public.guard_vehicle_provenance() returns trigger
language plpgsql set search_path=public as $$
begin
  if new.originating_po_id is distinct from old.originating_po_id then
    if new.originating_po_id is null then
      if current_setting('app.purchase_delete',true)<>'on' then raise exception 'vehicle_origin_immutable';end if;
    elsif not exists(select 1 from public.purchase_orders po where po.id=new.originating_po_id and po.vehicle_id=new.id and po.dealer_id=new.dealer_id) then
      raise exception 'invalid_vehicle_origin';
    elsif old.originating_po_id is not null and not exists(
      select 1 from public.purchase_orders replacement join public.purchase_orders original on original.id=old.originating_po_id
      where replacement.id=new.originating_po_id and replacement.replaces_po_id=original.id
        and replacement.vehicle_id=new.id and replacement.dealer_id=new.dealer_id and original.status='cancelled'
    ) then raise exception 'vehicle_origin_immutable';end if;
  end if;
  if (new.originating_po_id is null and new.provenance_status<>'legacy_unresolved')
    or (new.originating_po_id is not null and new.provenance_status<>'verified') then raise exception 'invalid_provenance_status';end if;
  return new;
end $$;

alter function public.commercial_command(uuid,text,uuid,jsonb,uuid)
  rename to commercial_command_v052;
revoke all on function public.commercial_command_v052(uuid,text,uuid,jsonb,uuid) from public,anon,authenticated;

create function public.commercial_command(p_dealer uuid,p_command text,p_id uuid,p_input jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  cached public.commercial_requests;
  po public.purchase_orders;
  vehicle public.vehicles;
  vendor_id uuid;
  new_vendor jsonb;
  new_vehicle_id uuid;
  po_number text;
  amount numeric;
  settlement numeric;
  bought_on date;
  arrived_on date;
  km_value integer;
  result jsonb;
begin
  if p_command not in ('purchase','delete_purchase_vehicle') then
    return public.commercial_command_v052(p_dealer,p_command,p_id,p_input,p_request);
  end if;
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'purchase') then raise exception 'commercial_not_allowed';end if;
  if p_request is null or p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>30000 then raise exception 'invalid_request';end if;
  perform 1 from public.dealers where id=p_dealer for update;
  select * into cached from public.commercial_requests where dealer_id=p_dealer and request_id=p_request;
  if found then
    if cached.command<>p_command or cached.input<>jsonb_build_object('id',p_id,'data',p_input) then raise exception 'request_reused';end if;
    return cached.result;
  end if;

  if p_command='purchase' then
    if coalesce(length(trim(p_input->>'make')),0)=0 or coalesce(length(trim(p_input->>'model')),0)=0
      or coalesce(length(trim(p_input->>'registration')),0)=0
      or coalesce((p_input->>'year')::integer,0) not between 1950 and 2100 then raise exception 'invalid_vehicle';end if;
    km_value:=nullif(p_input->>'km','')::integer;
    if km_value is null or km_value<0 or km_value>10000000 then raise exception 'purchase_km_required';end if;
    if coalesce(length(trim(p_input->>'invRef')),0) not between 1 and 80 then raise exception 'supplier_invoice_required';end if;
    bought_on:=nullif(p_input->>'purchaseDate','')::date;
    arrived_on:=nullif(p_input->>'receivedOn','')::date;
    if bought_on is null then raise exception 'purchase_date_required';end if;
    if arrived_on is null then raise exception 'vehicle_received_date_required';end if;
    if arrived_on<bought_on then raise exception 'vehicle_received_before_purchase';end if;
    if bought_on>current_date or arrived_on>current_date then raise exception 'purchase_dates_in_future';end if;

    amount:=nullif(p_input->>'price','')::numeric;
    if amount is not null and (amount<0 or amount>100000000 or amount<>round(amount,2)) then raise exception 'invalid_purchase_amount';end if;
    settlement:=coalesce(nullif(p_input->>'settlement','')::numeric,0);
    if settlement<0 or settlement>100000000 or settlement<>round(settlement,2)
      or (amount is not null and settlement>amount) then raise exception 'invalid_settlement';end if;
    if settlement>0 and (coalesce(length(trim(p_input->>'settlementProvider')),0)<2
      or nullif(p_input->>'settlementValidUntil','') is null) then raise exception 'settlement_details_required';end if;
    if exists(select 1 from public.vehicles where dealer_id=p_dealer
      and lower(regexp_replace(registration,'[^a-zA-Z0-9]','','g'))=lower(regexp_replace(p_input->>'registration','[^a-zA-Z0-9]','','g'))
      and status<>'sold') then raise exception 'duplicate_registration';end if;

    vendor_id:=nullif(p_input->>'vendorId','')::uuid;
    new_vendor:=p_input->'newVendor';
    if vendor_id is null then
      if coalesce(length(trim(new_vendor->>'name')),0)<2 then raise exception 'vendor_required';end if;
      insert into public.customers(dealer_id,name,type,phone,email)
        values(p_dealer,left(new_vendor->>'name',120),'business',left(new_vendor->>'phone',40),left(new_vendor->>'email',200))
        returning id into vendor_id;
    elsif not exists(select 1 from public.customers where id=vendor_id and dealer_id=p_dealer and deleted_at is null) then
      raise exception 'invalid_vendor';
    end if;

    insert into public.vehicles(dealer_id,make,model,year,registration,km,status,stock_class,created_by)
      values(p_dealer,left(p_input->>'make',60),left(p_input->>'model',80),(p_input->>'year')::integer,
        upper(left(p_input->>'registration',20)),km_value,'preparation','main',auth.uid()) returning id into new_vehicle_id;
    po_number:=public.commercial_number(p_dealer,'PO');
    insert into public.purchase_orders(
      dealer_id,po_no,vendor_id,vehicle_id,vat_scheme,inv_ref,notes,created_by,due_on,
      finance_company,finance_reference,settlement_due,settlement_valid_until,
      purchase_date,received_on,purchase_amount_known
    ) values(
      p_dealer,po_number,vendor_id,new_vehicle_id,coalesce(p_input->>'vatScheme','none'),left(trim(p_input->>'invRef'),80),
      left(p_input->>'notes',1000),auth.uid(),nullif(p_input->>'dueOn','')::date,
      left(p_input->>'settlementProvider',120),left(p_input->>'settlementReference',120),settlement,
      nullif(p_input->>'settlementValidUntil','')::date,bought_on,arrived_on,amount is not null
    ) returning * into po;
    if po.due_on is null and settlement>0 then
      update public.purchase_orders set due_on=po.settlement_valid_until where id=po.id;
    end if;
    insert into public.po_lines(dealer_id,po_id,vehicle_id,description,qty,net,vat,gross)
      values(p_dealer,po.id,new_vehicle_id,p_input->>'registration',1,
        coalesce(amount,0)-case when po.vat_scheme='standard' then round(coalesce(amount,0)*23/123,2) else 0 end,
        case when po.vat_scheme='standard' then round(coalesce(amount,0)*23/123,2) else 0 end,coalesce(amount,0));
    insert into public.vehicle_deals(vehicle_id,dealer_id,purchase_price,purchase_date,supplier,vat_scheme,source)
      values(new_vehicle_id,p_dealer,amount,bought_on,(select name from public.customers where id=vendor_id),po.vat_scheme,'other');
    update public.vehicles set originating_po_id=po.id,provenance_status='verified' where id=new_vehicle_id and dealer_id=p_dealer;
    insert into public.audit_logs(dealer_id,user_id,action,entity,entity_id,meta)
      values(p_dealer,auth.uid(),'purchase_created','purchase_order',po.id,jsonb_build_object(
        'vehicle_id',new_vehicle_id,'amount_known',amount is not null,'total',amount,'settlement',settlement,
        'supplier_invoice',trim(p_input->>'invRef'),'purchase_date',bought_on,'received_on',arrived_on,'km',km_value));
    result:=jsonb_build_object('id',po.id,'vehicleId',new_vehicle_id);
  else
    if public.user_role_in(p_dealer)::text not in ('owner','admin') then raise exception 'purchase_delete_not_allowed';end if;
    select * into po from public.purchase_orders where id=p_id and dealer_id=p_dealer for update;
    if not found then raise exception 'purchase_missing';end if;
    select * into vehicle from public.vehicles where id=po.vehicle_id and dealer_id=p_dealer for update;
    if not found or vehicle.originating_po_id is distinct from po.id then raise exception 'purchase_vehicle_origin_mismatch';end if;
    if po.deal_id is not null
      or exists(select 1 from public.deal_orders orders where orders.dealer_id=p_dealer and orders.vehicle_id=vehicle.id)
      or exists(select 1 from public.purchase_orders other where other.dealer_id=p_dealer and other.vehicle_id=vehicle.id and other.id<>po.id)
      or exists(select 1 from public.purchase_orders replacement where replacement.replaces_po_id=po.id)
      then raise exception 'purchase_vehicle_in_use';end if;

    delete from public.po_payments payments where payments.po_id=po.id and payments.dealer_id=p_dealer;
    delete from public.po_lines lines where lines.po_id=po.id and lines.dealer_id=p_dealer;
    perform set_config('app.purchase_delete','on',true);
    update public.vehicles set originating_po_id=null,provenance_status='legacy_unresolved' where id=vehicle.id and dealer_id=p_dealer;
    delete from public.purchase_orders where id=po.id and dealer_id=p_dealer;
    delete from public.vehicle_service_history history where history.dealer_id=p_dealer and history.vehicle_id=vehicle.id;
    delete from public.vehicle_details details where details.dealer_id=p_dealer and details.vehicle_id=vehicle.id;
    delete from public.vehicles where id=vehicle.id and dealer_id=p_dealer;
    insert into public.audit_logs(dealer_id,user_id,action,entity,entity_id,meta)
      values(p_dealer,auth.uid(),'purchase_vehicle_deleted','purchase_order',po.id,jsonb_build_object(
        'po_no',po.po_no,'vehicle_id',vehicle.id,'registration',vehicle.registration,
        'financial_entries_removed',true));
    result:=jsonb_build_object('id',po.id,'vehicleId',vehicle.id,'deleted',true);
  end if;

  insert into public.commercial_requests(dealer_id,request_id,command,input,result)
    values(p_dealer,p_request,p_command,jsonb_build_object('id',p_id,'data',p_input),result);
  return result;
end $$;
revoke all on function public.commercial_command(uuid,text,uuid,jsonb,uuid) from public,anon;
grant execute on function public.commercial_command(uuid,text,uuid,jsonb,uuid) to authenticated;

-- Unknown acquisition value is not presented as a known zero in the canonical output.
alter function public.purchase_payable_rows(uuid) rename to purchase_payable_rows_v051;
revoke all on function public.purchase_payable_rows_v051(uuid) from public,anon,authenticated;
create function public.purchase_payable_rows(p_dealer uuid)
returns table(
  id uuid,po_no text,status text,source text,created_at timestamptz,due_on date,
  vendor text,vehicle_id uuid,car text,vehicle_status text,total numeric,trade_credit numeric,
  vendor_due numeric,finance_due numeric,vendor_paid numeric,finance_paid numeric,
  paid numeric,outstanding numeric,vendor_outstanding numeric,finance_outstanding numeric,to_be_paid numeric,payment_state text,
  finance_company text,finance_reference text,amount_known boolean,purchase_date date,received_on date,inv_ref text
) language sql stable security definer set search_path=public as $$
  select po.id,po.po_no,po.status,case when po.deal_id is null then 'direct' else 'trade_in' end,po.created_at,po.due_on,
    coalesce(c.name,'—'),v.id,concat_ws(' ',v.year,v.make,v.model,nullif(v.registration,'')),v.status::text,
    case when po.purchase_amount_known then coalesce(lines.total,0) else null end,po.trade_credit,
    case when po.purchase_amount_known then greatest(coalesce(lines.total,0)-po.trade_credit-po.settlement_due,0) else null end,po.settlement_due,
    coalesce(pay.vendor,0),coalesce(pay.finance,0),coalesce(pay.vendor,0)+coalesce(pay.finance,0),
    case when po.status='cancelled' then 0 else
      coalesce(case when po.purchase_amount_known then greatest(coalesce(lines.total,0)-po.trade_credit-po.settlement_due-coalesce(pay.vendor,0),0) end,0)
      +greatest(po.settlement_due-coalesce(pay.finance,0),0) end,
    case when po.status='cancelled' then 0 when po.purchase_amount_known then greatest(coalesce(lines.total,0)-po.trade_credit-po.settlement_due-coalesce(pay.vendor,0),0) else null end,
    case when po.status='cancelled' then 0 else greatest(po.settlement_due-coalesce(pay.finance,0),0) end,
    case when po.status='cancelled' then 0 else
      coalesce(case when po.purchase_amount_known then greatest(coalesce(lines.total,0)-po.trade_credit-po.settlement_due-coalesce(pay.vendor,0),0) end,0)
      +greatest(po.settlement_due-coalesce(pay.finance,0),0) end,
    case when po.status='cancelled' then 'reversed'
      when not po.purchase_amount_known then 'amount_pending'
      when greatest(coalesce(lines.total,0)-po.trade_credit-coalesce(pay.vendor,0)-coalesce(pay.finance,0),0)=0 then 'paid'
      when po.due_on is not null and po.due_on<current_date then 'overdue'
      when coalesce(pay.vendor,0)+coalesce(pay.finance,0)>0 then 'partially_paid'
      else 'unpaid' end,
    po.finance_company,po.finance_reference,po.purchase_amount_known,po.purchase_date,po.received_on,po.inv_ref
  from public.purchase_orders po
  left join public.customers c on c.id=po.vendor_id and c.dealer_id=po.dealer_id
  left join public.vehicles v on v.id=po.vehicle_id and v.dealer_id=po.dealer_id
  left join lateral(select sum(gross) total from public.po_lines where po_id=po.id) lines on true
  left join lateral(select
    sum(case when entry_kind='reversal' then -amount else amount end) filter(where recipient='vendor') vendor,
    sum(case when entry_kind='reversal' then -amount else amount end) filter(where recipient='finance') finance
    from public.po_payments where po_id=po.id) pay on true
  where po.dealer_id=p_dealer;
$$;
revoke all on function public.purchase_payable_rows(uuid) from public,anon,authenticated;

create or replace function public.purchase_balances(p_dealer uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'purchase') then raise exception 'commercial_not_allowed';end if;
  return coalesce((select jsonb_agg(to_jsonb(r) order by r.due_on nulls last,r.po_no)
    from public.purchase_payable_rows(p_dealer) r where r.status<>'cancelled'),'[]'::jsonb);
end $$;

create or replace function public.purchase_payable_report(p_dealer uuid,p_from date,p_to date)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare summary jsonb;positions jsonb;
begin
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'cost') then raise exception 'commercial_not_allowed';end if;
  if p_from is null or p_to is null or p_from>p_to or p_to-p_from>3660 then raise exception 'invalid_report_period';end if;
  select jsonb_build_object(
    'acquisitionValue',coalesce(sum(total) filter(where status<>'cancelled' and amount_known and created_at::date between p_from and p_to),0),
    'unknownAcquisitionValues',count(*) filter(where status<>'cancelled' and not amount_known),
    'vendorPaid',coalesce((select sum(case when pp.entry_kind='reversal' then -pp.amount else pp.amount end) from public.po_payments pp join public.purchase_orders po on po.id=pp.po_id where po.dealer_id=p_dealer and pp.recipient='vendor' and pp.paid_on between p_from and p_to),0),
    'financePaid',coalesce((select sum(case when pp.entry_kind='reversal' then -pp.amount else pp.amount end) from public.po_payments pp join public.purchase_orders po on po.id=pp.po_id where po.dealer_id=p_dealer and pp.recipient='finance' and pp.paid_on between p_from and p_to),0),
    'vendorOutstanding',coalesce(sum(vendor_outstanding),0),'financeOutstanding',coalesce(sum(finance_outstanding),0),
    'toBePaid',coalesce(sum(to_be_paid),0),
    'overdue',coalesce(sum(to_be_paid) filter(where payment_state='overdue'),0),
    'dueSoon',coalesce(sum(to_be_paid) filter(where due_on between current_date and current_date+30),0),
    'stockValue',coalesce(sum(total) filter(where status<>'cancelled' and amount_known and vehicle_status<>'sold'),0),
    'stockUnpaidLiability',coalesce(sum(to_be_paid) filter(where status<>'cancelled' and vehicle_status<>'sold'),0)
  ) into summary from public.purchase_payable_rows(p_dealer);
  select coalesce(jsonb_agg(to_jsonb(r) order by case r.payment_state when 'overdue' then 0 when 'amount_pending' then 1 when 'unpaid' then 2 when 'partially_paid' then 3 else 4 end,r.due_on nulls last,r.po_no),'[]'::jsonb)
    into positions from public.purchase_payable_rows(p_dealer) r where r.status<>'cancelled';
  return jsonb_build_object('summary',summary,'positions',positions,'period',jsonb_build_object('from',p_from,'to',p_to));
end $$;
revoke all on function public.purchase_payable_report(uuid,date,date) from public,anon;
grant execute on function public.purchase_payable_report(uuid,date,date) to authenticated;
