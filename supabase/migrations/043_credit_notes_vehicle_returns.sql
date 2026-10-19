-- Post-invoice corrections. A credit note never moves money or stock by itself.
-- Refunds after invoice exist only inside a confirmed physical vehicle return.

alter table public.deal_documents
  add column original_document_id uuid references public.deal_documents(id),
  add column gross_adjustment numeric(14,2),
  add column correction_reason text;
create index deal_documents_original_idx on public.deal_documents(original_document_id)
  where original_document_id is not null;

alter table public.payments
  add column credit_note_id uuid references public.deal_documents(id),
  add column refund_recipient text check(refund_recipient in ('customer','finance_company'));

alter table public.deals drop constraint deals_status_check;
alter table public.deals add constraint deals_status_check
  check(status in ('draft','quoted','agreed','finance','completed','cancelled','reversed'));

-- The private helper creates an immutable correction from the original invoice snapshot.
create function public.issue_deal_credit_note(
  p_dealer uuid,
  p_deal uuid,
  p_reason text,
  p_lines jsonb,
  p_allow_full boolean
) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  inv public.deal_documents;
  requested jsonb;
  original_line jsonb;
  credited_lines jsonb:='[]'::jsonb;
  request_lines jsonb:=p_lines;
  idx integer;
  gross numeric;
  original_gross numeric;
  already_line numeric;
  already_total numeric;
  invoice_total numeric;
  remaining_total numeric;
  vat_rate numeric;
  vat_amount numeric;
  total_credit numeric:=0;
  total_vat numeric:=0;
  credit_id uuid;
  credit_number text;
  credit_snapshot jsonb;
begin
  select * into inv from public.deal_documents
    where dealer_id=p_dealer and deal_id=p_deal and kind='invoice' and status<>'void'
    order by created_at desc limit 1;
  if not found then raise exception 'invoice_required'; end if;
  if p_reason is null or char_length(trim(p_reason)) not between 3 and 500 then
    raise exception 'credit_reason_required';
  end if;
  if jsonb_typeof(inv.snapshot->'lines')<>'array' then raise exception 'invoice_snapshot_invalid'; end if;

  invoice_total:=coalesce((inv.snapshot->>'sale')::numeric,0);
  select coalesce(sum(gross_adjustment),0) into already_total
    from public.deal_documents
    where original_document_id=inv.id and kind='credit_note' and status<>'void';
  remaining_total:=invoice_total-already_total;
  if remaining_total<=0 then raise exception 'invoice_fully_credited'; end if;

  if request_lines is null then
    with remaining as (
      select line_no-1 as line_idx,(line->>'gross')::numeric-coalesce((
        select sum((credited->>'gross')::numeric)
        from public.deal_documents prior,
          jsonb_array_elements(prior.snapshot->'credited_lines') credited
        where prior.original_document_id=inv.id and prior.status<>'void'
          and (credited->>'index')::integer=line_no-1
      ),0) as amount
      from jsonb_array_elements(inv.snapshot->'lines') with ordinality source(line,line_no)
    )
    select coalesce(jsonb_agg(jsonb_build_object('index',remaining.line_idx,'amount',remaining.amount) order by remaining.line_idx),'[]'::jsonb)
      into request_lines from remaining where remaining.amount>0;
  end if;

  if jsonb_typeof(request_lines)<>'array' or jsonb_array_length(request_lines)=0 then
    raise exception 'credit_lines_required';
  end if;

  for requested in select value from jsonb_array_elements(request_lines) loop
    if jsonb_typeof(requested)<>'object' then raise exception 'invalid_credit_line'; end if;
    idx:=(requested->>'index')::integer;
    gross:=(requested->>'amount')::numeric;
    original_line:=inv.snapshot->'lines'->idx;
    if original_line is null or gross is null or gross<=0 or gross<>round(gross,2) then
      raise exception 'invalid_credit_line';
    end if;
    if exists(select 1 from jsonb_array_elements(credited_lines) x where (x->>'index')::integer=idx) then
      raise exception 'duplicate_credit_line';
    end if;
    original_gross:=(original_line->>'gross')::numeric;
    select coalesce(sum((credited->>'gross')::numeric),0) into already_line
      from public.deal_documents prior,
        jsonb_array_elements(prior.snapshot->'credited_lines') credited
      where prior.original_document_id=inv.id and prior.kind='credit_note' and prior.status<>'void'
        and (credited->>'index')::integer=idx;
    if gross>original_gross-already_line then raise exception 'credit_exceeds_remaining'; end if;
    vat_rate:=nullif(original_line->>'vat_rate','')::numeric;
    vat_amount:=case when vat_rate is null then 0 else round(gross*vat_rate/(100+vat_rate),2) end;
    credited_lines:=credited_lines||jsonb_build_array(jsonb_build_object(
      'index',idx,
      'description',original_line->>'description',
      'gross',gross,
      'vat_rate',vat_rate,
      'vat',vat_amount
    ));
    total_credit:=total_credit+gross;
    total_vat:=total_vat+vat_amount;
  end loop;

  if total_credit>remaining_total then raise exception 'credit_exceeds_remaining'; end if;
  if not p_allow_full and total_credit>=remaining_total then raise exception 'full_credit_requires_return'; end if;

  credit_number:=public.commercial_number(p_dealer,'CN');
  credit_snapshot:=jsonb_build_object(
    'kind','credit_note',
    'number',credit_number,
    'date',current_date,
    'issued_at',now(),
    'currency',inv.snapshot->>'currency',
    'original_invoice',jsonb_build_object('id',inv.id,'number',inv.number,'date',inv.snapshot->>'date'),
    'reason',trim(p_reason),
    'dealer',inv.snapshot->'dealer',
    'customer',inv.snapshot->'customer',
    'finance',inv.snapshot->'finance',
    'vehicle',inv.snapshot->'vehicle',
    'credited_lines',credited_lines,
    'gross_credit',total_credit,
    'vat_credit',total_vat,
    'original_consideration',invoice_total,
    'amended_consideration',invoice_total-already_total-total_credit,
    'scheme',inv.snapshot->>'scheme',
    'margin_note',case when inv.snapshot->>'scheme'='margin' then 'Margin scheme — second-hand goods' else null end
  );
  insert into public.deal_documents(
    dealer_id,deal_id,kind,number,status,snapshot,printed_at,created_by,deal_version,
    original_document_id,gross_adjustment,correction_reason
  ) values(
    p_dealer,p_deal,'credit_note',credit_number,'printed',credit_snapshot,now(),auth.uid(),
    (select version from public.deals where id=p_deal),inv.id,total_credit,trim(p_reason)
  ) returning id into credit_id;
  insert into public.deal_events(dealer_id,deal_id,kind,detail,created_by)
  values(p_dealer,p_deal,'credit_note_issued',jsonb_build_object(
    'message','Credit note '||credit_number||' issued',
    'document_id',credit_id,'invoice_id',inv.id,'gross',total_credit,'reason',trim(p_reason)
  ),auth.uid());
  return credit_id;
end $$;
revoke all on function public.issue_deal_credit_note(uuid,uuid,text,jsonb,boolean)
  from public,anon,authenticated;

alter function public.commercial_command(uuid,text,uuid,jsonb,uuid)
  rename to commercial_command_v042;
revoke all on function public.commercial_command_v042(uuid,text,uuid,jsonb,uuid)
  from public,anon,authenticated;

create function public.commercial_command(
  p_dealer uuid,p_command text,p_id uuid,p_input jsonb,p_request uuid
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  d public.deals;
  cached public.commercial_requests;
  result jsonb;
  reason text;
  credit_id uuid;
  net_paid numeric;
  customer_paid numeric;
  finance_paid numeric;
  prior_refunds numeric;
  sale_vehicle uuid;
  refund_method text;
begin
  if p_command not in ('credit_note','return_sale') then
    return public.commercial_command_v042(p_dealer,p_command,p_id,p_input,p_request);
  end if;
  if auth.uid() is null or coalesce(public.user_role_in(p_dealer)::text,'') not in ('owner','admin','accountant')
    or not public.commercial_allowed(p_dealer,'read') then
    raise exception 'financial_reversal_not_allowed';
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

  if p_command='credit_note' then
    credit_id:=public.issue_deal_credit_note(p_dealer,d.id,reason,p_input->'lines',false);
    update public.deals set version=version+1,updated_at=now() where id=d.id;
    result:=jsonb_build_object('id',credit_id,'status','credited');
  else
    if exists(select 1 from public.purchase_orders where deal_id=d.id and dealer_id=p_dealer) then
      raise exception 'trade_in_requires_reversal';
    end if;
    refund_method:=coalesce(nullif(p_input->>'refundMethod',''),'bank');
    if refund_method not in ('cash','bank','card','finance') then raise exception 'invalid_payment'; end if;
    credit_id:=public.issue_deal_credit_note(p_dealer,d.id,reason,null,true);
    net_paid:=(public.commercial_totals(d.id)->>'paid')::numeric;
    select coalesce(sum(amount),0) into customer_paid from public.payments
      where deal_id=d.id and kind in ('deposit','balance');
    select coalesce(sum(amount),0) into finance_paid from public.payments
      where deal_id=d.id and kind='finance_payout';
    select coalesce(sum(amount),0) into prior_refunds from public.payments
    where deal_id=d.id and kind in ('refund','receipt_reversal');
    customer_paid:=greatest(customer_paid-prior_refunds,0);
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
    if net_paid<>customer_paid+finance_paid then raise exception 'refund_allocation_mismatch'; end if;

    select vehicle_id into sale_vehicle from public.deal_orders
      where deal_id=d.id and dealer_id=p_dealer and kind='sale';
    update public.vehicles set status='preparation' where id=sale_vehicle and dealer_id=p_dealer;
    update public.vehicle_deals set sale_status='none',sold_date=null,delivered_date=null
      where vehicle_id=sale_vehicle and dealer_id=p_dealer;
    update public.deals set status='reversed',stage='cancelled',version=version+1,
      cancellation_reason=reason,cancelled_by=auth.uid(),closed_at=now(),updated_at=now()
      where id=d.id;
    insert into public.deal_events(dealer_id,deal_id,kind,detail,created_by)
    values(p_dealer,d.id,'vehicle_returned',jsonb_build_object(
      'message','Vehicle physically returned; sale reversed',
      'vehicle_id',sale_vehicle,'credit_note_id',credit_id,
      'customer_refund',customer_paid,'finance_refund',finance_paid,'reason',reason
    ),auth.uid());
    insert into public.audit_logs(dealer_id,user_id,action,entity,entity_id,meta)
    values(p_dealer,auth.uid(),'sale_reversed','deal',d.id,jsonb_build_object(
      'vehicle_id',sale_vehicle,'credit_note_id',credit_id,'refunded',net_paid,'reason',reason
    ));
    result:=jsonb_build_object('id',credit_id,'status','reversed','vehicleId',sale_vehicle,'refunded',net_paid);
  end if;

  insert into public.commercial_requests(dealer_id,request_id,command,input,result)
  values(p_dealer,p_request,p_command,jsonb_build_object('id',p_id,'data',p_input),result);
  return result;
end $$;
revoke all on function public.commercial_command(uuid,text,uuid,jsonb,uuid) from public,anon;
grant execute on function public.commercial_command(uuid,text,uuid,jsonb,uuid) to authenticated;
