-- Rejected/bounced cheque and draft handling. The original receipt is never
-- deleted; a linked compensating movement reopens the customer balance.

alter table public.payments drop constraint if exists payments_kind_check;
alter table public.payments add constraint payments_kind_check
  check (kind in ('deposit','balance','trade_allowance','finance_payout','refund','receipt_reversal'));
alter table public.payments
  add column reverses_payment_id uuid references public.payments(id),
  add column rejected_at timestamptz,
  add column rejected_by uuid references auth.users(id),
  add column rejection_reason text check(rejection_reason is null or char_length(trim(rejection_reason)) between 3 and 500);
create unique index payments_one_receipt_reversal on public.payments(reverses_payment_id)
  where kind='receipt_reversal';

create or replace function public.commercial_totals(p_deal uuid) returns jsonb
language sql stable security definer set search_path=public as $$
 select jsonb_build_object('total',coalesce(d.retail_price,0)+coalesce(a.total,0),
   'equity',d.siv_total,'paid',coalesce(p.paid,0),
   'balance',coalesce(d.retail_price,0)+coalesce(a.total,0)-d.siv_total-coalesce(p.paid,0))
 from public.deals d left join lateral(select sum(price) total from public.deal_addons where deal_id=d.id) a on true
 left join lateral(select sum(case when kind in ('refund','receipt_reversal') then -amount when kind='trade_allowance' then 0 else amount end) paid from public.payments where deal_id=d.id) p on true where d.id=p_deal;
$$;

alter function public.commercial_command(uuid,text,uuid,jsonb,uuid)
  rename to commercial_command_v055;
revoke all on function public.commercial_command_v055(uuid,text,uuid,jsonb,uuid) from public,anon,authenticated;

create function public.commercial_command(p_dealer uuid,p_command text,p_id uuid,p_input jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  cached public.commercial_requests;
  receipt public.payments;
  reversal_id uuid;
  result jsonb;
  reason text;
begin
  if p_command<>'reject_receipt' then
    return public.commercial_command_v055(p_dealer,p_command,p_id,p_input,p_request);
  end if;
  if auth.uid() is null or coalesce(public.user_role_in(p_dealer)::text,'') not in ('owner','admin','accountant')
    or not public.commercial_allowed(p_dealer,'payment') then raise exception 'receipt_rejection_not_allowed';end if;
  if p_request is null or p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>4000
    then raise exception 'invalid_request';end if;
  reason:=trim(p_input->>'reason');
  if char_length(reason) not between 3 and 500 then raise exception 'receipt_rejection_reason_required';end if;
  perform 1 from public.dealers where id=p_dealer for update;
  select * into cached from public.commercial_requests where dealer_id=p_dealer and request_id=p_request;
  if found then
    if cached.command<>p_command or cached.input<>jsonb_build_object('id',p_id,'data',p_input) then raise exception 'request_reused';end if;
    return cached.result;
  end if;
  select * into receipt from public.payments where id=p_id and dealer_id=p_dealer for update;
  if not found then raise exception 'receipt_missing';end if;
  if receipt.method not in ('cheque','draft') then raise exception 'receipt_rejection_not_required';end if;
  if receipt.clearance_status not in ('pending','cleared') then raise exception 'receipt_not_rejectable';end if;
  if exists(select 1 from public.payments where reverses_payment_id=receipt.id and kind='receipt_reversal') then
    raise exception 'receipt_already_rejected';
  end if;
  insert into public.payments(
    dealer_id,deal_id,kind,method,amount,currency,paid_on,reference,created_by,
    clearance_status,reverses_payment_id,rejected_at,rejected_by,rejection_reason
  ) values(
    p_dealer,receipt.deal_id,'receipt_reversal',receipt.method,receipt.amount,receipt.currency,current_date,
    left(p_input->>'reference',120),auth.uid(),'rejected',receipt.id,now(),auth.uid(),reason
  ) returning id into reversal_id;
  update public.payments set clearance_status='rejected',rejected_at=now(),rejected_by=auth.uid(),rejection_reason=reason,
    reconciliation_reference=coalesce(nullif(left(trim(p_input->>'reference'),120),''),reconciliation_reference)
    where id=receipt.id;
  insert into public.deal_events(dealer_id,deal_id,kind,detail,created_by)
  values(p_dealer,receipt.deal_id,'receipt_rejected',jsonb_build_object(
    'message',initcap(receipt.method)||' rejected · customer balance reopened','payment_id',receipt.id,
    'reversal_id',reversal_id,'amount',receipt.amount,'reason',reason,'reference',left(p_input->>'reference',120)
  ),auth.uid());
  insert into public.audit_logs(dealer_id,user_id,action,entity,entity_id,meta)
  values(p_dealer,auth.uid(),'receipt_rejected','payment',receipt.id,jsonb_build_object(
    'deal_id',receipt.deal_id,'reversal_id',reversal_id,'method',receipt.method,'amount',receipt.amount,
    'reason',reason,'reference',left(p_input->>'reference',120)
  ));
  result:=jsonb_build_object('id',receipt.id,'reversalId',reversal_id,'clearanceStatus','rejected');
  insert into public.commercial_requests(dealer_id,request_id,command,input,result)
  values(p_dealer,p_request,p_command,jsonb_build_object('id',p_id,'data',p_input),result);
  return result;
end $$;
revoke all on function public.commercial_command(uuid,text,uuid,jsonb,uuid) from public,anon;
grant execute on function public.commercial_command(uuid,text,uuid,jsonb,uuid) to authenticated;
