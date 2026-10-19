-- A cancelled sale can still have money to return. An obligation is not a payment.
create table public.deal_refund_obligations (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id),
  deal_id uuid not null references public.deals(id),
  recipient text not null default 'customer' check(recipient in ('customer','finance_company')),
  amount numeric(14,2) not null check(amount>=0),
  paid_amount numeric(14,2) not null default 0 check(paid_amount>=0 and paid_amount<=amount),
  currency text not null,
  status text not null default 'pending' check(status in ('pending','partially_paid','paid','resolved')),
  reason text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(dealer_id,deal_id,recipient)
);
alter table public.deal_refund_obligations enable row level security;
revoke all on public.deal_refund_obligations from public,anon,authenticated;
grant select on public.deal_refund_obligations to authenticated;
create policy "commercial refund read" on public.deal_refund_obligations for select to authenticated
  using(public.commercial_allowed(dealer_id,'read'));
alter table public.payments add column refund_obligation_id uuid references public.deal_refund_obligations(id);

-- Called only by the locked commercial wrapper. Confirming late money increases
-- the obligation; it never reopens the cancelled sale or creates a cash outflow.
create function public.sync_cancelled_deal_refunds(p_dealer uuid,p_deal uuid)
returns void language plpgsql security definer set search_path=public as $$
declare d public.deals; item public.deal_refund_obligations; target numeric; net numeric; lender numeric;
  recipient_kind text; already_paid numeric; wanted numeric;
begin
  select * into d from public.deals where dealer_id=p_dealer and id=p_deal for update;
  if not found or d.status<>'cancelled' then return; end if;
  net:=greatest((public.commercial_totals(d.id)->>'paid')::numeric,0);
  select greatest(coalesce(sum(p.amount-coalesce((select sum(r.amount) from public.payments r where r.reverses_payment_id=p.id),0)),0),0)
    into lender from public.payments p where p.dealer_id=p_dealer and p.deal_id=p_deal
      and p.kind='finance_payout' and p.clearance_status in ('cleared','not_required');
  foreach recipient_kind in array array['customer','finance_company'] loop
    target:=case when recipient_kind='finance_company' then least(net,lender) else greatest(net-lender,0) end;
    select * into item from public.deal_refund_obligations where dealer_id=p_dealer and deal_id=p_deal and recipient=recipient_kind for update;
    already_paid:=coalesce(item.paid_amount,0); wanted:=already_paid+target;
    if item.id is null and target>0 then
      insert into public.deal_refund_obligations(dealer_id,deal_id,recipient,amount,currency,reason,created_by)
        values(p_dealer,p_deal,recipient_kind,wanted,d.currency,d.cancellation_reason,auth.uid()) returning * into item;
    elsif item.id is not null and item.amount<>wanted then
      update public.deal_refund_obligations set amount=wanted,
        status=case when target=0 then 'resolved' when paid_amount>0 then 'partially_paid' else 'pending' end,updated_at=now()
        where id=item.id returning * into item;
    else continue;
    end if;
    insert into public.deal_events(dealer_id,deal_id,kind,detail,created_by) values(p_dealer,p_deal,'refund_obligation_updated',
      jsonb_build_object('message','Refund obligation adjusted to confirmed receipts; no money transferred','obligation_id',item.id,'recipient',recipient_kind,'amount',wanted,'remaining',target,'status',item.status),auth.uid());
    insert into public.audit_logs(dealer_id,user_id,action,entity,entity_id,meta) values(p_dealer,auth.uid(),'refund_obligation_updated','deal',p_deal,
      jsonb_build_object('obligation_id',item.id,'recipient',recipient_kind,'amount',wanted,'remaining',target));
  end loop;
end $$;
revoke all on function public.sync_cancelled_deal_refunds(uuid,uuid) from public,anon,authenticated;

create function public.cancel_deal_with_refund_obligation(
  p_dealer uuid,
  p_command text,
  p_id uuid,
  p_input jsonb,
  p_request uuid
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  d public.deals;
  cached public.commercial_requests;
  result jsonb;
  reason text;
  lead_stage text;
  net_paid numeric;
  voided_documents integer;
  sale_vehicle uuid;
begin
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'work') then
    raise exception 'commercial_not_allowed';
  end if;
  if p_request is null or p_input is null or jsonb_typeof(p_input)<>'object'
    or octet_length(p_input::text)>30000 then
    raise exception 'invalid_request';
  end if;

  -- Match the commercial ledger's existing serialization and replay rules.
  perform 1 from public.dealers where id=p_dealer for update;
  select * into cached from public.commercial_requests
    where dealer_id=p_dealer and request_id=p_request;
  if found then
    if cached.command<>p_command
      or cached.input<>jsonb_build_object('id',p_id,'data',p_input) then
      raise exception 'request_reused';
    end if;
    return cached.result;
  end if;

  select * into d from public.deals
    where id=p_id and dealer_id=p_dealer for update;
  if not found then raise exception 'deal_missing'; end if;
  if d.status in ('completed','cancelled','reversed') then raise exception 'deal_closed'; end if;
  if (p_input->>'expectedVersion')::integer is distinct from d.version then
    raise exception 'stale_deal';
  end if;

  if not public.deal_is_activated(p_dealer,p_id) then raise exception 'vehicle_interest_requires_activation'; end if;
  reason:=trim(p_input->>'reason');
  if reason is null or char_length(reason) not between 3 and 500 then
    raise exception 'cancellation_reason_required';
  end if;
  if exists(
    select 1 from public.deal_documents
    where deal_id=d.id and dealer_id=p_dealer and kind='invoice' and status<>'void'
  ) then
    raise exception 'invoiced_deal_requires_reversal';
  end if;

  net_paid:=(public.commercial_totals(d.id)->>'paid')::numeric;
  if net_paid<0 then raise exception 'refund_allocation_mismatch'; end if;
  if exists(select 1 from public.payments p where p.dealer_id=p_dealer and p.deal_id=d.id and p.kind='finance_payout' and p.clearance_status in ('cleared','not_required') and not exists(select 1 from public.payments r where r.reverses_payment_id=p.id)) then raise exception 'lender_refund_review_required'; end if;
  if exists(select 1 from public.purchase_orders where deal_id=d.id and dealer_id=p_dealer) then
    raise exception 'trade_in_requires_reversal';
  end if;

  lead_stage:=nullif(p_input->>'leadStage','');
  if lead_stage is not null
    and lead_stage not in ('new','contacted','appointment','test_drive','finance_applied') then
    raise exception 'invalid_lead_stage';
  end if;
  if lead_stage is not null and d.lead_id is null then raise exception 'linked_lead_missing'; end if;

  select vehicle_id into sale_vehicle from public.deal_orders
    where deal_id=d.id and dealer_id=p_dealer and kind='sale';

  update public.deal_documents
    set status='void'
    where deal_id=d.id and dealer_id=p_dealer
      and kind in ('quote','agreement') and status<>'void';
  get diagnostics voided_documents=row_count;

  update public.deals set
    status='cancelled',
    stage='cancelled',
    closed_at=now(),
    updated_at=now(),
    version=version+1,
    cancellation_reason=reason,
    cancelled_by=auth.uid()
  where id=d.id and dealer_id=p_dealer;

  if sale_vehicle is not null and not exists(
    select 1 from public.deal_orders other_order
    join public.deals other_deal on other_deal.id=other_order.deal_id
    where other_order.vehicle_id=sale_vehicle and other_order.kind='sale'
      and other_deal.dealer_id=p_dealer and other_deal.id<>d.id
      and other_deal.status not in ('vehicle_interest','completed','cancelled','reversed')
  ) then
    update public.vehicles set status='ready_for_sale'
      where id=sale_vehicle and dealer_id=p_dealer and status='reserved';
  end if;

  if lead_stage is not null then
    update public.leads set
      stage=lead_stage::public.lead_stage,
      lost_reason=null,
      version=version+1,
      updated_at=now()
    where id=d.lead_id and dealer_id=p_dealer;
    if not found then raise exception 'linked_lead_missing'; end if;
    insert into public.lead_activities(dealer_id,lead_id,type,body,created_by,detail)
    values(p_dealer,d.lead_id,'status_change','Lead reopened after deal cancellation',auth.uid(),
      jsonb_build_object('deal_id',d.id,'stage',lead_stage,'reason',reason));
  end if;

  insert into public.deal_events(dealer_id,deal_id,kind,detail,created_by)
  values(p_dealer,d.id,'cancelled',jsonb_build_object(
    'message','Deal cancelled after review',
    'reason',reason,
    'before',jsonb_build_object('status',d.status,'stage',d.stage,'version',d.version),
    'after',jsonb_build_object('status','cancelled','stage','cancelled','version',d.version+1),
    'voided_documents',voided_documents,
    'released_vehicle_id',sale_vehicle,
    'lead_stage',lead_stage
  ),auth.uid());

  insert into public.audit_logs(dealer_id,user_id,action,entity,entity_id,meta)
  values(p_dealer,auth.uid(),'deal_cancelled','deal',d.id,jsonb_build_object(
    'reason',reason,'previous_status',d.status,'previous_version',d.version,
    'voided_documents',voided_documents,'lead_stage',lead_stage
  ));

  perform public.sync_cancelled_deal_refunds(p_dealer,d.id);
  result:=jsonb_build_object(
    'refundDue',net_paid,
    'id',d.id,
    'status','cancelled',
    'voidedDocuments',voided_documents,
    'vehicleReleased',sale_vehicle is not null,
    'leadStage',lead_stage
  );
  insert into public.commercial_requests(dealer_id,request_id,command,input,result)
  values(p_dealer,p_request,p_command,jsonb_build_object('id',p_id,'data',p_input),result);
  return result;
end $$;

revoke all on function public.cancel_deal_with_refund_obligation(uuid,text,uuid,jsonb,uuid) from public,anon,authenticated;

alter function public.commercial_command(uuid,text,uuid,jsonb,uuid) rename to commercial_command_v092;
revoke all on function public.commercial_command_v092(uuid,text,uuid,jsonb,uuid) from public,anon,authenticated;
create function public.commercial_command(p_dealer uuid,p_command text,p_id uuid,p_input jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare item public.deal_refund_obligations; cached public.commercial_requests;
  result jsonb; payment_amount numeric; method text; entered_on date; payment_id uuid; affected_deal uuid;
begin
  if p_command='cancel_deal' then
    return public.cancel_deal_with_refund_obligation(p_dealer,p_command,p_id,p_input,p_request);
  end if;
  if p_command='pay_deal_refund' then
    if auth.uid() is null or not public.commercial_allowed(p_dealer,'work') or not public.commercial_allowed(p_dealer,'payment') then raise exception 'commercial_not_allowed'; end if;
    if p_request is null or p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>4000 then raise exception 'invalid_request'; end if;
    perform 1 from public.dealers where id=p_dealer for update;
    select * into cached from public.commercial_requests where dealer_id=p_dealer and request_id=p_request;
    if found then
      if cached.command<>p_command or cached.input<>jsonb_build_object('id',p_id,'data',p_input) then raise exception 'request_reused'; end if;
      return cached.result;
    end if;
    select * into item from public.deal_refund_obligations where dealer_id=p_dealer and id=p_id for update;
    if not found then raise exception 'refund_obligation_missing'; end if;
    if item.recipient<>'customer' then raise exception 'lender_refund_review_required'; end if;
    perform 1 from public.deals where id=item.deal_id and dealer_id=p_dealer and status='cancelled' for update;
    if not found then raise exception 'refund_obligation_missing'; end if;
    payment_amount:=(p_input->>'amount')::numeric;method:=p_input->>'method';entered_on:=(p_input->>'paidOn')::date;
    if payment_amount is null or payment_amount<=0 or payment_amount<>round(payment_amount,2) or payment_amount>item.amount-item.paid_amount
      or payment_amount>(public.commercial_totals(item.deal_id)->>'paid')::numeric then raise exception 'refund_exceeds_remaining'; end if;
    if method is null or method not in ('cash','bank','eft','cheque','draft','card') or entered_on is null or entered_on>current_date
      or not coalesce((p_input->>'confirmedPaid')::boolean,false) then raise exception 'refund_confirmation_required'; end if;
    if method in ('cheque','draft') and coalesce(length(trim(p_input->>'reference')),0)<2 then raise exception 'receipt_reference_required'; end if;
    insert into public.payments(dealer_id,deal_id,kind,method,amount,currency,paid_on,reference,created_by,clearance_status,refund_recipient,source_request_id,source_request_index,refund_obligation_id)
      values(p_dealer,item.deal_id,'refund',method,payment_amount,item.currency,entered_on,nullif(left(trim(p_input->>'reference'),120),''),auth.uid(),'not_required','customer',p_request,0,item.id)
      returning id into payment_id;
    update public.deal_refund_obligations set paid_amount=paid_amount+payment_amount,
      status=case when paid_amount+payment_amount=deal_refund_obligations.amount then 'paid' else 'partially_paid' end,updated_at=now()
      where id=item.id;
    update public.deals set version=version+1,updated_at=now() where id=item.deal_id;
    result:=jsonb_build_object('id',payment_id,'obligationId',item.id,'remaining',item.amount-item.paid_amount-payment_amount);
    insert into public.deal_events(dealer_id,deal_id,kind,detail,created_by) values(p_dealer,item.deal_id,'cancellation_refund_recorded',
      jsonb_build_object('message','Refund paid recorded against cancellation obligation; no external transfer initiated','obligation_id',item.id,'payment_id',payment_id,'amount',payment_amount,'method',method,'paid_on',entered_on,'reference',p_input->>'reference','remaining',item.amount-item.paid_amount-payment_amount),auth.uid());
    insert into public.audit_logs(dealer_id,user_id,action,entity,entity_id,meta) values(p_dealer,auth.uid(),'cancellation_refund_recorded','deal',item.deal_id,
      jsonb_build_object('obligation_id',item.id,'payment_id',payment_id,'amount',payment_amount,'method',method,'paid_on',entered_on,'reference',p_input->>'reference','remaining',item.amount-item.paid_amount-payment_amount));
    insert into public.commercial_requests(dealer_id,request_id,command,input,result) values(p_dealer,p_request,p_command,jsonb_build_object('id',p_id,'data',p_input),result);
    return result;
  end if;
  if p_command in ('clear_receipt','reject_receipt','reverse_receipt') then
    -- Keep the existing permission, validation and audit for receipt resolution.
    if auth.uid() is null or not public.commercial_allowed(p_dealer,'read') then raise exception 'commercial_not_allowed'; end if;
    perform 1 from public.dealers where id=p_dealer for update;
    select deal_id into affected_deal from public.payments where id=p_id and dealer_id=p_dealer;
    result:=public.commercial_command_v092(p_dealer,p_command,p_id,p_input,p_request);
    if affected_deal is not null then perform public.sync_cancelled_deal_refunds(p_dealer,affected_deal); end if;
    return result;
  end if;
  return public.commercial_command_v092(p_dealer,p_command,p_id,p_input,p_request);
end $$;
revoke all on function public.commercial_command(uuid,text,uuid,jsonb,uuid) from public,anon;
grant execute on function public.commercial_command(uuid,text,uuid,jsonb,uuid) to authenticated;

-- One tenant-scoped source for the Deal and Finance pending views. No silent cap.
create function public.deal_financial_pending(p_dealer uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare receipts jsonb; refunds jsonb;
begin
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'read') then raise exception 'commercial_not_allowed'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'dealId',d.id,'dealNo',d.deal_no,'customerName',c.name,
    'currency',p.currency,'amount',p.amount,'method',p.method,'reference',p.reference,'paidOn',p.paid_on,'kind',p.kind) order by p.created_at),'[]'::jsonb)
    into receipts from public.payments p join public.deals d on d.id=p.deal_id and d.dealer_id=p.dealer_id
    join public.customers c on c.id=d.customer_id and c.dealer_id=d.dealer_id
    where p.dealer_id=p_dealer and p.clearance_status='pending' and p.kind in ('deposit','balance','finance_payout');
  select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'dealId',d.id,'dealNo',d.deal_no,'customerName',c.name,
    'currency',o.currency,'amount',o.amount,'paidAmount',o.paid_amount,'remaining',o.amount-o.paid_amount,
    'recipient',o.recipient,'status',o.status,'reason',o.reason,'createdAt',o.created_at) order by o.created_at),'[]'::jsonb)
    into refunds from public.deal_refund_obligations o join public.deals d on d.id=o.deal_id and d.dealer_id=o.dealer_id
    join public.customers c on c.id=d.customer_id and c.dealer_id=d.dealer_id
    where o.dealer_id=p_dealer and o.amount>o.paid_amount;
  return jsonb_build_object('receipts',receipts,'refunds',refunds);
end $$;
revoke all on function public.deal_financial_pending(uuid) from public,anon;
grant execute on function public.deal_financial_pending(uuid) to authenticated;
