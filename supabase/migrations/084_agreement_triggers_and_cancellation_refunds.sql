alter function public.commercial_command(uuid,text,uuid,jsonb,uuid) rename to commercial_command_v083;
revoke all on function public.commercial_command_v083(uuid,text,uuid,jsonb,uuid) from public,anon,authenticated;
create function public.commercial_command(p_dealer uuid,p_command text,p_id uuid,p_input jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; d public.deals; cached public.commercial_requests; replay boolean;
  amount numeric; remaining numeric; refund_id uuid; entered_on date; method text; reason text; previous_status text;
begin
  if p_command not in ('refund_before_cancel','payment','trade','cancel_deal') then
    return public.commercial_command_v083(p_dealer,p_command,p_id,p_input,p_request);
  end if;
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'read') then raise exception 'commercial_not_allowed'; end if;
  perform 1 from public.dealers where id=p_dealer for update;
  select * into cached from public.commercial_requests where dealer_id=p_dealer and request_id=p_request;
  replay:=found;
  if p_command='refund_before_cancel' then
    if not public.commercial_allowed(p_dealer,'payment') or not public.commercial_allowed(p_dealer,'work') then raise exception 'commercial_not_allowed'; end if;
    if p_request is null then raise exception 'invalid_request'; end if;
    if replay then
      if cached.command<>p_command or cached.input<>jsonb_build_object('id',p_id,'data',p_input) then raise exception 'request_reused'; end if;
      return cached.result;
    end if;
    select * into d from public.deals where id=p_id and dealer_id=p_dealer for update;
    if not found or d.status in ('completed','cancelled','reversed') then raise exception 'deal_closed'; end if;
    if (p_input->>'expectedVersion')::integer is distinct from d.version then raise exception 'stale_deal'; end if;
    if exists(select 1 from public.deal_documents where deal_id=d.id and kind='invoice' and status<>'void') then raise exception 'invoiced_deal_requires_reversal'; end if;
    if exists(select 1 from public.purchase_orders where deal_id=d.id) then raise exception 'trade_in_requires_reversal'; end if;
    if exists(select 1 from public.payments p where p.deal_id=d.id and p.kind='finance_payout' and p.clearance_status in ('cleared','not_required') and not exists(select 1 from public.payments r where r.reverses_payment_id=p.id)) then raise exception 'lender_refund_review_required'; end if;
    remaining:=(public.commercial_totals(d.id)->>'paid')::numeric;
    amount:=(p_input->>'amount')::numeric;method:=p_input->>'method';entered_on:=(p_input->>'paidOn')::date;reason:=trim(p_input->>'reason');
    if amount is null or amount<=0 or amount<>round(amount,2) or amount>remaining then raise exception 'refund_exceeds_remaining'; end if;
    if method is null or method not in ('cash','bank','eft','cheque','draft','card') or entered_on is null or entered_on>current_date
      or reason is null or length(reason) not between 3 and 500 or not coalesce((p_input->>'confirmedPaid')::boolean,false) then raise exception 'refund_confirmation_required'; end if;
    if method in ('cheque','draft') and coalesce(length(trim(p_input->>'reference')),0)<2 then raise exception 'receipt_reference_required'; end if;
    insert into public.payments(dealer_id,deal_id,kind,method,amount,currency,paid_on,reference,created_by,clearance_status,refund_recipient,source_request_id,source_request_index)
      values(p_dealer,d.id,'refund',method,amount,d.currency,entered_on,nullif(left(trim(p_input->>'reference'),120),''),auth.uid(),'not_required','customer',p_request,0) returning id into refund_id;
    update public.deals set version=version+1,updated_at=now() where id=d.id;
    insert into public.deal_events(dealer_id,deal_id,kind,detail,created_by) values(p_dealer,d.id,'cancellation_refund_recorded',jsonb_build_object(
      'message','Customer refund recorded before cancellation; no external transfer initiated','payment_id',refund_id,'amount',amount,'method',method,'entered_date',entered_on,'reference',p_input->>'reference','reason',reason,'remaining_refundable',remaining-amount),auth.uid());
    insert into public.audit_logs(dealer_id,user_id,action,entity,entity_id,meta) values(p_dealer,auth.uid(),'cancellation_refund_recorded','deal',d.id,jsonb_build_object('payment_id',refund_id,'amount',amount,'method',method,'paid_on',entered_on,'reference',p_input->>'reference','remaining',remaining-amount));
    result:=jsonb_build_object('id',refund_id,'remaining',remaining-amount);
    insert into public.commercial_requests(dealer_id,request_id,command,input,result) values(p_dealer,p_request,p_command,jsonb_build_object('id',p_id,'data',p_input),result);
    return result;
  end if;
  if p_command='cancel_deal' and not replay and exists(select 1 from public.payments where deal_id=p_id and dealer_id=p_dealer and clearance_status='pending') then raise exception 'pending_receipts_require_resolution'; end if;
  if p_command='cancel_deal' then select status into previous_status from public.deals where id=p_id and dealer_id=p_dealer; end if;
  result:=public.commercial_command_v083(p_dealer,p_command,p_id,p_input,p_request);
  if p_command='cancel_deal' and not replay and previous_status<>'vehicle_interest' then
    update public.vehicles v set status='ready_for_sale' where v.dealer_id=p_dealer and v.status='reserved'
      and exists(select 1 from public.deal_orders o where o.deal_id=p_id and o.kind='sale' and o.vehicle_id=v.id)
      and not exists(select 1 from public.deal_orders o join public.deals other on other.id=o.deal_id where o.vehicle_id=v.id and o.kind='sale' and other.id<>p_id and other.status not in ('vehicle_interest','completed','cancelled','reversed'));
  end if;
  if not replay and (p_command='trade' or (p_command='payment' and p_input->>'kind'='deposit')) then
    select * into d from public.deals where id=p_id and dealer_id=p_dealer;
    if d.status not in ('completed','cancelled','reversed') then
      -- A subsequent receipt must produce a fresh agreement snapshot, not reuse
      -- the earlier version with a stale deposit/balance.
      if p_command='payment' and exists(select 1 from public.deal_documents where deal_id=d.id and kind='agreement' and status<>'void' and deal_version=d.version) then
        update public.deals set version=version+1,updated_at=now() where id=d.id returning * into d;
      end if;
      perform public.commercial_command(p_dealer,'force_agreement',d.id,jsonb_build_object('expectedVersion',d.version),gen_random_uuid());
    end if;
  end if;
  return result;
end $$;
revoke all on function public.commercial_command(uuid,text,uuid,jsonb,uuid) from public,anon;
grant execute on function public.commercial_command(uuid,text,uuid,jsonb,uuid) to authenticated;
