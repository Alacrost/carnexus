-- Receivables remain open until money is confirmed. Pending bank instruments
-- are evidence of an expected receipt, not cash, and invoices may carry an
-- outstanding balance that is collected in partial payments afterwards.

alter table public.payments add column cleared_on date;
alter table public.payments add column source_request_id uuid;
alter table public.payments add column source_request_index integer;
create unique index payments_source_request_item on public.payments(dealer_id,source_request_id,source_request_index)
  where source_request_id is not null;
update public.payments set cleared_on=coalesce(cleared_at::date,paid_on) where clearance_status='cleared';
alter table public.payments drop constraint if exists payments_clearance_method_check;
update public.payments set clearance_status='cleared',cleared_at=coalesce(cleared_at,created_at),
  cleared_on=coalesce(cleared_on,paid_on),cleared_by=coalesce(cleared_by,created_by)
where method in ('bank','eft') and clearance_status='not_required' and kind not in ('refund','receipt_reversal');
alter table public.payments add constraint payments_clearance_method_check check (
  (method in ('bank','eft','cheque','draft') and (clearance_status in ('pending','cleared','rejected') or (kind='refund' and clearance_status='not_required')))
  or (method not in ('bank','eft','cheque','draft') and clearance_status in ('not_required','rejected'))
);

create or replace function public.commercial_totals(p_deal uuid) returns jsonb
language sql stable security definer set search_path=public as $$
 with credited as (
   select coalesce(sum(gross_adjustment),0) amount from public.deal_documents
   where deal_id=p_deal and kind='credit_note' and status<>'void'
 ), money as (
   select
     coalesce(sum(case
       when p.kind='refund' then -p.amount
       when p.kind='receipt_reversal' and exists(
         select 1 from public.payments original where original.id=p.reverses_payment_id
           and (original.clearance_status in ('not_required','cleared') or original.cleared_at is not null)
       ) then -p.amount
       when p.kind in ('deposit','balance','finance_payout')
         and (p.clearance_status in ('not_required','cleared') or p.cleared_at is not null) then p.amount
       else 0 end),0) paid,
     coalesce(sum(p.amount) filter(where p.kind in ('deposit','balance','finance_payout') and p.clearance_status='pending'),0) pending
   from public.payments p where p.deal_id=p_deal
 ), base as (
   select greatest(coalesce(d.retail_price,0)+coalesce(a.total,0)-c.amount,0) total,
     d.siv_total,m.paid,m.pending
   from public.deals d
   left join lateral(select sum(price) total from public.deal_addons where deal_id=d.id) a on true
   cross join credited c cross join money m where d.id=p_deal
 )
 select jsonb_build_object('total',total,'equity',siv_total,'paid',paid,'pending',pending,
   'balance',total-siv_total-paid,'outstanding',greatest(total-siv_total-paid,0),
   'overpaid',greatest(paid-(total-siv_total),0)) from base;
$$;

create function public.refresh_invoice_payment_status(p_deal uuid) returns void
language plpgsql security definer set search_path=public as $$
declare totals jsonb;
begin
  totals:=public.commercial_totals(p_deal);
  update public.deal_documents
  set status=case
    when (totals->>'outstanding')::numeric=0 and (totals->>'pending')::numeric=0 then 'paid'
    else 'printed'
  end
  where deal_id=p_deal and kind='invoice' and status<>'void';
end $$;
revoke all on function public.refresh_invoice_payment_status(uuid) from public,anon,authenticated;

alter function public.commercial_command(uuid,text,uuid,jsonb,uuid) rename to commercial_command_v062;
revoke all on function public.commercial_command_v062(uuid,text,uuid,jsonb,uuid) from public,anon,authenticated;

create function public.commercial_command(p_dealer uuid,p_command text,p_id uuid,p_input jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare d public.deals;receipt public.payments;cached public.commercial_requests;result jsonb;item jsonb;item_index integer:=0;
  amount numeric;v_method text;clearance text;confirmed boolean;entered_on date;chosen date;allowed_days integer;
  doc uuid;o public.deal_orders;reversal uuid;reason text;
begin
  if p_command='sale' then
    if p_input ? 'deposits' then
      if jsonb_typeof(p_input->'deposits')<>'array' or jsonb_array_length(p_input->'deposits')>20 then raise exception 'invalid_deposit';end if;
      result:=public.commercial_command_v062(p_dealer,p_command,p_id,
        p_input-'deposits'-'depositAmount'-'depositMethod'-'depositDate'-'depositReference'-'fundsConfirmed',p_request);
      for item in select value from jsonb_array_elements(p_input->'deposits') loop
        item_index:=item_index+1;amount:=(item->>'amount')::numeric;v_method:=coalesce(item->>'method','');
        entered_on:=coalesce(nullif(item->>'paidOn','')::date,current_date);confirmed:=coalesce((item->>'fundsConfirmed')::boolean,false);
        if entered_on>current_date then raise exception 'payment_date_future';end if;
        if amount is null or amount<=0 or amount>100000000 or amount<>round(amount,2)
          or v_method not in ('cash','bank','eft','cheque','draft','card','finance') then raise exception 'invalid_deposit';end if;
        if v_method in ('cheque','draft') and coalesce(length(trim(item->>'reference')),0)<2 then raise exception 'receipt_reference_required';end if;
        clearance:=case when v_method in ('bank','eft','cheque','draft') and not confirmed then 'pending'
          when v_method in ('bank','eft','cheque','draft') then 'cleared' else 'not_required' end;
        insert into public.payments(dealer_id,deal_id,kind,method,amount,currency,paid_on,reference,created_by,
          clearance_status,cleared_at,cleared_on,cleared_by,source_request_id,source_request_index)
        values(p_dealer,(result->>'id')::uuid,'deposit',v_method,amount,(select currency from public.deals where id=(result->>'id')::uuid),
          entered_on,nullif(left(trim(item->>'reference'),120),''),auth.uid(),clearance,
          case when clearance='cleared' then now() end,case when clearance='cleared' then entered_on end,
          case when clearance='cleared' then auth.uid() end,p_request,item_index)
        on conflict(dealer_id,source_request_id,source_request_index) where source_request_id is not null do nothing;
      end loop;
      if not exists(select 1 from public.deal_events where deal_id=(result->>'id')::uuid and kind='initial_deposits' and detail->>'request_id'=p_request::text) then
        insert into public.deal_events(dealer_id,deal_id,kind,detail,created_by) values(
          p_dealer,(result->>'id')::uuid,'initial_deposits',jsonb_build_object('message',item_index||' opening deposit payment(s) recorded','count',item_index,'request_id',p_request),auth.uid());
      end if;
      return result;
    end if;
    entered_on:=coalesce(nullif(p_input->>'depositDate','')::date,current_date);
    if entered_on>current_date then raise exception 'payment_date_future';end if;
    result:=public.commercial_command_v062(p_dealer,p_command,p_id,p_input,p_request);
    if coalesce((p_input->>'depositAmount')::numeric,0)>0 then
      v_method:=p_input->>'depositMethod';confirmed:=coalesce((p_input->>'fundsConfirmed')::boolean,false);
      update public.payments set reference=nullif(left(trim(p_input->>'depositReference'),120),''),
        clearance_status=case when v_method in ('bank','eft','cheque','draft') and not confirmed then 'pending'
          when v_method in ('bank','eft','cheque','draft') then 'cleared' else 'not_required' end,
        cleared_at=case when v_method in ('bank','eft','cheque','draft') and confirmed then now() else null end,
        cleared_on=case when v_method in ('bank','eft','cheque','draft') and confirmed then entered_on else null end,
        cleared_by=case when v_method in ('bank','eft','cheque','draft') and confirmed then auth.uid() else null end
      where dealer_id=p_dealer and deal_id=(result->>'id')::uuid and kind='deposit';
    end if;
    return result;
  end if;

  if p_command='document' and p_input->>'kind'='agreement' then
    select * into d from public.deals where id=p_id and dealer_id=p_dealer;
    if not found then raise exception 'deal_missing';end if;
    if d.status not in ('agreed','finance') then raise exception 'explicit_agreement_required';end if;
  end if;
  if p_command in ('cancel_deal','return_sale','return_trade_sale') and exists(
    select 1 from public.payments where deal_id=p_id and clearance_status='pending'
  ) then raise exception 'pending_receipts_resolve_first';end if;
  if p_command in ('credit_note','reject_receipt') then
    result:=public.commercial_command_v062(p_dealer,p_command,p_id,p_input,p_request);
    perform public.refresh_invoice_payment_status(
      case when p_command='credit_note' then p_id else (select deal_id from public.payments where id=p_id and dealer_id=p_dealer) end
    );
    return result;
  end if;
  if p_command not in ('payment','clear_receipt','reverse_receipt','force_agreement')
    and not (p_command='status' and p_input->>'status'='completed') then
    return public.commercial_command_v062(p_dealer,p_command,p_id,p_input,p_request);
  end if;

  if auth.uid() is null then raise exception 'commercial_not_allowed';end if;
  if p_request is null or p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>30000 then raise exception 'invalid_request';end if;
  perform 1 from public.dealers where id=p_dealer for update;
  select * into cached from public.commercial_requests where dealer_id=p_dealer and request_id=p_request;
  if found then
    if cached.command<>p_command or cached.input<>jsonb_build_object('id',p_id,'data',p_input) then raise exception 'request_reused';end if;
    return cached.result;
  end if;

  if p_command='payment' then
    if not public.commercial_allowed(p_dealer,'payment') then raise exception 'commercial_not_allowed';end if;
    select * into d from public.deals where id=p_id and dealer_id=p_dealer for update;
    if not found then raise exception 'deal_missing';end if;
    if d.status in ('cancelled','reversed') then raise exception 'deal_closed';end if;
    amount:=(p_input->>'amount')::numeric;v_method:=coalesce(p_input->>'method','');
    entered_on:=coalesce(nullif(p_input->>'paidOn','')::date,current_date);
    if entered_on>current_date then raise exception 'payment_date_future';end if;
    if amount is null or amount<=0 or amount>100000000 or amount<>round(amount,2)
      or coalesce(p_input->>'kind','') not in ('deposit','balance','finance_payout')
      or v_method not in ('cash','bank','eft','cheque','draft','card','finance') then raise exception 'invalid_payment';end if;
    if v_method in ('cheque','draft') and coalesce(length(trim(p_input->>'reference')),0)<2 then raise exception 'receipt_reference_required';end if;
    if p_input->>'kind'='finance_payout' and (d.finance_status<>'approved' or amount>d.finance_expected-coalesce((select sum(p.amount) from public.payments p where p.deal_id=d.id and p.kind='finance_payout' and not exists(select 1 from public.payments r where r.reverses_payment_id=p.id)),0)) then raise exception 'finance_not_approved';end if;
    confirmed:=coalesce((p_input->>'fundsConfirmed')::boolean,false);
    clearance:=case when v_method in ('bank','eft','cheque','draft') and not confirmed then 'pending'
      when v_method in ('bank','eft','cheque','draft') then 'cleared' else 'not_required' end;
    insert into public.payments(dealer_id,deal_id,kind,method,amount,currency,paid_on,reference,created_by,
      clearance_status,cleared_at,cleared_on,cleared_by)
    values(p_dealer,d.id,p_input->>'kind',v_method,amount,d.currency,entered_on,nullif(left(trim(p_input->>'reference'),120),''),auth.uid(),
      clearance,case when clearance='cleared' then now() end,case when clearance='cleared' then entered_on end,case when clearance='cleared' then auth.uid() end)
    returning * into receipt;
    perform public.refresh_invoice_payment_status(d.id);
    result:=jsonb_build_object('id',receipt.id,'clearanceStatus',receipt.clearance_status,'balance',public.commercial_totals(d.id));
    insert into public.deal_events(dealer_id,deal_id,kind,detail,created_by) values(p_dealer,d.id,'payment',jsonb_build_object(
      'message',case when clearance='pending' then initcap(v_method)||' recorded · funds not confirmed' else 'Payment received' end,
      'payment_id',receipt.id,'kind',receipt.kind,'method',v_method,'amount',amount,'entered_date',entered_on,
      'reference',receipt.reference,'clearance_status',clearance),auth.uid());
  elsif p_command='clear_receipt' then
    if not public.commercial_allowed(p_dealer,'payment') or coalesce(public.user_role_in(p_dealer)::text,'') not in ('owner','admin','accountant') then raise exception 'receipt_clearance_not_allowed';end if;
    select * into receipt from public.payments where id=p_id and dealer_id=p_dealer for update;
    if not found then raise exception 'receipt_missing';end if;
    if receipt.method not in ('bank','eft','cheque','draft') then raise exception 'receipt_clearance_not_required';end if;
    entered_on:=coalesce(nullif(p_input->>'clearedOn','')::date,current_date);
    if entered_on>current_date then raise exception 'payment_date_future';end if;
    if receipt.clearance_status='cleared' then result:=jsonb_build_object('id',receipt.id,'clearanceStatus','cleared');
    elsif receipt.clearance_status<>'pending' then raise exception 'receipt_not_pending';
    else
      update public.payments set clearance_status='cleared',cleared_at=now(),cleared_on=entered_on,cleared_by=auth.uid(),
        reconciliation_reference=nullif(left(trim(p_input->>'reference'),120),'') where id=receipt.id returning * into receipt;
      perform public.refresh_invoice_payment_status(receipt.deal_id);
      result:=jsonb_build_object('id',receipt.id,'clearanceStatus','cleared','balance',public.commercial_totals(receipt.deal_id));
      insert into public.deal_events(dealer_id,deal_id,kind,detail,created_by) values(p_dealer,receipt.deal_id,'receipt_cleared',jsonb_build_object(
        'message',initcap(receipt.method)||' confirmed in account','payment_id',receipt.id,'amount',receipt.amount,
        'cleared_on',entered_on,'reconciliation_reference',receipt.reconciliation_reference),auth.uid());
    end if;
  elsif p_command='reverse_receipt' then
    if not public.commercial_allowed(p_dealer,'payment') or coalesce(public.user_role_in(p_dealer)::text,'') not in ('owner','admin','accountant') then raise exception 'financial_reversal_not_allowed';end if;
    select * into receipt from public.payments where id=p_id and dealer_id=p_dealer for update;
    if not found or receipt.kind not in ('deposit','balance','finance_payout') then raise exception 'receipt_missing';end if;
    if receipt.clearance_status not in ('not_required','cleared') then raise exception 'receipt_not_reversible';end if;
    if exists(select 1 from public.payments where reverses_payment_id=receipt.id and kind='receipt_reversal') then raise exception 'receipt_already_rejected';end if;
    reason:=nullif(trim(p_input->>'reason'),'');if reason is null then raise exception 'reversal_reason_required';end if;
    entered_on:=coalesce(nullif(p_input->>'reversedOn','')::date,current_date);if entered_on>current_date then raise exception 'payment_date_future';end if;
    insert into public.payments(dealer_id,deal_id,kind,method,amount,currency,paid_on,reference,created_by,clearance_status,
      reverses_payment_id,rejected_at,rejected_by,rejection_reason)
    values(p_dealer,receipt.deal_id,'receipt_reversal',receipt.method,receipt.amount,receipt.currency,entered_on,
      nullif(left(trim(p_input->>'reference'),120),''),auth.uid(),case when receipt.method in ('bank','eft','cheque','draft') then 'rejected' else 'not_required' end,
      receipt.id,now(),auth.uid(),left(reason,500)) returning id into reversal;
    perform public.refresh_invoice_payment_status(receipt.deal_id);
    result:=jsonb_build_object('id',receipt.id,'reversalId',reversal,'balance',public.commercial_totals(receipt.deal_id));
    insert into public.deal_events(dealer_id,deal_id,kind,detail,created_by) values(p_dealer,receipt.deal_id,'receipt_reversed',jsonb_build_object(
      'message','Receipt reversed · customer balance reopened','payment_id',receipt.id,'reversal_id',reversal,
      'amount',receipt.amount,'date',entered_on,'reason',reason,'reference',left(p_input->>'reference',120)),auth.uid());
  elsif p_command='force_agreement' then
    if not public.commercial_allowed(p_dealer,'work') then raise exception 'commercial_not_allowed';end if;
    select * into d from public.deals where id=p_id and dealer_id=p_dealer for update;
    if not found or d.status in ('completed','cancelled','reversed') then raise exception 'deal_closed_or_missing';end if;
    if nullif(p_input->>'expectedVersion','') is not null and (p_input->>'expectedVersion')::integer is distinct from d.version then raise exception 'stale_deal';end if;
    update public.deals set status='agreed',updated_at=now() where id=d.id;
    doc:=public.issue_commercial_document(d.id,'agreement');
    result:=jsonb_build_object('id',doc,'status','agreed');
    insert into public.deal_events(dealer_id,deal_id,kind,detail,created_by) values(p_dealer,d.id,'agreement_forced',jsonb_build_object(
      'message','Agreement deliberately created without requiring a deposit','document_id',doc),auth.uid());
  else
    if not public.commercial_allowed(p_dealer,'work') then raise exception 'commercial_not_allowed';end if;
    select * into d from public.deals where id=p_id and dealer_id=p_dealer for update;
    if not found or d.status not in ('agreed','finance') then raise exception 'agreement_status_required';end if;
    if not exists(select 1 from public.deal_documents where deal_id=d.id and kind='agreement' and deal_version=d.version and status<>'void') then raise exception 'current_agreement_required';end if;
    chosen:=coalesce(nullif(p_input->>'invoiceDate','')::date,current_date);
    if chosen>current_date then raise exception 'invoice_date_future';end if;
    select max_invoice_backdate_days into allowed_days from public.accounting_settings where dealer_id=p_dealer;
    if chosen<current_date-coalesce(allowed_days,0) then raise exception 'invoice_date_outside_policy';end if;
    if chosen<>current_date and coalesce(public.user_role_in(p_dealer)::text,'') not in ('owner','admin','accountant') then raise exception 'invoice_backdate_not_allowed';end if;
    if exists(select 1 from public.accounting_periods where dealer_id=p_dealer and status='closed' and chosen between period_start and period_end) then raise exception 'accounting_period_closed';end if;
    perform set_config('app.invoice_effective_date',chosen::text,true);
    select * into strict o from public.deal_orders where deal_id=d.id and kind='sale';
    update public.vehicles set status='sold' where id=o.vehicle_id and dealer_id=p_dealer;
    update public.deals set status='completed',stage='after_sales',closed_at=now(),updated_at=now() where id=d.id;
    insert into public.vehicle_deals(vehicle_id,dealer_id,sale_price,part_exchange_value,sale_status,sold_date,finance_provider,buyer_name)
      values(o.vehicle_id,p_dealer,d.retail_price,d.siv_total,'sold',chosen,d.finance_company,(select name from public.customers where id=d.customer_id))
      on conflict(vehicle_id) do update set sale_price=excluded.sale_price,part_exchange_value=excluded.part_exchange_value,
        sale_status=excluded.sale_status,sold_date=excluded.sold_date,finance_provider=excluded.finance_provider,buyer_name=excluded.buyer_name;
    if d.lead_id is not null then
      update public.leads set stage='sold',next_action=null,next_action_at=null,version=version+1,updated_at=now() where id=d.lead_id and dealer_id=p_dealer;
      insert into public.lead_activities(dealer_id,lead_id,type,body,created_by,detail) values(p_dealer,d.lead_id,'note','Sale completed: '||d.deal_no,auth.uid(),jsonb_build_object('deal_id',d.id));
    end if;
    doc:=public.issue_commercial_document(d.id,'invoice');result:=jsonb_build_object('id',doc,'balance',public.commercial_totals(d.id));
    insert into public.deal_events(dealer_id,deal_id,kind,detail,created_by) values(p_dealer,d.id,'completed',jsonb_build_object(
      'message','Sale completed and final invoice issued','document_id',doc,'invoice_date',chosen,'receivable',public.commercial_totals(d.id)),auth.uid());
  end if;
  insert into public.commercial_requests(dealer_id,request_id,command,input,result)
    values(p_dealer,p_request,p_command,jsonb_build_object('id',p_id,'data',p_input),result);
  return result;
end $$;
revoke all on function public.commercial_command(uuid,text,uuid,jsonb,uuid) from public,anon;
grant execute on function public.commercial_command(uuid,text,uuid,jsonb,uuid) to authenticated;

create function public.guard_bank_match_source() returns trigger language plpgsql security definer set search_path=public as $$
declare sale public.payments;purchase public.po_payments;
begin
  if new.source_type='sale_payment' then
    select * into sale from public.payments where id=new.source_id and dealer_id=new.dealer_id;
    if not found or sale.method='cash' or not (
      (sale.kind='receipt_reversal' and exists(select 1 from public.payments original where original.id=sale.reverses_payment_id and original.cleared_at is not null))
      or (sale.kind<>'receipt_reversal' and sale.clearance_status in ('not_required','cleared'))
    ) then raise exception 'bank_source_not_realised';end if;
  else
    select * into purchase from public.po_payments where id=new.source_id and dealer_id=new.dealer_id;
    if not found or purchase.method='cash' then raise exception 'bank_source_not_realised';end if;
  end if;
  return new;
end $$;
create trigger bank_matches_realised_source before insert on public.bank_matches for each row execute function public.guard_bank_match_source();

alter function public.bank_reconciliation_overview(uuid,uuid) rename to bank_reconciliation_overview_v062;
revoke all on function public.bank_reconciliation_overview_v062(uuid,uuid) from public,anon,authenticated;
create function public.bank_reconciliation_overview(p_dealer uuid,p_reconciliation uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;candidates jsonb;
begin
  result:=public.bank_reconciliation_overview_v062(p_dealer,p_reconciliation);
  select coalesce(jsonb_agg(x order by x->>'date',x->>'label'),'[]') into candidates from (
    select jsonb_build_object('sourceType','sale_payment','id',p.id,'date',p.paid_on,'direction',case when p.kind in ('refund','receipt_reversal') then -1 else 1 end,
      'amount',p.amount,'matched',coalesce(m.used,0),'available',p.amount-coalesce(m.used,0),'label',d.deal_no||' · '||c.name||' · '||replace(p.kind,'_',' ')) x
    from public.payments p join public.deals d on d.id=p.deal_id left join public.customers c on c.id=d.customer_id
    left join lateral(select sum(amount) used from public.bank_matches where dealer_id=p_dealer and source_type='sale_payment' and source_id=p.id)m on true
    where p.dealer_id=p_dealer and p.method<>'cash' and p.amount>coalesce(m.used,0) and (
      (p.kind='receipt_reversal' and exists(select 1 from public.payments original where original.id=p.reverses_payment_id and original.cleared_at is not null))
      or (p.kind<>'receipt_reversal' and p.clearance_status in ('not_required','cleared')))
    union all
    select jsonb_build_object('sourceType','purchase_payment','id',p.id,'date',p.paid_on,'direction',case when p.entry_kind='reversal' then 1 else -1 end,
      'amount',p.amount,'matched',coalesce(m.used,0),'available',p.amount-coalesce(m.used,0),'label',po.po_no||' · '||c.name||' · '||p.recipient) x
    from public.po_payments p join public.purchase_orders po on po.id=p.po_id left join public.customers c on c.id=po.vendor_id
    left join lateral(select sum(amount) used from public.bank_matches where dealer_id=p_dealer and source_type='purchase_payment' and source_id=p.id)m on true
    where p.dealer_id=p_dealer and p.method<>'cash' and p.amount>coalesce(m.used,0)
  ) q;
  return jsonb_set(result,'{candidates}',candidates,true);
end $$;
revoke all on function public.bank_reconciliation_overview(uuid,uuid) from public,anon;
grant execute on function public.bank_reconciliation_overview(uuid,uuid) to authenticated;
