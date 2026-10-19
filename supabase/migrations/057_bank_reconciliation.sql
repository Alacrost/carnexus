-- Manual bank-statement reconciliation foundation. Statement lines may be
-- split across ledger movements; completed periods are immutable.

create table public.bank_accounts(
  id uuid primary key default gen_random_uuid(),dealer_id uuid not null references public.dealers(id) on delete cascade,
  name text not null check(char_length(trim(name)) between 2 and 100),currency text not null default 'EUR',
  account_reference text check(account_reference is null or char_length(account_reference)<=80),
  opening_balance numeric(14,2) not null default 0,active boolean not null default true,
  created_by uuid references auth.users(id),created_at timestamptz not null default now(),
  unique(dealer_id,name)
);
create table public.bank_reconciliations(
  id uuid primary key default gen_random_uuid(),dealer_id uuid not null references public.dealers(id) on delete cascade,
  account_id uuid not null references public.bank_accounts(id),period_start date not null,period_end date not null,
  opening_balance numeric(14,2) not null,statement_closing_balance numeric(14,2) not null,
  status text not null default 'draft' check(status in ('draft','completed')),
  created_by uuid references auth.users(id),completed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),completed_at timestamptz,
  check(period_start<=period_end),unique(account_id,period_start,period_end)
);
create index bank_reconciliations_period on public.bank_reconciliations(dealer_id,account_id,period_end desc);
create table public.bank_statement_lines(
  id uuid primary key default gen_random_uuid(),dealer_id uuid not null references public.dealers(id) on delete cascade,
  reconciliation_id uuid not null references public.bank_reconciliations(id) on delete cascade,
  transaction_date date not null,description text not null check(char_length(trim(description)) between 1 and 300),
  statement_reference text check(statement_reference is null or char_length(statement_reference)<=120),
  amount numeric(14,2) not null check(amount<>0),created_by uuid references auth.users(id),created_at timestamptz not null default now()
);
create index bank_statement_lines_reconciliation on public.bank_statement_lines(reconciliation_id,transaction_date,id);
create table public.bank_matches(
  id uuid primary key default gen_random_uuid(),dealer_id uuid not null references public.dealers(id) on delete cascade,
  statement_line_id uuid not null references public.bank_statement_lines(id) on delete cascade,
  source_type text not null check(source_type in ('sale_payment','purchase_payment')),
  source_id uuid not null,amount numeric(14,2) not null check(amount>0),
  matched_by uuid references auth.users(id),created_at timestamptz not null default now(),
  unique(statement_line_id,source_type,source_id)
);
create index bank_matches_source on public.bank_matches(dealer_id,source_type,source_id);
create table public.bank_requests(
  dealer_id uuid references public.dealers(id),request_id uuid,command text,input jsonb,result jsonb,
  primary key(dealer_id,request_id)
);

alter table public.bank_accounts enable row level security;alter table public.bank_reconciliations enable row level security;
alter table public.bank_statement_lines enable row level security;alter table public.bank_matches enable row level security;alter table public.bank_requests enable row level security;
revoke all on public.bank_accounts,public.bank_reconciliations,public.bank_statement_lines,public.bank_matches,public.bank_requests from anon,authenticated;
grant select on public.bank_accounts,public.bank_reconciliations,public.bank_statement_lines,public.bank_matches to authenticated;
create policy bank_accounts_read on public.bank_accounts for select using(public.commercial_allowed(dealer_id,'cost'));
create policy bank_reconciliations_read on public.bank_reconciliations for select using(public.commercial_allowed(dealer_id,'cost'));
create policy bank_statement_lines_read on public.bank_statement_lines for select using(public.commercial_allowed(dealer_id,'cost'));
create policy bank_matches_read on public.bank_matches for select using(public.commercial_allowed(dealer_id,'cost'));

create function public.bank_command(p_dealer uuid,p_command text,p_id uuid,p_input jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  cached public.bank_requests;account public.bank_accounts;recon public.bank_reconciliations;
  line public.bank_statement_lines;result jsonb;amount numeric;source_amount numeric;source_used numeric;
  line_used numeric;source_direction integer;v_source_type text;v_source_id uuid;match_id uuid;
begin
  if auth.uid() is null or coalesce(public.user_role_in(p_dealer)::text,'') not in ('owner','admin','accountant')
    or not public.commercial_allowed(p_dealer,'cost') then raise exception 'bank_not_allowed';end if;
  if p_request is null or p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>12000 then raise exception 'invalid_request';end if;
  perform 1 from public.dealers where id=p_dealer for update;
  select * into cached from public.bank_requests where dealer_id=p_dealer and request_id=p_request;
  if found then
    if cached.command<>p_command or cached.input<>jsonb_build_object('id',p_id,'data',p_input) then raise exception 'request_reused';end if;
    return cached.result;
  end if;
  if p_command='create_account' then
    if char_length(trim(p_input->>'name')) not between 2 and 100 or coalesce(p_input->>'currency','EUR') !~ '^[A-Z]{3}$' then raise exception 'invalid_bank_account';end if;
    insert into public.bank_accounts(dealer_id,name,currency,account_reference,opening_balance,created_by)
    values(p_dealer,trim(p_input->>'name'),coalesce(p_input->>'currency','EUR'),nullif(trim(p_input->>'reference'),''),coalesce((p_input->>'openingBalance')::numeric,0),auth.uid())
    returning * into account;result:=jsonb_build_object('id',account.id);
  elsif p_command='start_reconciliation' then
    select * into account from public.bank_accounts where id=p_id and dealer_id=p_dealer and active for update;
    if not found then raise exception 'bank_account_missing';end if;
    if nullif(p_input->>'periodStart','')::date is null or nullif(p_input->>'periodEnd','')::date is null
      or (p_input->>'periodStart')::date>(p_input->>'periodEnd')::date then raise exception 'invalid_reconciliation_period';end if;
    if exists(select 1 from public.bank_reconciliations where account_id=account.id and daterange(period_start,period_end,'[]') && daterange((p_input->>'periodStart')::date,(p_input->>'periodEnd')::date,'[]')) then raise exception 'reconciliation_period_overlap';end if;
    insert into public.bank_reconciliations(dealer_id,account_id,period_start,period_end,opening_balance,statement_closing_balance,created_by)
    values(p_dealer,account.id,(p_input->>'periodStart')::date,(p_input->>'periodEnd')::date,(p_input->>'openingBalance')::numeric,(p_input->>'closingBalance')::numeric,auth.uid()) returning * into recon;
    result:=jsonb_build_object('id',recon.id);
  elsif p_command='add_line' then
    select * into recon from public.bank_reconciliations where id=p_id and dealer_id=p_dealer for update;
    amount:=(p_input->>'amount')::numeric;
    if not found or recon.status<>'draft' then raise exception 'reconciliation_closed_or_missing';end if;
    if nullif(p_input->>'transactionDate','')::date not between recon.period_start and recon.period_end or amount is null or amount=0 or amount<>round(amount,2)
      or char_length(trim(p_input->>'description')) not between 1 and 300 then raise exception 'invalid_statement_line';end if;
    insert into public.bank_statement_lines(dealer_id,reconciliation_id,transaction_date,description,statement_reference,amount,created_by)
    values(p_dealer,recon.id,(p_input->>'transactionDate')::date,trim(p_input->>'description'),nullif(trim(p_input->>'reference'),''),amount,auth.uid()) returning * into line;
    result:=jsonb_build_object('id',line.id);
  elsif p_command='match' then
    select * into line from public.bank_statement_lines where id=p_id and dealer_id=p_dealer for update;
    if not found then raise exception 'statement_line_missing';end if;
    select * into recon from public.bank_reconciliations where id=line.reconciliation_id for update;
    if recon.status<>'draft' then raise exception 'reconciliation_closed_or_missing';end if;
    v_source_type:=p_input->>'sourceType';v_source_id:=(p_input->>'sourceId')::uuid;amount:=(p_input->>'amount')::numeric;
    if amount is null or amount<=0 or amount<>round(amount,2) or v_source_type not in ('sale_payment','purchase_payment') then raise exception 'invalid_bank_match';end if;
    if v_source_type='sale_payment' then
      select p.amount,case when p.kind in ('refund','receipt_reversal') then -1 else 1 end into source_amount,source_direction
      from public.payments p where p.id=v_source_id and p.dealer_id=p_dealer;
    else
      select p.amount,case when p.entry_kind='reversal' then 1 else -1 end into source_amount,source_direction
      from public.po_payments p where p.id=v_source_id and p.dealer_id=p_dealer;
    end if;
    if source_amount is null then raise exception 'bank_source_missing';end if;
    if sign(line.amount)<>source_direction then raise exception 'bank_match_direction_mismatch';end if;
    select coalesce(sum(m.amount),0) into line_used from public.bank_matches m where statement_line_id=line.id;
    select coalesce(sum(m.amount),0) into source_used from public.bank_matches m where dealer_id=p_dealer and source_type=v_source_type and source_id=v_source_id;
    if line_used+amount>abs(line.amount) or source_used+amount>source_amount then raise exception 'bank_match_exceeds_available';end if;
    insert into public.bank_matches(dealer_id,statement_line_id,source_type,source_id,amount,matched_by)
    values(p_dealer,line.id,v_source_type,v_source_id,amount,auth.uid()) returning id into match_id;
    result:=jsonb_build_object('id',match_id);
  elsif p_command='unmatch' then
    select l.* into line from public.bank_matches m join public.bank_statement_lines l on l.id=m.statement_line_id join public.bank_reconciliations r on r.id=l.reconciliation_id
      where m.id=p_id and m.dealer_id=p_dealer and r.status='draft' for update of l;
    if not found then raise exception 'bank_match_missing_or_closed';end if;
    delete from public.bank_matches where id=p_id and dealer_id=p_dealer;result:=jsonb_build_object('id',p_id,'removed',true);
  elsif p_command='complete' then
    select * into recon from public.bank_reconciliations where id=p_id and dealer_id=p_dealer for update;
    if not found or recon.status<>'draft' then raise exception 'reconciliation_closed_or_missing';end if;
    if recon.opening_balance+coalesce((select sum(l.amount) from public.bank_statement_lines l where l.reconciliation_id=recon.id),0)<>recon.statement_closing_balance then raise exception 'bank_closing_balance_mismatch';end if;
    if exists(select 1 from public.bank_statement_lines l where l.reconciliation_id=recon.id and abs(l.amount)<>(select coalesce(sum(m.amount),0) from public.bank_matches m where m.statement_line_id=l.id)) then raise exception 'bank_unmatched_lines';end if;
    update public.bank_reconciliations set status='completed',completed_by=auth.uid(),completed_at=now() where id=recon.id;
    insert into public.audit_logs(dealer_id,user_id,action,entity,entity_id,meta) values(p_dealer,auth.uid(),'bank_reconciliation_completed','bank_reconciliation',recon.id,jsonb_build_object('account_id',recon.account_id,'period_start',recon.period_start,'period_end',recon.period_end,'closing_balance',recon.statement_closing_balance));
    result:=jsonb_build_object('id',recon.id,'status','completed');
  else raise exception 'invalid_bank_command';end if;
  insert into public.bank_requests values(p_dealer,p_request,p_command,jsonb_build_object('id',p_id,'data',p_input),result);return result;
end $$;
revoke all on function public.bank_command(uuid,text,uuid,jsonb,uuid) from public,anon;
grant execute on function public.bank_command(uuid,text,uuid,jsonb,uuid) to authenticated;

create function public.bank_reconciliation_overview(p_dealer uuid,p_reconciliation uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare accounts jsonb;reconciliations jsonb;lines jsonb;candidates jsonb;
begin
  if auth.uid() is null or coalesce(public.user_role_in(p_dealer)::text,'') not in ('owner','admin','accountant') or not public.commercial_allowed(p_dealer,'cost') then raise exception 'bank_not_allowed';end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'currency',a.currency,'reference',a.account_reference,'openingBalance',a.opening_balance,'active',a.active) order by a.name),'[]') into accounts from public.bank_accounts a where a.dealer_id=p_dealer;
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'accountId',r.account_id,'account',a.name,'periodStart',r.period_start,'periodEnd',r.period_end,'openingBalance',r.opening_balance,'closingBalance',r.statement_closing_balance,'status',r.status,'completedAt',r.completed_at) order by r.period_end desc),'[]') into reconciliations from public.bank_reconciliations r join public.bank_accounts a on a.id=r.account_id where r.dealer_id=p_dealer;
  select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'date',l.transaction_date,'description',l.description,'reference',l.statement_reference,'amount',l.amount,'matched',coalesce(m.matched,0),'unmatched',abs(l.amount)-coalesce(m.matched,0),'matches',coalesce(m.items,'[]'::jsonb)) order by l.transaction_date,l.id),'[]') into lines
  from public.bank_statement_lines l left join lateral(select sum(x.amount) matched,jsonb_agg(jsonb_build_object('id',x.id,'sourceType',x.source_type,'sourceId',x.source_id,'amount',x.amount)) items from public.bank_matches x where x.statement_line_id=l.id) m on true
  where p_reconciliation is not null and l.reconciliation_id=p_reconciliation and l.dealer_id=p_dealer;
  select coalesce(jsonb_agg(x order by x->>'date',x->>'label'),'[]') into candidates from (
    select jsonb_build_object('sourceType','sale_payment','id',p.id,'date',p.paid_on,'direction',case when p.kind in ('refund','receipt_reversal') then -1 else 1 end,'amount',p.amount,'matched',coalesce(m.used,0),'available',p.amount-coalesce(m.used,0),'label',d.deal_no||' · '||c.name||' · '||replace(p.kind,'_',' ')) x
    from public.payments p join public.deals d on d.id=p.deal_id left join public.customers c on c.id=d.customer_id left join lateral(select sum(amount) used from public.bank_matches where dealer_id=p_dealer and source_type='sale_payment' and source_id=p.id)m on true where p.dealer_id=p_dealer and p.amount>coalesce(m.used,0)
    union all
    select jsonb_build_object('sourceType','purchase_payment','id',p.id,'date',p.paid_on,'direction',case when p.entry_kind='reversal' then 1 else -1 end,'amount',p.amount,'matched',coalesce(m.used,0),'available',p.amount-coalesce(m.used,0),'label',po.po_no||' · '||c.name||' · '||p.recipient) x
    from public.po_payments p join public.purchase_orders po on po.id=p.po_id left join public.customers c on c.id=po.vendor_id left join lateral(select sum(amount) used from public.bank_matches where dealer_id=p_dealer and source_type='purchase_payment' and source_id=p.id)m on true where p.dealer_id=p_dealer and p.amount>coalesce(m.used,0)
  ) q;
  return jsonb_build_object('accounts',accounts,'reconciliations',reconciliations,'lines',lines,'candidates',candidates);
end $$;
revoke all on function public.bank_reconciliation_overview(uuid,uuid) from public,anon;
grant execute on function public.bank_reconciliation_overview(uuid,uuid) to authenticated;
