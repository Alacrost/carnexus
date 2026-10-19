-- Invoice effective dates remain distinct from the server issue timestamp.
-- Backdating is dealer-configured and can never cross a closed accounting period.

create table public.accounting_settings(
  dealer_id uuid primary key references public.dealers(id) on delete cascade,
  max_invoice_backdate_days integer not null default 0 check(max_invoice_backdate_days between 0 and 365),
  updated_at timestamptz not null default now(),updated_by uuid references auth.users(id)
);
insert into public.accounting_settings(dealer_id) select id from public.dealers on conflict do nothing;
alter table public.accounting_settings enable row level security;
revoke all on public.accounting_settings from anon,authenticated;
grant select on public.accounting_settings to authenticated;
create policy accounting_settings_read on public.accounting_settings for select using(public.commercial_allowed(dealer_id,'cost'));

create function public.seed_accounting_settings() returns trigger language plpgsql set search_path=public as $$
begin insert into public.accounting_settings(dealer_id) values(new.id) on conflict do nothing;return new;end $$;
create trigger dealers_seed_accounting_settings after insert on public.dealers for each row execute function public.seed_accounting_settings();

alter table public.deal_documents add column effective_date date;
update public.deal_documents set effective_date=coalesce(nullif(snapshot->>'date','')::date,created_at::date);
alter table public.deal_documents alter column effective_date set not null;
alter table public.deal_documents alter column effective_date set default current_date;
create index deal_documents_effective_date on public.deal_documents(dealer_id,effective_date,kind);

alter function public.issue_commercial_document(uuid,text) rename to issue_commercial_document_v058;
revoke all on function public.issue_commercial_document_v058(uuid,text) from public,anon,authenticated;
create function public.issue_commercial_document(p_deal uuid,p_kind text) returns uuid
language plpgsql security definer set search_path=public as $$
declare doc uuid;chosen date;raw text;
begin
  doc:=public.issue_commercial_document_v058(p_deal,p_kind);
  raw:=current_setting('app.invoice_effective_date',true);
  chosen:=case when raw is null or raw='' then current_date else raw::date end;
  if p_kind='invoice' then
    update public.deal_documents set effective_date=chosen,snapshot=jsonb_set(snapshot,'{date}',to_jsonb(chosen::text),true) where id=doc;
  else
    update public.deal_documents set effective_date=coalesce(effective_date,current_date) where id=doc;
  end if;
  return doc;
end $$;
revoke all on function public.issue_commercial_document(uuid,text) from public,anon,authenticated;

alter function public.commercial_command(uuid,text,uuid,jsonb,uuid) rename to commercial_command_v058;
revoke all on function public.commercial_command_v058(uuid,text,uuid,jsonb,uuid) from public,anon,authenticated;
create function public.commercial_command(p_dealer uuid,p_command text,p_id uuid,p_input jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare chosen date;allowed_days integer;
begin
  if p_command='status' and p_input->>'status'='completed' then
    chosen:=coalesce(nullif(p_input->>'invoiceDate','')::date,current_date);
    if chosen>current_date then raise exception 'invoice_date_future';end if;
    select max_invoice_backdate_days into allowed_days from public.accounting_settings where dealer_id=p_dealer;
    if chosen<current_date-coalesce(allowed_days,0) then raise exception 'invoice_date_outside_policy';end if;
    if chosen<>current_date and coalesce(public.user_role_in(p_dealer)::text,'') not in ('owner','admin','accountant') then raise exception 'invoice_backdate_not_allowed';end if;
    if exists(select 1 from public.accounting_periods where dealer_id=p_dealer and status='closed' and chosen between period_start and period_end) then raise exception 'accounting_period_closed';end if;
    perform set_config('app.invoice_effective_date',chosen::text,true);
  end if;
  return public.commercial_command_v058(p_dealer,p_command,p_id,p_input,p_request);
end $$;
revoke all on function public.commercial_command(uuid,text,uuid,jsonb,uuid) from public,anon;
grant execute on function public.commercial_command(uuid,text,uuid,jsonb,uuid) to authenticated;

alter function public.accounting_command(uuid,text,uuid,jsonb,uuid) rename to accounting_command_v058;
revoke all on function public.accounting_command_v058(uuid,text,uuid,jsonb,uuid) from public,anon,authenticated;
create function public.accounting_command(p_dealer uuid,p_command text,p_id uuid,p_input jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare cached public.accounting_requests;days integer;result jsonb;
begin
  if p_command<>'set_invoice_policy' then return public.accounting_command_v058(p_dealer,p_command,p_id,p_input,p_request);end if;
  if auth.uid() is null or coalesce(public.user_role_in(p_dealer)::text,'') not in ('owner','admin') then raise exception 'invoice_policy_not_allowed';end if;
  if p_request is null or p_input is null then raise exception 'invalid_request';end if;
  days:=(p_input->>'maxBackdateDays')::integer;if days not between 0 and 365 then raise exception 'invalid_invoice_policy';end if;
  perform 1 from public.dealers where id=p_dealer for update;
  select * into cached from public.accounting_requests where dealer_id=p_dealer and request_id=p_request;
  if found then if cached.command<>p_command or cached.input<>jsonb_build_object('id',p_id,'data',p_input) then raise exception 'request_reused';end if;return cached.result;end if;
  insert into public.accounting_settings(dealer_id,max_invoice_backdate_days,updated_at,updated_by) values(p_dealer,days,now(),auth.uid())
    on conflict(dealer_id) do update set max_invoice_backdate_days=excluded.max_invoice_backdate_days,updated_at=now(),updated_by=auth.uid();
  insert into public.audit_logs(dealer_id,user_id,action,entity,entity_id,meta) values(p_dealer,auth.uid(),'invoice_date_policy_updated','accounting_settings',p_dealer,jsonb_build_object('max_backdate_days',days));
  result:=jsonb_build_object('id',p_dealer,'maxBackdateDays',days);
  insert into public.accounting_requests values(p_dealer,p_request,p_command,jsonb_build_object('id',p_id,'data',p_input),result);return result;
end $$;
revoke all on function public.accounting_command(uuid,text,uuid,jsonb,uuid) from public,anon;
grant execute on function public.accounting_command(uuid,text,uuid,jsonb,uuid) to authenticated;
