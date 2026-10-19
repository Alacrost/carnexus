-- Canonical Deal/SO lifecycle reporting.
-- An open commercial deal is an agreement for the current deal version.
-- Revenue is invoice-backed and reduced by credit notes issued in the period.

create function public.sales_lifecycle_report(p_dealer uuid,p_from date,p_to date)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare summary jsonb;open_positions jsonb;invoice_positions jsonb;credit_positions jsonb;
begin
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'cost') then raise exception 'commercial_not_allowed';end if;
  if p_from is null or p_to is null or p_from>p_to or p_to-p_from>3660 then raise exception 'invalid_report_period';end if;

  with current_agreements as (
    select distinct on (doc.deal_id)
      doc.deal_id,doc.id agreement_id,doc.number agreement_no,doc.created_at agreement_issued_at,
      coalesce((doc.snapshot->>'sale')::numeric,0) agreement_gross
    from public.deal_documents doc
    join public.deals d on d.id=doc.deal_id and d.dealer_id=doc.dealer_id
    where doc.dealer_id=p_dealer and doc.kind='agreement' and doc.status<>'void'
      and doc.deal_version=d.version and d.status not in ('completed','cancelled','reversed')
    order by doc.deal_id,doc.created_at desc
  ), invoice_totals as (
    select
      coalesce(sum((doc.snapshot->>'sale')::numeric) filter(where doc.created_at::date between p_from and p_to),0) invoice_gross,
      count(*) filter(where doc.created_at::date between p_from and p_to) invoice_count
    from public.deal_documents doc
    where doc.dealer_id=p_dealer and doc.kind='invoice' and doc.status<>'void'
  ), credit_totals as (
    select coalesce(sum(doc.gross_adjustment) filter(where doc.created_at::date between p_from and p_to),0) credit_gross,
      count(*) filter(where doc.created_at::date between p_from and p_to) credit_count
    from public.deal_documents doc
    where doc.dealer_id=p_dealer and doc.kind='credit_note' and doc.status<>'void'
  )
  select jsonb_build_object(
    'openDeals',(select count(*) from current_agreements),
    'openAgreementValue',(select coalesce(sum(agreement_gross),0) from current_agreements),
    'invoices',i.invoice_count,'invoicedGross',i.invoice_gross,
    'creditNotes',c.credit_count,'creditedGross',c.credit_gross,
    'netInvoicedRevenue',i.invoice_gross-c.credit_gross
  ) into summary from invoice_totals i cross join credit_totals c;

  with current_agreements as (
    select distinct on (doc.deal_id)
      d.id,d.deal_no,d.currency,d.customer_id,doc.id agreement_id,doc.number agreement_no,
      doc.created_at agreement_issued_at,coalesce((doc.snapshot->>'sale')::numeric,0) agreement_gross,
      coalesce((doc.snapshot->'figures'->>'balanceAgreement')::numeric,0) agreement_balance,
      coalesce(doc.snapshot->'vehicle'->>'label','—') vehicle
    from public.deal_documents doc
    join public.deals d on d.id=doc.deal_id and d.dealer_id=doc.dealer_id
    where doc.dealer_id=p_dealer and doc.kind='agreement' and doc.status<>'void'
      and doc.deal_version=d.version and d.status not in ('completed','cancelled','reversed')
    order by doc.deal_id,doc.created_at desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'dealNo',a.deal_no,'agreementId',a.agreement_id,'agreementNo',a.agreement_no,'issuedAt',a.agreement_issued_at,
    'customer',coalesce(c.name,'—'),'vehicle',a.vehicle,'currency',a.currency,
    'gross',a.agreement_gross,'outstanding',greatest(a.agreement_balance,0)
  ) order by a.agreement_issued_at desc),'[]'::jsonb) into open_positions
  from current_agreements a left join public.customers c on c.id=a.customer_id and c.dealer_id=p_dealer;

  with credits as (
    select original_document_id,coalesce(sum(gross_adjustment),0) credited
    from public.deal_documents
    where dealer_id=p_dealer and kind='credit_note' and status<>'void'
      and created_at::date between p_from and p_to
    group by original_document_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',doc.id,'dealId',d.id,'dealNo',d.deal_no,'invoiceNo',doc.number,'issuedAt',doc.created_at,
    'customer',coalesce(c.name,'—'),'vehicle',coalesce(doc.snapshot->'vehicle'->>'label','—'),
    'currency',d.currency,'gross',coalesce((doc.snapshot->>'sale')::numeric,0),
    'credited',coalesce(cr.credited,0),'net',coalesce((doc.snapshot->>'sale')::numeric,0)-coalesce(cr.credited,0)
  ) order by doc.created_at desc),'[]'::jsonb) into invoice_positions
  from public.deal_documents doc
  join public.deals d on d.id=doc.deal_id and d.dealer_id=doc.dealer_id
  left join public.customers c on c.id=d.customer_id and c.dealer_id=p_dealer
  left join credits cr on cr.original_document_id=doc.id
  where doc.dealer_id=p_dealer and doc.kind='invoice' and doc.status<>'void'
    and doc.created_at::date between p_from and p_to;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',doc.id,'dealId',d.id,'dealNo',d.deal_no,'creditNo',doc.number,'issuedAt',doc.created_at,
    'invoiceNo',original.number,'customer',coalesce(doc.snapshot->'customer'->>'name','—'),
    'vehicle',coalesce(doc.snapshot->'vehicle'->>'label','—'),'currency',d.currency,
    'gross',coalesce(doc.gross_adjustment,0),'reason',coalesce(doc.correction_reason,'—')
  ) order by doc.created_at desc),'[]'::jsonb) into credit_positions
  from public.deal_documents doc
  join public.deals d on d.id=doc.deal_id and d.dealer_id=doc.dealer_id
  left join public.deal_documents original on original.id=doc.original_document_id
  where doc.dealer_id=p_dealer and doc.kind='credit_note' and doc.status<>'void'
    and doc.created_at::date between p_from and p_to;

  return jsonb_build_object('summary',summary,'openPositions',open_positions,
    'invoicePositions',invoice_positions,'creditPositions',credit_positions,
    'period',jsonb_build_object('from',p_from,'to',p_to));
end $$;
revoke all on function public.sales_lifecycle_report(uuid,date,date) from public,anon;
grant execute on function public.sales_lifecycle_report(uuid,date,date) to authenticated;
