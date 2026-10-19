-- A returned sale may retain its trade-in as a new, standalone purchase.
-- The originating PO is cancelled, never deleted; prior cash movements are carried
-- into the replacement PO as non-cash opening entries linked to their source.

alter table public.purchase_orders
  add column replaces_po_id uuid references public.purchase_orders(id),
  add column replaced_by_po_id uuid references public.purchase_orders(id),
  add column cancellation_reason text,
  add column cancelled_by uuid references auth.users(id),
  add column cancelled_at timestamptz;

alter table public.po_payments
  add column entry_kind text not null default 'payment'
    check(entry_kind in ('payment','carry_forward','reversal')),
  add column source_payment_id uuid references public.po_payments(id);

create unique index po_single_carry_forward
  on public.po_payments(po_id,source_payment_id)
  where source_payment_id is not null and entry_kind='carry_forward';

alter function public.commercial_command(uuid,text,uuid,jsonb,uuid)
  rename to commercial_command_v043;
revoke all on function public.commercial_command_v043(uuid,text,uuid,jsonb,uuid)
  from public,anon,authenticated;

create function public.commercial_command(
  p_dealer uuid,p_command text,p_id uuid,p_input jsonb,p_request uuid
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  d public.deals;
  old_po public.purchase_orders;
  new_po public.purchase_orders;
  trade_order public.deal_orders;
  cached public.commercial_requests;
  reason text;
  new_price numeric;
  carried numeric;
  credit_id uuid;
  net_paid numeric;
  customer_paid numeric;
  finance_paid numeric;
  prior_refunds numeric;
  sale_vehicle uuid;
  refund_method text;
  result jsonb;
begin
  if p_command<>'return_trade_sale' then
    if p_id is not null and exists(
      select 1 from public.deals where id=p_id and dealer_id=p_dealer and status='reversed'
    ) then raise exception 'deal_closed'; end if;
    return public.commercial_command_v043(p_dealer,p_command,p_id,p_input,p_request);
  end if;
  if auth.uid() is null or public.user_role_in(p_dealer)::text not in ('owner','admin')
    or not public.commercial_allowed(p_dealer,'purchase') then
    raise exception 'trade_reversal_not_allowed';
  end if;
  if p_request is null or p_input is null or jsonb_typeof(p_input)<>'object'
    or octet_length(p_input::text)>30000 then raise exception 'invalid_request'; end if;

  perform 1 from public.dealers where id=p_dealer for update;
  select * into cached from public.commercial_requests
    where dealer_id=p_dealer and request_id=p_request;
  if found then
    if cached.command<>p_command or cached.input<>jsonb_build_object('id',p_id,'data',p_input)
      then raise exception 'request_reused'; end if;
    return cached.result;
  end if;

  select * into d from public.deals where id=p_id and dealer_id=p_dealer for update;
  if not found then raise exception 'deal_missing'; end if;
  if d.status<>'completed' then raise exception 'completed_invoice_required'; end if;
  if (p_input->>'expectedVersion')::integer is distinct from d.version then raise exception 'stale_deal'; end if;
  reason:=trim(p_input->>'reason');
  if reason is null or char_length(reason) not between 3 and 500 then raise exception 'credit_reason_required'; end if;
  if coalesce((p_input->>'keepTradeIn')::boolean,false) is not true then raise exception 'trade_return_policy_required'; end if;

  select * into trade_order from public.deal_orders
    where dealer_id=p_dealer and deal_id=d.id and kind='purchase' and is_trade_in for update;
  if not found then raise exception 'trade_in_missing'; end if;
  select * into old_po from public.purchase_orders
    where dealer_id=p_dealer and deal_id=d.id and vehicle_id=trade_order.vehicle_id for update;
  if not found or old_po.status='cancelled' then raise exception 'purchase_missing_or_cancelled'; end if;

  -- The acquired car must not have been consumed by another sale or reservation.
  perform 1 from public.vehicles where id=trade_order.vehicle_id and dealer_id=p_dealer for update;
  if exists(
    select 1 from public.deal_orders downstream join public.deals downstream_deal on downstream_deal.id=downstream.deal_id
    where downstream.vehicle_id=trade_order.vehicle_id and downstream.kind='sale'
      and downstream.deal_id<>d.id and downstream_deal.status not in ('cancelled','reversed')
  ) then raise exception 'trade_vehicle_has_downstream_deal'; end if;

  new_price:=(p_input->>'newPurchasePrice')::numeric;
  if new_price is null or new_price<=0 or new_price>100000000 or new_price<>round(new_price,2)
    then raise exception 'invalid_amount'; end if;
  if new_price<old_po.settlement_due then raise exception 'purchase_below_settlement'; end if;

  insert into public.purchase_orders(
    dealer_id,po_no,vendor_id,vehicle_id,inv_ref,status,vat_scheme,notes,
    approved_by,approved_at,created_by,due_on,settlement_valid_until,
    finance_company,finance_reference,settlement_due,trade_credit,deal_id,replaces_po_id
  ) values(
    p_dealer,public.commercial_number(p_dealer,'PO'),old_po.vendor_id,old_po.vehicle_id,
    nullif(left(p_input->>'supplierReference',60),''),'approved',old_po.vat_scheme,
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

  insert into public.po_payments(
    dealer_id,po_id,amount,method,paid_on,reference,created_by,recipient,entry_kind,source_payment_id
  ) select p_dealer,new_po.id,amount,method,paid_on,
      left('Carried from '||old_po.po_no||coalesce(' · '||reference,''),120),auth.uid(),recipient,'carry_forward',id
    from public.po_payments where po_id=old_po.id and entry_kind<>'reversal';
  select coalesce(sum(amount),0) into carried from public.po_payments where po_id=new_po.id;
  if carried=new_price then
    update public.purchase_orders set status='paid' where id=new_po.id;
  elsif carried>new_price then
    raise exception 'replacement_purchase_overpaid';
  end if;

  update public.purchase_orders set status='cancelled',replaced_by_po_id=new_po.id,
    cancellation_reason=reason,cancelled_by=auth.uid(),cancelled_at=now(),updated_at=now()
    where id=old_po.id;
  update public.vehicle_deals set purchase_price=new_price,source='other'
    where dealer_id=p_dealer and vehicle_id=trade_order.vehicle_id;
  update public.vehicles set status='bought' where dealer_id=p_dealer and id=trade_order.vehicle_id;

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
    'message','Vehicle returned; trade-in retained under a standalone purchase',
    'credit_note_id',credit_id,'old_po_id',old_po.id,'new_po_id',new_po.id,
    'old_value',trade_order.price,'new_value',new_price,'carried_payments',carried,
    'customer_refund',customer_paid,'finance_refund',finance_paid,'reason',reason
  ),auth.uid());
  insert into public.audit_logs(dealer_id,user_id,action,entity,entity_id,meta)
  values(p_dealer,auth.uid(),'trade_sale_reversed','deal',d.id,jsonb_build_object(
    'credit_note_id',credit_id,'old_po_id',old_po.id,'new_po_id',new_po.id,
    'trade_vehicle_id',trade_order.vehicle_id,'new_purchase_price',new_price,'reason',reason
  ));
  result:=jsonb_build_object('id',credit_id,'status','reversed','vehicleId',sale_vehicle,
    'refunded',net_paid,'replacementPoId',new_po.id,'retainedTradeVehicleId',trade_order.vehicle_id);
  insert into public.commercial_requests(dealer_id,request_id,command,input,result)
  values(p_dealer,p_request,p_command,jsonb_build_object('id',p_id,'data',p_input),result);
  return result;
end $$;
revoke all on function public.commercial_command(uuid,text,uuid,jsonb,uuid) from public,anon;
grant execute on function public.commercial_command(uuid,text,uuid,jsonb,uuid) to authenticated;
