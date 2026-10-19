-- Resolve an unlinked legacy vehicle through a new, audited acquisition PO.
-- The regular purchase command continues to create a new vehicle; this command never does.
alter function public.commercial_command(uuid,text,uuid,jsonb,uuid)
  rename to commercial_command_v068;
revoke all on function public.commercial_command_v068(uuid,text,uuid,jsonb,uuid) from public,anon,authenticated;

create function public.commercial_command(p_dealer uuid,p_command text,p_id uuid,p_input jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  cached public.commercial_requests;
  vehicle public.vehicles;
  existing_cost public.vehicle_deals;
  po public.purchase_orders;
  vendor_id uuid;
  amount numeric;
  settlement numeric;
  bought_on date;
  arrived_on date;
  result jsonb;
begin
  if p_command<>'purchase_existing' then
    return public.commercial_command_v068(p_dealer,p_command,p_id,p_input,p_request);
  end if;
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'purchase') then raise exception 'commercial_not_allowed'; end if;
  if p_request is null or p_id is not null or p_input is null or jsonb_typeof(p_input)<>'object'
    or octet_length(p_input::text)>30000 then raise exception 'invalid_request'; end if;
  perform 1 from public.dealers where id=p_dealer for update;
  select * into cached from public.commercial_requests where dealer_id=p_dealer and request_id=p_request;
  if found then
    if cached.command<>p_command or cached.input<>jsonb_build_object('id',p_id,'data',p_input) then raise exception 'request_reused'; end if;
    return cached.result;
  end if;

  select * into vehicle from public.vehicles
    where id=nullif(p_input->>'existingVehicleId','')::uuid and dealer_id=p_dealer for update;
  if not found then raise exception 'vehicle_missing'; end if;
  if vehicle.originating_po_id is not null or vehicle.provenance_status<>'legacy_unresolved'
    or exists(select 1 from public.purchase_orders where dealer_id=p_dealer and vehicle_id=vehicle.id)
    then raise exception 'vehicle_already_has_po'; end if;
  if vehicle.status='sold' or exists(select 1 from public.deal_orders where dealer_id=p_dealer and vehicle_id=vehicle.id)
    then raise exception 'vehicle_has_sale_history'; end if;
  if vehicle.make is distinct from p_input->>'make' or vehicle.model is distinct from p_input->>'model'
    or vehicle.year is distinct from nullif(p_input->>'year','')::integer
    or vehicle.registration is distinct from p_input->>'registration'
    or vehicle.km is distinct from nullif(p_input->>'km','')::integer
    then raise exception 'vehicle_changed_refresh'; end if;
  select * into existing_cost from public.vehicle_deals where vehicle_id=vehicle.id and dealer_id=p_dealer for update;
  if found and (existing_cost.purchase_price is not null or existing_cost.sale_price is not null
    or existing_cost.sale_status<>'none') then raise exception 'legacy_financial_review_required'; end if;

  if coalesce(length(trim(p_input->>'invRef')),0) not between 1 and 80 then raise exception 'supplier_invoice_required'; end if;
  bought_on:=nullif(p_input->>'purchaseDate','')::date;
  arrived_on:=nullif(p_input->>'receivedOn','')::date;
  if bought_on is null then raise exception 'purchase_date_required'; end if;
  if arrived_on is null then raise exception 'vehicle_received_date_required'; end if;
  if arrived_on<bought_on then raise exception 'vehicle_received_before_purchase'; end if;
  if bought_on>current_date or arrived_on>current_date then raise exception 'purchase_dates_in_future'; end if;
  amount:=nullif(p_input->>'price','')::numeric;
  if amount is not null and (amount<0 or amount>100000000 or amount<>round(amount,2)) then raise exception 'invalid_purchase_amount'; end if;
  settlement:=coalesce(nullif(p_input->>'settlement','')::numeric,0);
  if settlement<0 or settlement>100000000 or settlement<>round(settlement,2)
    or (amount is not null and settlement>amount) then raise exception 'invalid_settlement'; end if;
  if settlement>0 and (coalesce(length(trim(p_input->>'settlementProvider')),0)<2
    or nullif(p_input->>'settlementValidUntil','') is null) then raise exception 'settlement_details_required'; end if;

  vendor_id:=nullif(p_input->>'vendorId','')::uuid;
  if vendor_id is null then
    if coalesce(length(trim(p_input->'newVendor'->>'name')),0)<2 then raise exception 'vendor_required'; end if;
    insert into public.customers(dealer_id,name,type,phone,email)
      values(p_dealer,left(p_input->'newVendor'->>'name',120),'business',
        left(p_input->'newVendor'->>'phone',40),left(p_input->'newVendor'->>'email',200))
      returning id into vendor_id;
  elsif not exists(select 1 from public.customers where id=vendor_id and dealer_id=p_dealer and deleted_at is null) then
    raise exception 'invalid_vendor';
  end if;

  insert into public.purchase_orders(
    dealer_id,po_no,vendor_id,vehicle_id,vat_scheme,inv_ref,notes,created_by,due_on,
    finance_company,finance_reference,settlement_due,settlement_valid_until,
    purchase_date,received_on,purchase_amount_known
  ) values(
    p_dealer,public.commercial_number(p_dealer,'PO'),vendor_id,vehicle.id,
    coalesce(p_input->>'vatScheme','none'),left(trim(p_input->>'invRef'),80),
    left(p_input->>'notes',1000),auth.uid(),nullif(p_input->>'dueOn','')::date,
    left(p_input->>'settlementProvider',120),left(p_input->>'settlementReference',120),settlement,
    nullif(p_input->>'settlementValidUntil','')::date,bought_on,arrived_on,amount is not null
  ) returning * into po;
  if po.due_on is null and settlement>0 then
    update public.purchase_orders set due_on=po.settlement_valid_until where id=po.id;
  end if;
  insert into public.po_lines(dealer_id,po_id,vehicle_id,description,qty,net,vat,gross)
    values(p_dealer,po.id,vehicle.id,vehicle.registration,1,
      coalesce(amount,0)-case when po.vat_scheme='standard' then round(coalesce(amount,0)*23/123,2) else 0 end,
      case when po.vat_scheme='standard' then round(coalesce(amount,0)*23/123,2) else 0 end,coalesce(amount,0));
  insert into public.vehicle_deals(vehicle_id,dealer_id,purchase_price,purchase_date,supplier,vat_scheme,source)
    values(vehicle.id,p_dealer,amount,bought_on,
      (select name from public.customers where id=vendor_id),po.vat_scheme,'other')
    on conflict(vehicle_id) do update set purchase_price=excluded.purchase_price,
      purchase_date=excluded.purchase_date,supplier=excluded.supplier,
      vat_scheme=excluded.vat_scheme,source=excluded.source;
  update public.vehicles set originating_po_id=po.id,provenance_status='verified'
    where id=vehicle.id and dealer_id=p_dealer;
  insert into public.audit_logs(dealer_id,user_id,action,entity,entity_id,meta)
    values(p_dealer,auth.uid(),'existing_vehicle_purchase_created','purchase_order',po.id,
      jsonb_build_object('vehicle_id',vehicle.id,'amount_known',amount is not null,'total',amount,
        'supplier_invoice',trim(p_input->>'invRef'),'purchase_date',bought_on,'received_on',arrived_on));
  result:=jsonb_build_object('id',po.id,'vehicleId',vehicle.id);
  insert into public.commercial_requests(dealer_id,request_id,command,input,result)
    values(p_dealer,p_request,p_command,jsonb_build_object('id',p_id,'data',p_input),result);
  return result;
end $$;
revoke all on function public.commercial_command(uuid,text,uuid,jsonb,uuid) from public,anon;
grant execute on function public.commercial_command(uuid,text,uuid,jsonb,uuid) to authenticated;
