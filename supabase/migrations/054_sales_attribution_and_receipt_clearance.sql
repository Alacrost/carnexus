-- Sales attribution and bank-clearance control for non-cash receipts.
-- A cheque or bank draft can settle the customer balance and permit invoicing,
-- while remaining visible as an unpresented receipt until the bank clears it.

alter table public.payments drop constraint if exists payments_method_check;
alter table public.payments add constraint payments_method_check
  check (method in ('cash','bank','eft','cheque','draft','card','finance','part_exchange'));
alter table public.payments
  add column clearance_status text not null default 'not_required',
  add column cleared_at timestamptz,
  add column cleared_by uuid references auth.users(id),
  add column reconciliation_reference text;
alter table public.payments add constraint payments_clearance_status_check
  check (clearance_status in ('not_required','pending','cleared','rejected'));
alter table public.payments add constraint payments_clearance_method_check check (
  (method in ('cheque','draft') and clearance_status in ('pending','cleared','rejected'))
  or (method not in ('cheque','draft') and clearance_status='not_required')
);
create index payments_pending_clearance_idx
  on public.payments(dealer_id,paid_on,created_at) where clearance_status='pending';

-- Keep the salesperson who earned the sale on the issued document. This is
-- intentionally independent of the user who created the Deal or invoice.
alter table public.deal_documents add column salesperson_id uuid references auth.users(id);
update public.deal_documents doc set salesperson_id=d.salesperson_id
from public.deals d where d.id=doc.deal_id and doc.salesperson_id is null;
create function public.set_document_salesperson() returns trigger
language plpgsql set search_path=public as $$
begin
  if new.salesperson_id is null then
    select salesperson_id into new.salesperson_id from public.deals where id=new.deal_id and dealer_id=new.dealer_id;
  end if;
  return new;
end $$;
create trigger deal_document_salesperson before insert on public.deal_documents
for each row execute function public.set_document_salesperson();

alter function public.commercial_command(uuid,text,uuid,jsonb,uuid)
  rename to commercial_command_v053;
revoke all on function public.commercial_command_v053(uuid,text,uuid,jsonb,uuid)
  from public,anon,authenticated;

create function public.commercial_command(
  p_dealer uuid,p_command text,p_id uuid,p_input jsonb,p_request uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  cached public.commercial_requests;
  d public.deals;
  receipt public.payments;
  result jsonb;
  amount numeric;
  balance numeric;
  paid numeric;
  total numeric;
  v_method text;
  clearance text;
  delegated_input jsonb;
  converted_payment uuid;
begin
  -- The legacy sale transaction already creates the Deal and its optional
  -- deposit atomically. Delegate with a compatible method, then convert that
  -- one deposit to an unpresented instrument inside the same transaction.
  if p_command='sale' and coalesce(p_input->>'depositMethod','') in ('eft','cheque','draft') then
    if coalesce((p_input->>'depositAmount')::numeric,0)<=0
      or (p_input->>'depositMethod' in ('cheque','draft') and coalesce(length(trim(p_input->>'depositReference')),0)<2) then
      raise exception 'receipt_reference_required';
    end if;
    v_method:=p_input->>'depositMethod';
    delegated_input:=jsonb_set(p_input,'{depositMethod}','"bank"'::jsonb);
    result:=public.commercial_command_v053(p_dealer,p_command,p_id,delegated_input,p_request);
    update public.payments set method=v_method,
      clearance_status=case when v_method in ('cheque','draft') then 'pending' else 'not_required' end,
      reference=left(p_input->>'depositReference',120)
      where dealer_id=p_dealer and deal_id=(result->>'id')::uuid and kind='deposit'
        and method='bank' and clearance_status='not_required'
      returning id into converted_payment;
    if converted_payment is not null then
      insert into public.deal_events(dealer_id,deal_id,kind,detail,created_by)
      values(p_dealer,(result->>'id')::uuid,case when v_method in ('cheque','draft') then 'receipt_pending' else 'payment_method_recorded' end,jsonb_build_object(
        'message',initcap(v_method)||' deposit received'||case when v_method in ('cheque','draft') then ' · awaiting bank clearance' else '' end,
        'payment_id',converted_payment,'method',v_method,'reference',left(p_input->>'depositReference',120)
      ),auth.uid());
    end if;
    return result;
  end if;
  if p_command not in ('payment','clear_receipt') then
    return public.commercial_command_v053(p_dealer,p_command,p_id,p_input,p_request);
  end if;
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'payment') then
    raise exception 'commercial_not_allowed';
  end if;
  if p_request is null or p_input is null or jsonb_typeof(p_input)<>'object'
    or octet_length(p_input::text)>30000 then raise exception 'invalid_request';end if;
  perform 1 from public.dealers where id=p_dealer for update;
  select * into cached from public.commercial_requests
    where dealer_id=p_dealer and request_id=p_request;
  if found then
    if cached.command<>p_command or cached.input<>jsonb_build_object('id',p_id,'data',p_input)
      then raise exception 'request_reused';end if;
    return cached.result;
  end if;

  if p_command='payment' then
    select * into d from public.deals where id=p_id and dealer_id=p_dealer for update;
    if not found then raise exception 'deal_missing';end if;
    if d.status in ('completed','cancelled','reversed') then raise exception 'deal_closed';end if;
    amount:=(p_input->>'amount')::numeric;
    v_method:=coalesce(p_input->>'method','');
    if amount is null or amount<=0 or amount>100000000 or amount<>round(amount,2)
      or coalesce(p_input->>'kind','') not in ('deposit','balance','finance_payout')
      or v_method not in ('cash','bank','eft','cheque','draft','card','finance') then
      raise exception 'invalid_payment';
    end if;
    if v_method in ('cheque','draft') and coalesce(length(trim(p_input->>'reference')),0)<2 then
      raise exception 'receipt_reference_required';
    end if;
    result:=public.commercial_totals(d.id);
    balance:=(result->>'balance')::numeric;
    paid:=(result->>'paid')::numeric;
    total:=(result->>'total')::numeric;
    if amount>balance then raise exception 'payment_exceeds_balance';end if;
    if p_input->>'kind'='finance_payout' and (
      d.finance_status<>'approved'
      or amount>d.finance_expected-coalesce((select sum(p.amount) from public.payments p where p.deal_id=d.id and p.kind='finance_payout'),0)
    ) then raise exception 'finance_not_approved';end if;
    clearance:=case when v_method in ('cheque','draft') then 'pending' else 'not_required' end;
    insert into public.payments(
      dealer_id,deal_id,kind,method,amount,currency,paid_on,reference,created_by,clearance_status
    ) values(
      p_dealer,d.id,p_input->>'kind',v_method,amount,d.currency,
      coalesce(nullif(p_input->>'paidOn','')::date,current_date),left(p_input->>'reference',120),auth.uid(),clearance
    ) returning * into receipt;
    result:=jsonb_build_object('id',receipt.id,'clearanceStatus',receipt.clearance_status);
    insert into public.deal_events(dealer_id,deal_id,kind,detail,created_by)
    values(p_dealer,d.id,'payment',jsonb_build_object(
      'message',case when clearance='pending' then initcap(v_method)||' received · awaiting bank clearance' else 'Payment recorded' end,
      'payment_id',receipt.id,'kind',receipt.kind,'method',v_method,'amount',amount,
      'reference',receipt.reference,'clearance_status',clearance
    ),auth.uid());
    insert into public.audit_logs(dealer_id,user_id,action,entity,entity_id,meta)
    values(p_dealer,auth.uid(),'payment_recorded','payment',receipt.id,jsonb_build_object(
      'deal_id',d.id,'kind',receipt.kind,'method',v_method,'amount',amount,'clearance_status',clearance
    ));
  else
    if coalesce(public.user_role_in(p_dealer)::text,'') not in ('owner','admin','accountant') then
      raise exception 'receipt_clearance_not_allowed';
    end if;
    select * into receipt from public.payments
      where id=p_id and dealer_id=p_dealer for update;
    if not found then raise exception 'receipt_missing';end if;
    if receipt.method not in ('cheque','draft') then raise exception 'receipt_clearance_not_required';end if;
    if receipt.clearance_status='cleared' then
      result:=jsonb_build_object('id',receipt.id,'clearanceStatus','cleared');
    elsif receipt.clearance_status<>'pending' then
      raise exception 'receipt_not_pending';
    else
      update public.payments set clearance_status='cleared',cleared_at=now(),cleared_by=auth.uid(),
        reconciliation_reference=nullif(left(trim(p_input->>'reference'),120),'')
        where id=receipt.id returning * into receipt;
      result:=jsonb_build_object('id',receipt.id,'clearanceStatus','cleared');
      insert into public.deal_events(dealer_id,deal_id,kind,detail,created_by)
      values(p_dealer,receipt.deal_id,'receipt_cleared',jsonb_build_object(
        'message',initcap(receipt.method)||' cleared by bank','payment_id',receipt.id,
        'amount',receipt.amount,'reconciliation_reference',receipt.reconciliation_reference
      ),auth.uid());
      insert into public.audit_logs(dealer_id,user_id,action,entity,entity_id,meta)
      values(p_dealer,auth.uid(),'receipt_cleared','payment',receipt.id,jsonb_build_object(
        'deal_id',receipt.deal_id,'method',receipt.method,'amount',receipt.amount,
        'reconciliation_reference',receipt.reconciliation_reference
      ));
    end if;
  end if;
  insert into public.commercial_requests(dealer_id,request_id,command,input,result)
  values(p_dealer,p_request,p_command,jsonb_build_object('id',p_id,'data',p_input),result);
  return result;
end $$;
revoke all on function public.commercial_command(uuid,text,uuid,jsonb,uuid) from public,anon;
grant execute on function public.commercial_command(uuid,text,uuid,jsonb,uuid) to authenticated;

create or replace function public.sales_lifecycle_report(p_dealer uuid,p_from date,p_to date)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare summary jsonb;open_positions jsonb;invoice_positions jsonb;credit_positions jsonb;
  receipt_positions jsonb;sales_by_responsible jsonb;
begin
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'cost') then raise exception 'commercial_not_allowed';end if;
  if p_from is null or p_to is null or p_from>p_to or p_to-p_from>3660 then raise exception 'invalid_report_period';end if;

  with current_agreements as (
    select distinct on (doc.deal_id) doc.deal_id,coalesce((doc.snapshot->>'sale')::numeric,0) agreement_gross
    from public.deal_documents doc join public.deals d on d.id=doc.deal_id and d.dealer_id=doc.dealer_id
    where doc.dealer_id=p_dealer and doc.kind='agreement' and doc.status<>'void'
      and doc.deal_version=d.version and d.status not in ('completed','cancelled','reversed')
    order by doc.deal_id,doc.created_at desc
  ), invoice_totals as (
    select coalesce(sum((doc.snapshot->>'sale')::numeric),0) invoice_gross,count(*) invoice_count
    from public.deal_documents doc where doc.dealer_id=p_dealer and doc.kind='invoice' and doc.status<>'void'
      and doc.created_at::date between p_from and p_to
  ), credit_totals as (
    select coalesce(sum(doc.gross_adjustment),0) credit_gross,count(*) credit_count
    from public.deal_documents doc where doc.dealer_id=p_dealer and doc.kind='credit_note' and doc.status<>'void'
      and doc.created_at::date between p_from and p_to
  ), pending as (
    select coalesce(sum(p.amount),0) pending_total,count(*) pending_count from public.payments p
    join public.deal_documents inv on inv.deal_id=p.deal_id and inv.kind='invoice' and inv.status<>'void'
    where p.dealer_id=p_dealer and p.clearance_status='pending' and inv.created_at::date between p_from and p_to
  ), outstanding as (
    select coalesce(sum(greatest((public.commercial_totals(invoiced.id)->>'balance')::numeric,0)),0) outstanding_total
    from (select distinct d.id from public.deals d join public.deal_documents inv on inv.deal_id=d.id
      where inv.dealer_id=p_dealer and inv.kind='invoice' and inv.status<>'void'
        and inv.created_at::date between p_from and p_to) invoiced
  )
  select jsonb_build_object(
    'openDeals',(select count(*) from current_agreements),
    'openAgreementValue',(select coalesce(sum(agreement_gross),0) from current_agreements),
    'invoices',i.invoice_count,'invoicedGross',i.invoice_gross,
    'creditNotes',c.credit_count,'creditedGross',c.credit_gross,
    'netInvoicedRevenue',i.invoice_gross-c.credit_gross,
    'pendingClearance',p.pending_total,'pendingReceipts',p.pending_count,
    'customerOutstanding',o.outstanding_total
  ) into summary from invoice_totals i cross join credit_totals c cross join pending p cross join outstanding o;

  with current_agreements as (
    select distinct on (doc.deal_id) d.id,d.deal_no,d.currency,d.customer_id,doc.id agreement_id,
      doc.number agreement_no,doc.created_at agreement_issued_at,coalesce((doc.snapshot->>'sale')::numeric,0) agreement_gross,
      coalesce((doc.snapshot->'figures'->>'balanceAgreement')::numeric,0) agreement_balance,
      coalesce(doc.snapshot->'vehicle'->>'label','—') vehicle
    from public.deal_documents doc join public.deals d on d.id=doc.deal_id and d.dealer_id=doc.dealer_id
    where doc.dealer_id=p_dealer and doc.kind='agreement' and doc.status<>'void'
      and doc.deal_version=d.version and d.status not in ('completed','cancelled','reversed')
    order by doc.deal_id,doc.created_at desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'dealNo',a.deal_no,'agreementId',a.agreement_id,'agreementNo',a.agreement_no,
    'issuedAt',a.agreement_issued_at,'customer',coalesce(c.name,'—'),'vehicle',a.vehicle,'currency',a.currency,
    'gross',a.agreement_gross,'outstanding',greatest(a.agreement_balance,0)
  ) order by a.agreement_issued_at desc),'[]'::jsonb) into open_positions
  from current_agreements a left join public.customers c on c.id=a.customer_id and c.dealer_id=p_dealer;

  with credits as (
    select original_document_id,coalesce(sum(gross_adjustment),0) credited from public.deal_documents
    where dealer_id=p_dealer and kind='credit_note' and status<>'void' and created_at::date between p_from and p_to
    group by original_document_id
  ), pending as (
    select deal_id,coalesce(sum(amount),0) pending from public.payments
    where dealer_id=p_dealer and clearance_status='pending' group by deal_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',doc.id,'dealId',d.id,'dealNo',d.deal_no,'invoiceNo',doc.number,'issuedAt',doc.created_at,
    'customer',coalesce(c.name,'—'),'phone',coalesce(nullif(c.mobile,''),nullif(c.phone,''),'—'),
    'vehicle',coalesce(doc.snapshot->'vehicle'->>'label','—'),'currency',d.currency,
    'responsibleId',coalesce(doc.salesperson_id,d.salesperson_id),'responsible',coalesce(sp.full_name,'—'),
    'gross',coalesce((doc.snapshot->>'sale')::numeric,0),'credited',coalesce(cr.credited,0),
    'net',coalesce((doc.snapshot->>'sale')::numeric,0)-coalesce(cr.credited,0),
    'pendingClearance',coalesce(p.pending,0),
    'outstanding',greatest((public.commercial_totals(d.id)->>'balance')::numeric,0)
  ) order by doc.created_at desc),'[]'::jsonb) into invoice_positions
  from public.deal_documents doc join public.deals d on d.id=doc.deal_id and d.dealer_id=doc.dealer_id
  left join public.customers c on c.id=d.customer_id and c.dealer_id=p_dealer
  left join public.profiles sp on sp.id=coalesce(doc.salesperson_id,d.salesperson_id)
  left join credits cr on cr.original_document_id=doc.id left join pending p on p.deal_id=d.id
  where doc.dealer_id=p_dealer and doc.kind='invoice' and doc.status<>'void'
    and doc.created_at::date between p_from and p_to;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',doc.id,'dealId',d.id,'dealNo',d.deal_no,'creditNo',doc.number,'issuedAt',doc.created_at,
    'invoiceNo',original.number,'customer',coalesce(doc.snapshot->'customer'->>'name','—'),
    'vehicle',coalesce(doc.snapshot->'vehicle'->>'label','—'),'currency',d.currency,
    'gross',coalesce(doc.gross_adjustment,0),'reason',coalesce(doc.correction_reason,'—')
  ) order by doc.created_at desc),'[]'::jsonb) into credit_positions
  from public.deal_documents doc join public.deals d on d.id=doc.deal_id and d.dealer_id=doc.dealer_id
  left join public.deal_documents original on original.id=doc.original_document_id
  where doc.dealer_id=p_dealer and doc.kind='credit_note' and doc.status<>'void'
    and doc.created_at::date between p_from and p_to;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'dealId',d.id,'dealNo',d.deal_no,'invoiceNo',inv.number,'invoiceDate',inv.created_at,
    'customer',coalesce(c.name,'—'),'phone',coalesce(nullif(c.mobile,''),nullif(c.phone,''),'—'),
    'vehicle',coalesce(inv.snapshot->'vehicle'->>'label','—'),'responsible',coalesce(sp.full_name,'—'),
    'method',p.method,'reference',coalesce(p.reference,'—'),'receivedOn',p.paid_on,
    'amount',p.amount,'currency',p.currency,'clearanceStatus',p.clearance_status,'clearedAt',p.cleared_at
  ) order by p.paid_on,p.created_at),'[]'::jsonb) into receipt_positions
  from public.payments p join public.deals d on d.id=p.deal_id and d.dealer_id=p.dealer_id
  join public.deal_documents inv on inv.deal_id=d.id and inv.kind='invoice' and inv.status<>'void'
  left join public.customers c on c.id=d.customer_id and c.dealer_id=p_dealer
  left join public.profiles sp on sp.id=coalesce(inv.salesperson_id,d.salesperson_id)
  where p.dealer_id=p_dealer and p.clearance_status in ('pending','cleared')
    and inv.created_at::date between p_from and p_to;

  with movements as (
    select coalesce(inv.salesperson_id,d.salesperson_id) salesperson_id,
      coalesce((inv.snapshot->>'sale')::numeric,0) gross,0::numeric credited
    from public.deal_documents inv join public.deals d on d.id=inv.deal_id
    where inv.dealer_id=p_dealer and inv.kind='invoice' and inv.status<>'void'
      and inv.created_at::date between p_from and p_to
    union all
    select coalesce(inv.salesperson_id,d.salesperson_id),0::numeric,coalesce(cn.gross_adjustment,0)
    from public.deal_documents cn join public.deal_documents inv on inv.id=cn.original_document_id
    join public.deals d on d.id=cn.deal_id
    where cn.dealer_id=p_dealer and cn.kind='credit_note' and cn.status<>'void'
      and cn.created_at::date between p_from and p_to
  ), grouped as (
    select salesperson_id,sum(gross) gross,sum(credited) credited,count(*) filter(where gross>0) invoices
    from movements group by salesperson_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'responsibleId',g.salesperson_id,'responsible',coalesce(p.full_name,'—'),'invoices',g.invoices,
    'gross',g.gross,'credited',g.credited,'net',g.gross-g.credited
  ) order by g.gross-g.credited desc),'[]'::jsonb) into sales_by_responsible
  from grouped g left join public.profiles p on p.id=g.salesperson_id;

  return jsonb_build_object('summary',summary,'openPositions',open_positions,
    'invoicePositions',invoice_positions,'creditPositions',credit_positions,
    'pendingReceipts',receipt_positions,'salesByResponsible',sales_by_responsible,
    'period',jsonb_build_object('from',p_from,'to',p_to));
end $$;
revoke all on function public.sales_lifecycle_report(uuid,date,date) from public,anon;
grant execute on function public.sales_lifecycle_report(uuid,date,date) to authenticated;
