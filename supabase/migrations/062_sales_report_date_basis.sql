-- Sales can be viewed as a commercial cohort (Deal opened) or as recognised
-- revenue (final invoice effective date). The selected basis is returned with
-- the payload so exports and UI labels cannot silently mix the two concepts.

drop function public.sales_lifecycle_report(uuid,date,date);

create function public.sales_lifecycle_report(
  p_dealer uuid,p_from date,p_to date,p_basis text default 'invoice'
) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare summary jsonb;open_positions jsonb;invoice_positions jsonb;credit_positions jsonb;
  receipt_positions jsonb;sales_by_responsible jsonb;
begin
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'cost') then raise exception 'commercial_not_allowed';end if;
  if p_from is null or p_to is null or p_from>p_to or p_to-p_from>3660 then raise exception 'invalid_report_period';end if;
  if p_basis not in ('deal','invoice') then raise exception 'invalid_report_basis';end if;

  with current_agreements as (
    select distinct on (doc.deal_id) doc.deal_id,coalesce((doc.snapshot->>'sale')::numeric,0) agreement_gross
    from public.deal_documents doc join public.deals d on d.id=doc.deal_id and d.dealer_id=doc.dealer_id
    where doc.dealer_id=p_dealer and doc.kind='agreement' and doc.status<>'void'
      and doc.deal_version=d.version and d.status not in ('completed','cancelled','reversed')
    order by doc.deal_id,doc.created_at desc
  ), invoice_totals as (
    select coalesce(sum((inv.snapshot->>'sale')::numeric),0) invoice_gross,count(*) invoice_count
    from public.deal_documents inv join public.deals d on d.id=inv.deal_id and d.dealer_id=inv.dealer_id
    where inv.dealer_id=p_dealer and inv.kind='invoice' and inv.status<>'void'
      and (case when p_basis='deal' then d.created_at::date else inv.effective_date end) between p_from and p_to
  ), credit_totals as (
    select coalesce(sum(cn.gross_adjustment),0) credit_gross,count(*) credit_count
    from public.deal_documents cn join public.deals d on d.id=cn.deal_id and d.dealer_id=cn.dealer_id
    where cn.dealer_id=p_dealer and cn.kind='credit_note' and cn.status<>'void'
      and (case when p_basis='deal' then d.created_at::date else cn.effective_date end) between p_from and p_to
  ), pending as (
    select coalesce(sum(p.amount),0) pending_total,count(*) pending_count
    from public.payments p join public.deals d on d.id=p.deal_id and d.dealer_id=p.dealer_id
    join public.deal_documents inv on inv.deal_id=d.id and inv.kind='invoice' and inv.status<>'void'
    where p.dealer_id=p_dealer and p.clearance_status='pending'
      and (case when p_basis='deal' then d.created_at::date else inv.effective_date end) between p_from and p_to
  ), outstanding as (
    select coalesce(sum(greatest((public.commercial_totals(invoiced.id)->>'balance')::numeric,0)),0) outstanding_total
    from (select distinct d.id from public.deals d join public.deal_documents inv on inv.deal_id=d.id
      where inv.dealer_id=p_dealer and inv.kind='invoice' and inv.status<>'void'
        and (case when p_basis='deal' then d.created_at::date else inv.effective_date end) between p_from and p_to) invoiced
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
    where dealer_id=p_dealer and kind='credit_note' and status<>'void' group by original_document_id
  ), pending as (
    select deal_id,coalesce(sum(amount),0) pending from public.payments
    where dealer_id=p_dealer and clearance_status='pending' group by deal_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',inv.id,'dealId',d.id,'dealNo',d.deal_no,'invoiceNo',inv.number,
    'issuedAt',inv.effective_date,'invoiceDate',inv.effective_date,'dealDate',d.created_at::date,
    'reportDate',case when p_basis='deal' then d.created_at::date else inv.effective_date end,
    'customer',coalesce(c.name,'—'),'phone',coalesce(nullif(c.mobile,''),nullif(c.phone,''),'—'),
    'vehicle',coalesce(inv.snapshot->'vehicle'->>'label','—'),'currency',d.currency,
    'responsibleId',coalesce(inv.salesperson_id,d.salesperson_id),'responsible',coalesce(sp.full_name,'—'),
    'gross',coalesce((inv.snapshot->>'sale')::numeric,0),'credited',coalesce(cr.credited,0),
    'net',coalesce((inv.snapshot->>'sale')::numeric,0)-coalesce(cr.credited,0),
    'pendingClearance',coalesce(p.pending,0),
    'outstanding',greatest((public.commercial_totals(d.id)->>'balance')::numeric,0)
  ) order by case when p_basis='deal' then d.created_at else inv.effective_date::timestamptz end desc),'[]'::jsonb) into invoice_positions
  from public.deal_documents inv join public.deals d on d.id=inv.deal_id and d.dealer_id=inv.dealer_id
  left join public.customers c on c.id=d.customer_id and c.dealer_id=p_dealer
  left join public.profiles sp on sp.id=coalesce(inv.salesperson_id,d.salesperson_id)
  left join credits cr on cr.original_document_id=inv.id left join pending p on p.deal_id=d.id
  where inv.dealer_id=p_dealer and inv.kind='invoice' and inv.status<>'void'
    and (case when p_basis='deal' then d.created_at::date else inv.effective_date end) between p_from and p_to;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',cn.id,'dealId',d.id,'dealNo',d.deal_no,'creditNo',cn.number,'issuedAt',cn.effective_date,
    'invoiceNo',original.number,'customer',coalesce(cn.snapshot->'customer'->>'name','—'),
    'vehicle',coalesce(cn.snapshot->'vehicle'->>'label','—'),'currency',d.currency,
    'gross',coalesce(cn.gross_adjustment,0),'reason',coalesce(cn.correction_reason,'—')
  ) order by cn.effective_date desc,cn.created_at desc),'[]'::jsonb) into credit_positions
  from public.deal_documents cn join public.deals d on d.id=cn.deal_id and d.dealer_id=cn.dealer_id
  left join public.deal_documents original on original.id=cn.original_document_id
  where cn.dealer_id=p_dealer and cn.kind='credit_note' and cn.status<>'void'
    and (case when p_basis='deal' then d.created_at::date else cn.effective_date end) between p_from and p_to;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'dealId',d.id,'dealNo',d.deal_no,'invoiceNo',inv.number,'invoiceDate',inv.effective_date,
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
    and (case when p_basis='deal' then d.created_at::date else inv.effective_date end) between p_from and p_to;

  with movements as (
    select coalesce(inv.salesperson_id,d.salesperson_id) salesperson_id,
      coalesce((inv.snapshot->>'sale')::numeric,0) gross,0::numeric credited
    from public.deal_documents inv join public.deals d on d.id=inv.deal_id
    where inv.dealer_id=p_dealer and inv.kind='invoice' and inv.status<>'void'
      and (case when p_basis='deal' then d.created_at::date else inv.effective_date end) between p_from and p_to
    union all
    select coalesce(inv.salesperson_id,d.salesperson_id),0::numeric,coalesce(cn.gross_adjustment,0)
    from public.deal_documents cn join public.deal_documents inv on inv.id=cn.original_document_id
    join public.deals d on d.id=cn.deal_id
    where cn.dealer_id=p_dealer and cn.kind='credit_note' and cn.status<>'void'
      and (case when p_basis='deal' then d.created_at::date else cn.effective_date end) between p_from and p_to
  ), grouped as (
    select salesperson_id,sum(gross) gross,sum(credited) credited,count(*) filter(where gross>0) invoices
    from movements group by salesperson_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'responsibleId',g.salesperson_id,'responsible',coalesce(p.full_name,'—'),'invoices',g.invoices,
    'gross',g.gross,'credited',g.credited,'net',g.gross-g.credited
  ) order by g.gross-g.credited desc),'[]'::jsonb) into sales_by_responsible
  from grouped g left join public.profiles p on p.id=g.salesperson_id;

  return jsonb_build_object('basis',p_basis,'summary',summary,'openPositions',open_positions,
    'invoicePositions',invoice_positions,'creditPositions',credit_positions,
    'pendingReceipts',receipt_positions,'salesByResponsible',sales_by_responsible,
    'period',jsonb_build_object('from',p_from,'to',p_to));
end $$;
revoke all on function public.sales_lifecycle_report(uuid,date,date,text) from public,anon;
grant execute on function public.sales_lifecycle_report(uuid,date,date,text) to authenticated;
