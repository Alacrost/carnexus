-- Reviewed manual journals supplement, but never overwrite, commercial sources.

insert into public.nominal_accounts(dealer_id,code,name,category,system_key)
select d.id,x.code,x.name,x.category,x.system_key from public.dealers d cross join (values
 ('6000','General operating expense','expense','general_expense'),('6100','Bank charges','expense','bank_charges'),
 ('9990','Suspense and review','asset','suspense')
)x(code,name,category,system_key) on conflict do nothing;
create or replace function public.seed_nominal_accounts() returns trigger language plpgsql set search_path=public as $$
begin
  insert into public.nominal_accounts(dealer_id,code,name,category,system_key) values
    (new.id,'1000','Bank and cash','asset','bank'),(new.id,'1100','Trade debtors','asset','receivables'),
    (new.id,'1200','Vehicle inventory','asset','inventory'),(new.id,'2100','Trade creditors','liability','payables'),
    (new.id,'2200','VAT control','liability','vat'),(new.id,'4000','Vehicle and add-on sales','income','sales'),
    (new.id,'5000','Vehicle cost of sales','expense','cost_of_sales'),(new.id,'6000','General operating expense','expense','general_expense'),
    (new.id,'6100','Bank charges','expense','bank_charges'),(new.id,'9990','Suspense and review','asset','suspense');
  return new;
end $$;

create table public.accounting_journals(
 id uuid primary key default gen_random_uuid(),dealer_id uuid not null references public.dealers(id) on delete cascade,
 effective_date date not null,reference text not null check(char_length(trim(reference)) between 1 and 80),
 description text not null check(char_length(trim(description)) between 3 and 500),status text not null default 'draft' check(status in ('draft','posted','reversed')),
 created_by uuid references auth.users(id),created_at timestamptz not null default now(),
 posted_by uuid references auth.users(id),posted_at timestamptz,reversed_by uuid references auth.users(id),reversed_at timestamptz,
 reversal_of uuid references public.accounting_journals(id),reversal_reason text,
 unique(dealer_id,reference)
);
create table public.accounting_journal_lines(
 id uuid primary key default gen_random_uuid(),dealer_id uuid not null references public.dealers(id) on delete cascade,
 journal_id uuid not null references public.accounting_journals(id) on delete cascade,position integer not null,
 account_code text not null,description text,debit numeric(14,2) not null default 0,credit numeric(14,2) not null default 0,
 check((debit>0 and credit=0) or (credit>0 and debit=0)),unique(journal_id,position),
 foreign key(dealer_id,account_code) references public.nominal_accounts(dealer_id,code)
);
alter table public.accounting_journals enable row level security;alter table public.accounting_journal_lines enable row level security;
revoke all on public.accounting_journals,public.accounting_journal_lines from anon,authenticated;
grant select on public.accounting_journals,public.accounting_journal_lines to authenticated;
create policy accounting_journals_read on public.accounting_journals for select using(public.commercial_allowed(dealer_id,'cost'));
create policy accounting_journal_lines_read on public.accounting_journal_lines for select using(public.commercial_allowed(dealer_id,'cost'));

alter function public.ledger_entries(uuid,date,date) rename to ledger_entries_v060;
revoke all on function public.ledger_entries_v060(uuid,date,date) from public,anon,authenticated;
create function public.ledger_entries(p_dealer uuid,p_from date,p_to date)
returns table(entry_date date,source_type text,source_id uuid,reference text,account_code text,account_name text,debit numeric,credit numeric,description text)
language plpgsql stable security definer set search_path=public as $$
begin
 return query select * from public.ledger_entries_v060(p_dealer,p_from,p_to)
 union all
 select j.effective_date,'manual_journal',j.id,j.reference,l.account_code,a.name,l.debit,l.credit,coalesce(l.description,j.description)
 from public.accounting_journals j join public.accounting_journal_lines l on l.journal_id=j.id join public.nominal_accounts a on a.dealer_id=j.dealer_id and a.code=l.account_code
 where j.dealer_id=p_dealer and j.status in ('posted','reversed') and j.effective_date between p_from and p_to
 order by 1,2,3,5;
end $$;
revoke all on function public.ledger_entries(uuid,date,date) from public,anon;
grant execute on function public.ledger_entries(uuid,date,date) to authenticated;

alter function public.accounting_command(uuid,text,uuid,jsonb,uuid) rename to accounting_command_v060;
revoke all on function public.accounting_command_v060(uuid,text,uuid,jsonb,uuid) from public,anon,authenticated;
create function public.accounting_command(p_dealer uuid,p_command text,p_id uuid,p_input jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare cached public.accounting_requests;j public.accounting_journals;item jsonb;lines jsonb;debits numeric:=0;credits numeric:=0;pos integer:=0;result jsonb;reason text;reversal_id uuid;
begin
 if p_command not in ('create_journal','post_journal','reverse_journal') then return public.accounting_command_v060(p_dealer,p_command,p_id,p_input,p_request);end if;
 if auth.uid() is null or coalesce(public.user_role_in(p_dealer)::text,'') not in ('owner','admin','accountant') or not public.commercial_allowed(p_dealer,'cost') then raise exception 'accounting_not_allowed';end if;
 if p_request is null or p_input is null or jsonb_typeof(p_input)<>'object' then raise exception 'invalid_request';end if;
 perform 1 from public.dealers where id=p_dealer for update;
 select * into cached from public.accounting_requests where dealer_id=p_dealer and request_id=p_request;
 if found then if cached.command<>p_command or cached.input<>jsonb_build_object('id',p_id,'data',p_input) then raise exception 'request_reused';end if;return cached.result;end if;
 if p_command='create_journal' then
  lines:=p_input->'lines';if jsonb_typeof(lines)<>'array' or jsonb_array_length(lines) not between 2 and 50 then raise exception 'invalid_journal';end if;
  if nullif(p_input->>'effectiveDate','')::date is null or nullif(p_input->>'effectiveDate','')::date>current_date or char_length(trim(p_input->>'reference')) not between 1 and 80 or char_length(trim(p_input->>'description')) not between 3 and 500 then raise exception 'invalid_journal';end if;
  if exists(select 1 from public.accounting_periods where dealer_id=p_dealer and status='closed' and (p_input->>'effectiveDate')::date between period_start and period_end) then raise exception 'accounting_period_closed';end if;
  insert into public.accounting_journals(dealer_id,effective_date,reference,description,created_by) values(p_dealer,(p_input->>'effectiveDate')::date,trim(p_input->>'reference'),trim(p_input->>'description'),auth.uid()) returning * into j;
  for item in select value from jsonb_array_elements(lines) loop
   pos:=pos+1;if coalesce(item->>'accountCode','')='' or not exists(select 1 from public.nominal_accounts where dealer_id=p_dealer and code=item->>'accountCode' and active) then raise exception 'journal_account_invalid';end if;
   if coalesce((item->>'debit')::numeric,0)<0 or coalesce((item->>'credit')::numeric,0)<0 or (coalesce((item->>'debit')::numeric,0)>0)=(coalesce((item->>'credit')::numeric,0)>0) then raise exception 'invalid_journal_line';end if;
   debits:=debits+coalesce((item->>'debit')::numeric,0);credits:=credits+coalesce((item->>'credit')::numeric,0);
   insert into public.accounting_journal_lines(dealer_id,journal_id,position,account_code,description,debit,credit) values(p_dealer,j.id,pos,item->>'accountCode',left(item->>'description',300),coalesce((item->>'debit')::numeric,0),coalesce((item->>'credit')::numeric,0));
  end loop;
  if debits<=0 or debits<>credits or debits<>round(debits,2) then raise exception 'journal_not_balanced';end if;
  result:=jsonb_build_object('id',j.id,'status','draft','total',debits);
 elsif p_command='post_journal' then
  select * into j from public.accounting_journals where id=p_id and dealer_id=p_dealer for update;if not found or j.status<>'draft' then raise exception 'journal_not_draft';end if;
  if j.created_by=auth.uid() and public.user_role_in(p_dealer)::text<>'owner' then raise exception 'journal_independent_review_required';end if;
  if exists(select 1 from public.accounting_periods where dealer_id=p_dealer and status='closed' and j.effective_date between period_start and period_end) then raise exception 'accounting_period_closed';end if;
  update public.accounting_journals set status='posted',posted_by=auth.uid(),posted_at=now() where id=j.id;result:=jsonb_build_object('id',j.id,'status','posted');
 elsif p_command='reverse_journal' then
  reason:=trim(p_input->>'reason');if char_length(reason) not between 5 and 500 then raise exception 'journal_reversal_reason_required';end if;
  select * into j from public.accounting_journals where id=p_id and dealer_id=p_dealer for update;if not found or j.status<>'posted' then raise exception 'journal_not_posted';end if;
  if exists(select 1 from public.accounting_periods where dealer_id=p_dealer and status='closed' and current_date between period_start and period_end) then raise exception 'accounting_period_closed';end if;
  insert into public.accounting_journals(dealer_id,effective_date,reference,description,status,created_by,posted_by,posted_at,reversal_of,reversal_reason)
   values(p_dealer,current_date,left('REV-'||j.reference,80),'Reversal · '||j.description,'reversed',auth.uid(),auth.uid(),now(),j.id,reason) returning id into reversal_id;
  insert into public.accounting_journal_lines(dealer_id,journal_id,position,account_code,description,debit,credit)
   select p_dealer,reversal_id,position,account_code,'Reversal · '||coalesce(description,j.description),credit,debit from public.accounting_journal_lines where journal_id=j.id;
  update public.accounting_journals set status='reversed',reversed_by=auth.uid(),reversed_at=now(),reversal_reason=reason where id=j.id;result:=jsonb_build_object('id',reversal_id,'status','reversed','originalId',j.id);
 end if;
 insert into public.audit_logs(dealer_id,user_id,action,entity,entity_id,meta) values(p_dealer,auth.uid(),'accounting_'||p_command,'accounting_journal',coalesce((result->>'id')::uuid,p_id),jsonb_build_object('input',p_input-'lines'));
 insert into public.accounting_requests values(p_dealer,p_request,p_command,jsonb_build_object('id',p_id,'data',p_input),result);return result;
end $$;
revoke all on function public.accounting_command(uuid,text,uuid,jsonb,uuid) from public,anon;
grant execute on function public.accounting_command(uuid,text,uuid,jsonb,uuid) to authenticated;
