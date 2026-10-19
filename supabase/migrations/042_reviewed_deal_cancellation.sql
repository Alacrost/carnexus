-- Reviewed pre-invoice cancellation. Financial/doc history is preserved and every
-- cancellation is version checked, idempotent and attributable.

alter table public.deals
  add column cancellation_reason text,
  add column cancelled_by uuid references auth.users(id);

alter table public.deals add constraint deals_cancellation_reason_length
  check (cancellation_reason is null or char_length(trim(cancellation_reason)) between 3 and 500);

-- Keep the already-tested v041 implementation private and wrap the stable RPC name.
alter function public.commercial_command(uuid,text,uuid,jsonb,uuid)
  rename to commercial_command_v041;
revoke all on function public.commercial_command_v041(uuid,text,uuid,jsonb,uuid)
  from public,anon,authenticated;

create function public.commercial_command(
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
  -- Retire the old one-click status transition even for older clients.
  if p_command='status' and p_input->>'status'='cancelled' then
    raise exception 'reviewed_cancellation_required';
  end if;

  if p_command<>'cancel_deal' then
    return public.commercial_command_v041(p_dealer,p_command,p_id,p_input,p_request);
  end if;

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
  if d.status in ('completed','cancelled') then raise exception 'deal_closed'; end if;
  if (p_input->>'expectedVersion')::integer is distinct from d.version then
    raise exception 'stale_deal';
  end if;

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
  if net_paid<>0 then raise exception 'refund_receipts_first'; end if;
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
      and other_deal.status not in ('completed','cancelled')
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

  result:=jsonb_build_object(
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

revoke all on function public.commercial_command(uuid,text,uuid,jsonb,uuid)
  from public,anon;
grant execute on function public.commercial_command(uuid,text,uuid,jsonb,uuid)
  to authenticated;
