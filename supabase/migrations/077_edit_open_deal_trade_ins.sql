-- Edit an existing acquisition only while its sales Deal is open.
create function public.deal_trade_finance_reference(p_dealer uuid,p_deal uuid,p_vehicle uuid)
returns text language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'work') then raise exception 'commercial_not_allowed'; end if;
  return (select po.finance_reference from public.purchase_orders po where po.dealer_id=p_dealer and po.deal_id=p_deal
    and po.vehicle_id=p_vehicle and po.status<>'cancelled' and exists(select 1 from public.deal_orders o
      where o.dealer_id=p_dealer and o.deal_id=p_deal and o.vehicle_id=p_vehicle and o.is_trade_in) limit 1);
end $$;
revoke all on function public.deal_trade_finance_reference(uuid,uuid,uuid) from public,anon;
grant execute on function public.deal_trade_finance_reference(uuid,uuid,uuid) to authenticated;

create function public.edit_deal_trade_in(p_dealer uuid,p_deal uuid,p_vehicle uuid,p_version integer,p_data jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare d public.deals; o public.deal_orders; po public.purchase_orders; v public.vehicles;
  cached public.commercial_requests; payload jsonb; result jsonb; before_data jsonb;
  allowance numeric; settlement numeric; finance_paid numeric; vendor_paid numeric; tax numeric;
  history jsonb; prior_history jsonb; financial_change boolean;
begin
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'work') then raise exception 'commercial_not_allowed'; end if;
  if p_request is null or p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>6000 then raise exception 'invalid_trade_in'; end if;
  payload:=jsonb_build_object('deal',p_deal,'vehicle',p_vehicle,'version',p_version,'data',p_data);
  perform 1 from public.dealers where id=p_dealer for update;
  select * into cached from public.commercial_requests where dealer_id=p_dealer and request_id=p_request;
  if found then
    if cached.command<>'edit_trade_in' or cached.input<>payload then raise exception 'request_reused'; end if;
    return cached.result;
  end if;
  select * into d from public.deals where id=p_deal and dealer_id=p_dealer for update;
  if not found or d.status in ('completed','cancelled','reversed') or exists(
    select 1 from public.deal_documents where deal_id=p_deal and dealer_id=p_dealer and kind='invoice' and status<>'void'
  ) then raise exception 'deal_closed'; end if;
  if d.version is distinct from p_version then raise exception 'stale_deal'; end if;
  select * into o from public.deal_orders where dealer_id=p_dealer and deal_id=p_deal and vehicle_id=p_vehicle and kind='purchase' and is_trade_in for update;
  if not found then raise exception 'trade_in_missing'; end if;
  select * into po from public.purchase_orders where dealer_id=p_dealer and deal_id=p_deal and vehicle_id=p_vehicle and status<>'cancelled' for update;
  if not found then raise exception 'purchase_missing_or_cancelled'; end if;
  select * into v from public.vehicles where id=p_vehicle and dealer_id=p_dealer for update;
  if not found then raise exception 'vehicle_missing'; end if;
  allowance:=(p_data->>'allowance')::numeric;settlement:=(p_data->>'settlement')::numeric;
  if allowance is null or allowance<=0 or allowance>100000000 or allowance<>round(allowance,2)
    or settlement is null or settlement<0 or settlement>100000000 or settlement<>round(settlement,2) then raise exception 'invalid_amount'; end if;
  if coalesce(length(trim(p_data->>'registration')),0) not between 4 and 20
    or coalesce(length(trim(p_data->>'make')),0) not between 2 and 60
    or coalesce(length(trim(p_data->>'model')),0) not between 1 and 80
    or coalesce((p_data->>'year')::integer,0) not between 1950 and 2100
    or coalesce((p_data->>'km')::integer,-1) not between 0 and 5000000
    or length(coalesce(p_data->>'vin',''))>17 then raise exception 'invalid_vehicle'; end if;
  if settlement>0 and (coalesce(length(trim(p_data->>'settlementProvider')),0)<2 or nullif(p_data->>'settlementValidUntil','') is null) then raise exception 'settlement_details_required'; end if;
  if exists(select 1 from public.vehicles where dealer_id=p_dealer and id<>p_vehicle
    and status not in ('sold','returned_to_customer') and lower(regexp_replace(registration,'[^a-zA-Z0-9]','','g'))=lower(regexp_replace(p_data->>'registration','[^a-zA-Z0-9]','','g')))
    then raise exception 'duplicate_registration'; end if;
  financial_change:=o.price is distinct from allowance or o.settlement_amount is distinct from settlement
    or coalesce(po.finance_company,'') is distinct from coalesce(p_data->>'settlementProvider','')
    or coalesce(po.finance_reference,'') is distinct from coalesce(p_data->>'settlementReference','');
  select coalesce(sum(case when entry_kind='reversal' then -amount else amount end) filter(where recipient='finance'),0),
    coalesce(sum(case when entry_kind='reversal' then -amount else amount end) filter(where recipient='vendor'),0)
    into finance_paid,vendor_paid from public.po_payments where po_id=po.id and dealer_id=p_dealer;
  if financial_change and (finance_paid>settlement or vendor_paid<>0 or (finance_paid>0 and (
    coalesce(po.finance_company,'') is distinct from coalesce(p_data->>'settlementProvider','')
    or coalesce(po.finance_reference,'') is distinct from coalesce(p_data->>'settlementReference','')))) then raise exception 'trade_edit_payments_conflict'; end if;
  if (select count(*) from public.po_lines where po_id=po.id)<>1 then raise exception 'trade_po_lines_require_review'; end if;
  before_data:=jsonb_build_object('vehicle',to_jsonb(v),'order',to_jsonb(o),'purchase',to_jsonb(po));
  update public.vehicles set registration=upper(trim(p_data->>'registration')),make=trim(p_data->>'make'),model=trim(p_data->>'model'),
    year=(p_data->>'year')::integer,km=(p_data->>'km')::integer,updated_at=now(),updated_by=auth.uid() where id=p_vehicle;
  insert into public.vehicle_details(vehicle_id,dealer_id,vin,colour,condition_notes)
    values(p_vehicle,p_dealer,nullif(upper(trim(p_data->>'vin')),''),nullif(p_data->>'colour',''),nullif(p_data->>'conditionNotes',''))
    on conflict(vehicle_id) do update set vin=excluded.vin,colour=excluded.colour,condition_notes=excluded.condition_notes;
  update public.deal_orders set price=allowance,settlement_amount=settlement,net_equity=allowance-settlement,
    settlement_provider=case when settlement>0 then trim(p_data->>'settlementProvider') end,
    settlement_valid_until=case when settlement>0 then (p_data->>'settlementValidUntil')::date end where id=o.id;
  update public.purchase_orders set settlement_due=settlement,trade_credit=allowance-settlement,
    finance_company=case when settlement>0 then trim(p_data->>'settlementProvider') end,
    finance_reference=case when settlement>0 then nullif(trim(p_data->>'settlementReference'),'') end,
    settlement_valid_until=case when settlement>0 then (p_data->>'settlementValidUntil')::date end,
    due_on=case when due_on is not distinct from po.settlement_valid_until then case when settlement>0 then (p_data->>'settlementValidUntil')::date end else due_on end,
    status=case when po.status='paid' and settlement>finance_paid then 'approved' else po.status end,
    updated_at=now(),updated_by=auth.uid() where id=po.id;
  tax:=case when po.vat_scheme='standard' then round(allowance*23/123,2) else 0 end;
  update public.po_lines set description=upper(trim(p_data->>'registration')),gross=allowance,vat=tax,net=allowance-tax where po_id=po.id;
  update public.vehicle_deals set purchase_price=allowance where vehicle_id=p_vehicle and dealer_id=p_dealer;
  history:=p_data->'history';
  if history is null or jsonb_typeof(history)<>'object' then raise exception 'invalid_vehicle_history'; end if;
  select jsonb_build_object('accident',accident_status,'writeOff',write_off_status,'stolen',stolen_status,'mileageDiscrepancy',mileage_discrepancy_status,
    'source',source,'reportReference',coalesce(report_reference,''),'reportedOn',reported_on::text,'notes',coalesce(notes,''))
    into prior_history from public.vehicle_history_reports where vehicle_id=p_vehicle and dealer_id=p_dealer order by created_at desc,id desc limit 1;
  history:=history||jsonb_build_object('reportReference',coalesce(history->>'reportReference',''),'reportedOn',coalesce(nullif(history->>'reportedOn',''),current_date::text),'notes',coalesce(history->>'notes',''));
  if history is distinct from prior_history then perform public.record_vehicle_history_report(p_dealer,p_vehicle,history); end if;
  update public.deals set siv_total=(select coalesce(sum(net_equity),0) from public.deal_orders where deal_id=p_deal and dealer_id=p_dealer and is_trade_in),version=version+1,updated_at=now() where id=p_deal;
  update public.deal_documents set status='void' where dealer_id=p_dealer and deal_id=p_deal and kind in ('quote','agreement') and status<>'void';
  insert into public.deal_events(dealer_id,deal_id,kind,detail,created_by) values(p_dealer,p_deal,'trade_in_edited',
    jsonb_build_object('message','Trade-in updated; PO and balance recalculated. Generate an updated agreement.','vehicle_id',p_vehicle,'po_id',po.id,'before',jsonb_build_object('allowance',o.price,'settlement',o.settlement_amount),'after',jsonb_build_object('allowance',allowance,'settlement',settlement)),auth.uid());
  insert into public.audit_logs(dealer_id,user_id,action,entity,entity_id,meta) values(p_dealer,auth.uid(),'trade_in_edited','deal',p_deal,jsonb_build_object('before',before_data,'after',p_data,'vehicle_id',p_vehicle,'po_id',po.id));
  result:=jsonb_build_object('id',p_vehicle,'version',d.version+1);
  insert into public.commercial_requests(dealer_id,request_id,command,input,result) values(p_dealer,p_request,'edit_trade_in',payload,result);
  return result;
end $$;
revoke all on function public.edit_deal_trade_in(uuid,uuid,uuid,integer,jsonb,uuid) from public,anon;
grant execute on function public.edit_deal_trade_in(uuid,uuid,uuid,integer,jsonb,uuid) to authenticated;
