-- Correct an erroneous payment entry while retaining its audit history.
create or replace function public.remove_deal_payment(p_dealer uuid,p_payment uuid,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare receipt public.payments%rowtype; cached public.commercial_requests%rowtype; result jsonb;
  removal_reason constant text := 'Payment removed: entered incorrectly';
begin
  if auth.uid() is null or coalesce(public.user_role_in(p_dealer)::text,'') not in ('owner','admin','accountant')
    or not public.commercial_allowed(p_dealer,'payment') then raise exception 'financial_reversal_not_allowed';end if;
  if p_request is null then raise exception 'invalid_request';end if;
  perform 1 from public.dealers where id=p_dealer for update;
  select * into receipt from public.payments where dealer_id=p_dealer and id=p_payment for update;
  if not found or receipt.kind not in ('deposit','balance','finance_payout') then raise exception 'receipt_missing';end if;
  if receipt.clearance_status in ('not_required','cleared') then
    return public.commercial_command(p_dealer,'reverse_receipt',p_payment,jsonb_build_object('reason',removal_reason),p_request);
  end if;
  select * into cached from public.commercial_requests where dealer_id=p_dealer and request_id=p_request;
  if found then
    if cached.command<>'remove_payment_entry' or cached.input<>jsonb_build_object('id',p_payment) then raise exception 'request_reused';end if;
    return cached.result;
  end if;
  if receipt.clearance_status<>'pending' then raise exception 'receipt_not_pending';end if;
  perform 1 from public.deals where id=receipt.deal_id and dealer_id=p_dealer and status not in ('cancelled','reversed') for update;
  if not found then raise exception 'deal_closed_or_missing';end if;
  update public.payments set clearance_status='rejected',rejected_at=now(),rejected_by=auth.uid(),rejection_reason=removal_reason where id=receipt.id;
  insert into public.deal_events(dealer_id,deal_id,kind,detail,created_by)
    values(p_dealer,receipt.deal_id,'payment_removed',jsonb_build_object('message','Payment removed · entered incorrectly',
      'payment_id',receipt.id,'amount',receipt.amount,'method',receipt.method,'paid_on',receipt.paid_on,'reference',receipt.reference,'reason',removal_reason),auth.uid());
  insert into public.audit_logs(dealer_id,user_id,action,entity,entity_id,meta)
    values(p_dealer,auth.uid(),'payment_removed','payment',receipt.id,jsonb_build_object('deal_id',receipt.deal_id,'amount',receipt.amount,'reason',removal_reason));
  result:=jsonb_build_object('id',receipt.id,'balance',public.commercial_totals(receipt.deal_id));
  insert into public.commercial_requests(dealer_id,request_id,command,input,result)
    values(p_dealer,p_request,'remove_payment_entry',jsonb_build_object('id',p_payment),result);
  return result;
end;$$;
revoke all on function public.remove_deal_payment(uuid,uuid,uuid) from public;
grant execute on function public.remove_deal_payment(uuid,uuid,uuid) to authenticated;
