-- Management ledger foundation. Entries are derived from immutable commercial
-- sources so the operational subledgers and accounting views cannot drift.

create table public.nominal_accounts(
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  code text not null, name text not null, category text not null
    check(category in ('asset','liability','equity','income','expense')),
  system_key text not null, active boolean not null default true,
  primary key(dealer_id,code),unique(dealer_id,system_key)
);
insert into public.nominal_accounts(dealer_id,code,name,category,system_key)
select d.id,x.code,x.name,x.category,x.system_key from public.dealers d cross join (values
  ('1000','Bank and cash','asset','bank'),('1100','Trade debtors','asset','receivables'),
  ('1200','Vehicle inventory','asset','inventory'),('2100','Trade creditors','liability','payables'),
  ('2200','VAT control','liability','vat'),('4000','Vehicle and add-on sales','income','sales'),
  ('5000','Vehicle cost of sales','expense','cost_of_sales')
) x(code,name,category,system_key);

create function public.seed_nominal_accounts() returns trigger language plpgsql set search_path=public as $$
begin
  insert into public.nominal_accounts(dealer_id,code,name,category,system_key) values
    (new.id,'1000','Bank and cash','asset','bank'),(new.id,'1100','Trade debtors','asset','receivables'),
    (new.id,'1200','Vehicle inventory','asset','inventory'),(new.id,'2100','Trade creditors','liability','payables'),
    (new.id,'2200','VAT control','liability','vat'),(new.id,'4000','Vehicle and add-on sales','income','sales'),
    (new.id,'5000','Vehicle cost of sales','expense','cost_of_sales');
  return new;
end $$;
create trigger dealers_seed_nominal_accounts after insert on public.dealers
for each row execute function public.seed_nominal_accounts();

create table public.accounting_periods(
  id uuid primary key default gen_random_uuid(),dealer_id uuid not null references public.dealers(id) on delete cascade,
  period_start date not null,period_end date not null,status text not null default 'open' check(status in ('open','closed')),
  label text not null check(char_length(trim(label)) between 2 and 80),
  closed_at timestamptz,closed_by uuid references auth.users(id),close_snapshot jsonb,
  reopened_at timestamptz,reopened_by uuid references auth.users(id),reopen_reason text,
  created_at timestamptz not null default now(),created_by uuid references auth.users(id),
  check(period_start<=period_end),unique(dealer_id,period_start,period_end)
);
create index accounting_periods_dates on public.accounting_periods(dealer_id,period_start,period_end);
create table public.accounting_requests(
  dealer_id uuid references public.dealers(id),request_id uuid,command text,input jsonb,result jsonb,
  primary key(dealer_id,request_id)
);
alter table public.nominal_accounts enable row level security;
alter table public.accounting_periods enable row level security;
alter table public.accounting_requests enable row level security;
revoke all on public.nominal_accounts,public.accounting_periods,public.accounting_requests from anon,authenticated;
grant select on public.nominal_accounts,public.accounting_periods to authenticated;
create policy nominal_accounts_read on public.nominal_accounts for select using(public.commercial_allowed(dealer_id,'cost'));
create policy accounting_periods_read on public.accounting_periods for select using(public.commercial_allowed(dealer_id,'cost'));

create function public.ledger_entries(p_dealer uuid,p_from date,p_to date)
returns table(entry_date date,source_type text,source_id uuid,reference text,account_code text,account_name text,debit numeric,credit numeric,description text)
language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'cost') then raise exception 'accounting_not_allowed';end if;
  if p_from is null or p_to is null or p_from>p_to or p_to-p_from>3660 then raise exception 'invalid_report_period';end if;
  return query
  with invoices as (
    select d.id,coalesce(nullif(d.snapshot->>'date','')::date,d.created_at::date) dt,d.number ref,
      coalesce((d.snapshot->>'sale')::numeric,0) gross,coalesce((d.snapshot->'figures'->>'vat')::numeric,0) vat,
      coalesce((select sum(pl.net) from public.deal_orders so join public.vehicles v on v.id=so.vehicle_id join public.po_lines pl on pl.po_id=v.originating_po_id where so.deal_id=d.deal_id and so.kind='sale'),0) cost,
      coalesce(d.snapshot->'vehicle'->>'label','Sale invoice') descr
    from public.deal_documents d where d.dealer_id=p_dealer and d.kind='invoice' and d.status<>'void'
  ), credits as (
    select d.id,coalesce(nullif(d.snapshot->>'date','')::date,d.created_at::date) dt,d.number ref,
      coalesce(d.gross_adjustment,0) gross,coalesce((d.snapshot->>'vat_credit')::numeric,0) vat,
      case when coalesce(d.gross_adjustment,0)>=coalesce((original.snapshot->>'sale')::numeric,0)
        then coalesce((select sum(pl.net) from public.deal_orders so join public.vehicles v on v.id=so.vehicle_id join public.po_lines pl on pl.po_id=v.originating_po_id where so.deal_id=d.deal_id and so.kind='sale'),0) else 0 end cost,
      coalesce(d.snapshot->'vehicle'->>'label','Credit note') descr
    from public.deal_documents d left join public.deal_documents original on original.id=d.original_document_id where d.dealer_id=p_dealer and d.kind='credit_note' and d.status<>'void'
  ), purchases as (
    select po.id,coalesce(po.purchase_date,po.created_at::date) dt,po.po_no ref,coalesce(sum(l.net),0) net,
      coalesce(sum(l.vat),0) vat,coalesce(sum(l.gross),0) gross,'Vehicle purchase · '||po.po_no descr
    from public.purchase_orders po join public.po_lines l on l.po_id=po.id
    where po.dealer_id=p_dealer and po.status<>'cancelled' and po.purchase_amount_known
    group by po.id
  ), entries as (
    select i.dt,i.id,'invoice'::text st,i.ref,'1100'::text code,i.gross debit,0::numeric credit,i.descr from invoices i
    union all select i.dt,i.id,'invoice',i.ref,'4000',0,i.gross-i.vat,i.descr from invoices i
    union all select i.dt,i.id,'invoice',i.ref,'2200',0,i.vat,i.descr from invoices i where i.vat<>0
    union all select i.dt,i.id,'invoice',i.ref,'5000',i.cost,0,i.descr from invoices i where i.cost<>0
    union all select i.dt,i.id,'invoice',i.ref,'1200',0,i.cost,i.descr from invoices i where i.cost<>0
    union all select c.dt,c.id,'credit_note',c.ref,'1100',0,c.gross,c.descr from credits c
    union all select c.dt,c.id,'credit_note',c.ref,'4000',c.gross-c.vat,0,c.descr from credits c
    union all select c.dt,c.id,'credit_note',c.ref,'2200',c.vat,0,c.descr from credits c where c.vat<>0
    union all select c.dt,c.id,'credit_note',c.ref,'5000',0,c.cost,c.descr from credits c where c.cost<>0
    union all select c.dt,c.id,'credit_note',c.ref,'1200',c.cost,0,c.descr from credits c where c.cost<>0
    union all select p.dt,p.id,'purchase_order',p.ref,'1200',p.net,0,p.descr from purchases p
    union all select p.dt,p.id,'purchase_order',p.ref,'2200',p.vat,0,p.descr from purchases p where p.vat<>0
    union all select p.dt,p.id,'purchase_order',p.ref,'2100',0,p.gross,p.descr from purchases p
    union all
      select coalesce(x.paid_on,x.created_at::date),x.id,'sale_payment',coalesce(x.reference,d.deal_no),
        case when x.kind in ('refund','receipt_reversal') then '1100' else '1000' end,
        x.amount,0,'Sale payment · '||d.deal_no
      from public.payments x join public.deals d on d.id=x.deal_id
      where x.dealer_id=p_dealer and x.kind<>'trade_allowance'
    union all
      select coalesce(x.paid_on,x.created_at::date),x.id,'sale_payment',coalesce(x.reference,d.deal_no),
        case when x.kind in ('refund','receipt_reversal') then '1000' else '1100' end,
        0,x.amount,'Sale payment · '||d.deal_no
      from public.payments x join public.deals d on d.id=x.deal_id
      where x.dealer_id=p_dealer and x.kind<>'trade_allowance'
    union all
      select coalesce(x.paid_on,x.created_at::date),x.id,'purchase_payment',coalesce(x.reference,po.po_no),
        case when x.entry_kind='reversal' then '1000' else '2100' end,
        x.amount,0,'Purchase payment · '||po.po_no
      from public.po_payments x join public.purchase_orders po on po.id=x.po_id
      where x.dealer_id=p_dealer and x.entry_kind<>'carry_forward'
    union all
      select coalesce(x.paid_on,x.created_at::date),x.id,'purchase_payment',coalesce(x.reference,po.po_no),
        case when x.entry_kind='reversal' then '2100' else '1000' end,
        0,x.amount,'Purchase payment · '||po.po_no
      from public.po_payments x join public.purchase_orders po on po.id=x.po_id
      where x.dealer_id=p_dealer and x.entry_kind<>'carry_forward'
  )
  select e.dt,e.st,e.id,e.ref,e.code,a.name,e.debit,e.credit,e.descr
  from entries e join public.nominal_accounts a on a.dealer_id=p_dealer and a.code=e.code
  where e.dt between p_from and p_to order by e.dt,e.st,e.id,e.code;
end $$;
revoke all on function public.ledger_entries(uuid,date,date) from public,anon;
grant execute on function public.ledger_entries(uuid,date,date) to authenticated;

create function public.accounting_overview(p_dealer uuid,p_from date,p_to date)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare trial jsonb;profit jsonb;debtors jsonb;creditors jsonb;vat jsonb;exceptions jsonb;periods jsonb;
begin
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'cost') then raise exception 'accounting_not_allowed';end if;
  if p_from is null or p_to is null or p_from>p_to or p_to-p_from>3660 then raise exception 'invalid_report_period';end if;
  select coalesce(jsonb_agg(jsonb_build_object('code',q.account_code,'name',q.account_name,'debit',q.debit,'credit',q.credit,'balance',q.debit-q.credit) order by q.account_code),'[]') into trial
  from (select account_code,account_name,sum(debit) debit,sum(credit) credit from public.ledger_entries(p_dealer,p_from,p_to) group by account_code,account_name) q;
  select jsonb_build_object('revenue',coalesce(sum(credit-debit) filter(where account_code='4000'),0),'costOfSales',coalesce(sum(debit-credit) filter(where account_code='5000'),0),'grossProfit',coalesce(sum(credit-debit) filter(where account_code='4000'),0)-coalesce(sum(debit-credit) filter(where account_code='5000'),0)) into profit from public.ledger_entries(p_dealer,p_from,p_to);
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'reference',r.invoiceNo,'party',r.customer,'date',r.issuedAt,'amount',r.outstanding,'ageDays',greatest(current_date-left(r.issuedAt,10)::date,0)) order by r.issuedAt),'[]') into debtors
  from (select x->>'id' id,x->>'invoiceNo' invoiceNo,x->>'customer' customer,x->>'issuedAt' issuedAt,(x->>'outstanding')::numeric outstanding from jsonb_array_elements(public.sales_lifecycle_report(p_dealer,current_date-3650,current_date)->'invoicePositions') x) r where r.outstanding>0;
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'reference',r.po_no,'party',r.vendor,'date',r.purchase_date,'dueOn',r.due_on,'amount',r.to_be_paid,'ageDays',greatest(current_date-coalesce(r.due_on,r.purchase_date,current_date),0)) order by r.due_on nulls last),'[]') into creditors from public.purchase_payable_rows(p_dealer) r where r.to_be_paid>0;
  select jsonb_build_object('T1',coalesce(sum(credit-debit) filter(where account_code='2200' and source_type in ('invoice','credit_note')),0),'T2',coalesce(sum(debit-credit) filter(where account_code='2200' and source_type='purchase_order'),0)) into vat from public.ledger_entries(p_dealer,p_from,p_to);
  vat:=vat||jsonb_build_object('T3',greatest((vat->>'T1')::numeric-(vat->>'T2')::numeric,0),'T4',greatest((vat->>'T2')::numeric-(vat->>'T1')::numeric,0),'status','draft_review_required');
  select coalesce(jsonb_agg(x),'[]') into exceptions from (
    select jsonb_build_object('kind','unknown_purchase_amount','id',po.id,'reference',po.po_no,'message','Purchase amount is required before accounting close.') x from public.purchase_orders po where po.dealer_id=p_dealer and po.status<>'cancelled' and not po.purchase_amount_known and coalesce(po.purchase_date,po.created_at::date) between p_from and p_to
    union all select jsonb_build_object('kind','pending_bank_instrument','id',p.id,'reference',p.reference,'message','Cheque or draft is not bank-cleared.') from public.payments p where p.dealer_id=p_dealer and p.clearance_status='pending' and p.paid_on between p_from and p_to
    union all select jsonb_build_object('kind','margin_vat_review','id',d.id,'reference',d.number,'message','Margin-scheme VAT requires vehicle purchase-price review before filing.') from public.deal_documents d where d.dealer_id=p_dealer and d.kind='invoice' and d.status<>'void' and d.snapshot->>'scheme'='margin' and nullif(d.snapshot->>'date','')::date between p_from and p_to
  ) e;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'label',p.label,'start',p.period_start,'end',p.period_end,'status',p.status,'closedAt',p.closed_at) order by p.period_end desc),'[]') into periods from public.accounting_periods p where p.dealer_id=p_dealer;
  return jsonb_build_object('trialBalance',trial,'profitAndLoss',profit,'agedDebtors',debtors,'agedCreditors',creditors,'vat3Draft',vat,'exceptions',exceptions,'periods',periods);
end $$;
revoke all on function public.accounting_overview(uuid,date,date) from public,anon;
grant execute on function public.accounting_overview(uuid,date,date) to authenticated;

create function public.accounting_command(p_dealer uuid,p_command text,p_id uuid,p_input jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare cached public.accounting_requests;period public.accounting_periods;result jsonb;overview jsonb;reason text;
begin
  if auth.uid() is null or coalesce(public.user_role_in(p_dealer)::text,'') not in ('owner','admin','accountant') or not public.commercial_allowed(p_dealer,'cost') then raise exception 'accounting_not_allowed';end if;
  if p_request is null or p_input is null or jsonb_typeof(p_input)<>'object' then raise exception 'invalid_request';end if;
  perform 1 from public.dealers where id=p_dealer for update;
  select * into cached from public.accounting_requests where dealer_id=p_dealer and request_id=p_request;
  if found then if cached.command<>p_command or cached.input<>jsonb_build_object('id',p_id,'data',p_input) then raise exception 'request_reused';end if;return cached.result;end if;
  if p_command='create_period' then
    if char_length(trim(p_input->>'label')) not between 2 and 80 or nullif(p_input->>'periodStart','')::date is null or nullif(p_input->>'periodEnd','')::date is null or (p_input->>'periodStart')::date>(p_input->>'periodEnd')::date then raise exception 'invalid_accounting_period';end if;
    if exists(select 1 from public.accounting_periods where dealer_id=p_dealer and daterange(period_start,period_end,'[]')&&daterange((p_input->>'periodStart')::date,(p_input->>'periodEnd')::date,'[]')) then raise exception 'accounting_period_overlap';end if;
    insert into public.accounting_periods(dealer_id,period_start,period_end,label,created_by) values(p_dealer,(p_input->>'periodStart')::date,(p_input->>'periodEnd')::date,trim(p_input->>'label'),auth.uid()) returning * into period;
    result:=jsonb_build_object('id',period.id,'status',period.status);
  elsif p_command='close_period' then
    select * into period from public.accounting_periods where id=p_id and dealer_id=p_dealer for update;
    if not found or period.status<>'open' then raise exception 'accounting_period_closed_or_missing';end if;
    overview:=public.accounting_overview(p_dealer,period.period_start,period.period_end);
    if jsonb_array_length(overview->'exceptions')>0 then raise exception 'accounting_close_exceptions';end if;
    if (select coalesce(sum(debit-credit),0) from public.ledger_entries(p_dealer,period.period_start,period.period_end))<>0 then raise exception 'trial_balance_not_balanced';end if;
    update public.accounting_periods set status='closed',closed_at=now(),closed_by=auth.uid(),close_snapshot=overview where id=period.id;
    insert into public.audit_logs(dealer_id,user_id,action,entity,entity_id,meta) values(p_dealer,auth.uid(),'accounting_period_closed','accounting_period',period.id,jsonb_build_object('start',period.period_start,'end',period.period_end));
    result:=jsonb_build_object('id',period.id,'status','closed');
  elsif p_command='reopen_period' then
    if public.user_role_in(p_dealer)::text<>'owner' then raise exception 'accounting_reopen_owner_only';end if;
    reason:=trim(p_input->>'reason');if char_length(reason) not between 5 and 500 then raise exception 'accounting_reopen_reason_required';end if;
    select * into period from public.accounting_periods where id=p_id and dealer_id=p_dealer for update;
    if not found or period.status<>'closed' then raise exception 'accounting_period_open_or_missing';end if;
    update public.accounting_periods set status='open',reopened_at=now(),reopened_by=auth.uid(),reopen_reason=reason where id=period.id;
    insert into public.audit_logs(dealer_id,user_id,action,entity,entity_id,meta) values(p_dealer,auth.uid(),'accounting_period_reopened','accounting_period',period.id,jsonb_build_object('reason',reason));
    result:=jsonb_build_object('id',period.id,'status','open');
  else raise exception 'invalid_accounting_command';end if;
  insert into public.accounting_requests values(p_dealer,p_request,p_command,jsonb_build_object('id',p_id,'data',p_input),result);return result;
end $$;
revoke all on function public.accounting_command(uuid,text,uuid,jsonb,uuid) from public,anon;
grant execute on function public.accounting_command(uuid,text,uuid,jsonb,uuid) to authenticated;

create function public.guard_closed_accounting_period() returns trigger language plpgsql set search_path=public as $$
declare d uuid;effective date;row_data jsonb;
begin
  row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  d:=(row_data->>'dealer_id')::uuid;
  effective:=case tg_table_name
    when 'payments' then coalesce(nullif(row_data->>'paid_on','')::date,(row_data->>'created_at')::timestamptz::date)
    when 'po_payments' then coalesce(nullif(row_data->>'paid_on','')::date,(row_data->>'created_at')::timestamptz::date)
    when 'purchase_orders' then coalesce(nullif(row_data->>'purchase_date','')::date,(row_data->>'created_at')::timestamptz::date)
    when 'deal_documents' then coalesce(nullif(row_data->'snapshot'->>'date','')::date,(row_data->>'created_at')::timestamptz::date)
  end;
  if exists(select 1 from public.accounting_periods p where p.dealer_id=d and p.status='closed' and effective between p.period_start and p.period_end) then raise exception 'accounting_period_closed';end if;
  return coalesce(new,old);
end $$;
create trigger payments_closed_period before insert or update or delete on public.payments for each row execute function public.guard_closed_accounting_period();
create trigger po_payments_closed_period before insert or update or delete on public.po_payments for each row execute function public.guard_closed_accounting_period();
create trigger purchase_orders_closed_period before update or delete on public.purchase_orders for each row execute function public.guard_closed_accounting_period();
create trigger deal_documents_closed_period before insert or update or delete on public.deal_documents for each row execute function public.guard_closed_accounting_period();
