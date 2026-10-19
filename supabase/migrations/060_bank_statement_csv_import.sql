-- Audited, atomic CSV statement import. Parsing happens in the reviewed UI;
-- every row is revalidated by the database and duplicate file content is blocked.

create table public.bank_import_batches(
  id uuid primary key default gen_random_uuid(),dealer_id uuid not null references public.dealers(id) on delete cascade,
  reconciliation_id uuid not null references public.bank_reconciliations(id) on delete cascade,
  file_name text not null,content_fingerprint text not null,row_count integer not null check(row_count between 1 and 1000),
  imported_by uuid references auth.users(id),imported_at timestamptz not null default now(),
  unique(dealer_id,reconciliation_id,content_fingerprint)
);
alter table public.bank_statement_lines add column import_batch_id uuid references public.bank_import_batches(id);
alter table public.bank_import_batches enable row level security;
revoke all on public.bank_import_batches from anon,authenticated;
grant select on public.bank_import_batches to authenticated;
create policy bank_import_batches_read on public.bank_import_batches for select using(public.commercial_allowed(dealer_id,'cost'));

alter function public.bank_command(uuid,text,uuid,jsonb,uuid) rename to bank_command_v059;
revoke all on function public.bank_command_v059(uuid,text,uuid,jsonb,uuid) from public,anon,authenticated;
create function public.bank_command(p_dealer uuid,p_command text,p_id uuid,p_input jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare cached public.bank_requests;recon public.bank_reconciliations;item jsonb;batch_id uuid;fingerprint text;row_count integer;amount numeric;tx_date date;result jsonb;
begin
  if p_command<>'import_lines' then return public.bank_command_v059(p_dealer,p_command,p_id,p_input,p_request);end if;
  if auth.uid() is null or coalesce(public.user_role_in(p_dealer)::text,'') not in ('owner','admin','accountant') or not public.commercial_allowed(p_dealer,'cost') then raise exception 'bank_not_allowed';end if;
  if p_request is null or p_input is null or jsonb_typeof(p_input->'lines')<>'array' or octet_length(p_input::text)>300000 then raise exception 'invalid_bank_import';end if;
  row_count:=jsonb_array_length(p_input->'lines');if row_count not between 1 and 1000 then raise exception 'invalid_bank_import';end if;
  if char_length(trim(p_input->>'fileName')) not between 1 and 180 then raise exception 'invalid_bank_import';end if;
  perform 1 from public.dealers where id=p_dealer for update;
  select * into cached from public.bank_requests where dealer_id=p_dealer and request_id=p_request;
  if found then if cached.command<>p_command or cached.input<>jsonb_build_object('id',p_id,'data',p_input) then raise exception 'request_reused';end if;return cached.result;end if;
  select * into recon from public.bank_reconciliations where id=p_id and dealer_id=p_dealer for update;
  if not found or recon.status<>'draft' then raise exception 'reconciliation_closed_or_missing';end if;
  fingerprint:=md5((p_input->'lines')::text);
  if exists(select 1 from public.bank_import_batches where dealer_id=p_dealer and reconciliation_id=recon.id and content_fingerprint=fingerprint) then raise exception 'bank_import_duplicate';end if;
  insert into public.bank_import_batches(dealer_id,reconciliation_id,file_name,content_fingerprint,row_count,imported_by)
    values(p_dealer,recon.id,left(trim(p_input->>'fileName'),180),fingerprint,row_count,auth.uid()) returning id into batch_id;
  for item in select value from jsonb_array_elements(p_input->'lines') loop
    if jsonb_typeof(item)<>'object' then raise exception 'invalid_bank_import_row';end if;
    tx_date:=nullif(item->>'date','')::date;amount:=(item->>'amount')::numeric;
    if tx_date not between recon.period_start and recon.period_end or amount is null or amount=0 or amount<>round(amount,2)
      or char_length(trim(item->>'description')) not between 1 and 300 or char_length(coalesce(item->>'reference',''))>120 then raise exception 'invalid_bank_import_row';end if;
    insert into public.bank_statement_lines(dealer_id,reconciliation_id,transaction_date,description,statement_reference,amount,created_by,import_batch_id)
      values(p_dealer,recon.id,tx_date,trim(item->>'description'),nullif(trim(item->>'reference'),''),amount,auth.uid(),batch_id);
  end loop;
  insert into public.audit_logs(dealer_id,user_id,action,entity,entity_id,meta) values(p_dealer,auth.uid(),'bank_statement_imported','bank_reconciliation',recon.id,jsonb_build_object('batch_id',batch_id,'file_name',left(trim(p_input->>'fileName'),180),'rows',row_count));
  result:=jsonb_build_object('id',batch_id,'rows',row_count);
  insert into public.bank_requests values(p_dealer,p_request,p_command,jsonb_build_object('id',p_id,'data',p_input),result);return result;
end $$;
revoke all on function public.bank_command(uuid,text,uuid,jsonb,uuid) from public,anon;
grant execute on function public.bank_command(uuid,text,uuid,jsonb,uuid) to authenticated;
