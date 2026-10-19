create function public.deal_agreement_triggered(p_dealer uuid,p_deal uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.commercial_allowed(p_dealer,'read') and exists(select 1 from public.deals d
    where d.id=p_deal and d.dealer_id=p_dealer and (
      exists(select 1 from public.payments p where p.deal_id=d.id and p.dealer_id=p_dealer
        and p.kind='deposit' and p.amount>0 and p.clearance_status in ('cleared','not_required')
        and p.amount>coalesce((select sum(r.amount) from public.payments r where r.reverses_payment_id=p.id
          and r.clearance_status in ('cleared','not_required')),0))
      or exists(select 1 from public.deal_orders o where o.deal_id=d.id and o.dealer_id=p_dealer
        and o.kind='purchase' and o.is_trade_in)));
$$;
revoke all on function public.deal_agreement_triggered(uuid,uuid) from public,anon,authenticated;

-- Patch only the three conditions that previously equated any deposit with funds received.
do $$
declare body text; original text;
begin
  select prosrc into body from pg_proc where oid='public.commercial_command_v083(uuid,text,uuid,jsonb,uuid)'::regprocedure;
  original:=body;
  body:=replace(body,'(p_command=''payment'' and p_input->>''kind''=''deposit'')',
    '(p_command=''payment'' and p_input->>''kind''=''deposit'' and (p_input->>''method'' in (''cash'',''card'',''finance'') or coalesce((p_input->>''fundsConfirmed'')::boolean,false)))');
  if body=original then raise exception 'agreement_promotion_patch_missing'; end if;
  execute format('create or replace function public.commercial_command_v083(p_dealer uuid,p_command text,p_id uuid,p_input jsonb,p_request uuid) returns jsonb language plpgsql security definer set search_path=public as %L',body);
  select prosrc into body from pg_proc where oid='public.commercial_command(uuid,text,uuid,jsonb,uuid)'::regprocedure;
  original:=body;
  body:=replace(body,'(p_command=''payment'' and p_input->>''kind''=''deposit'')',
    '(p_command=''payment'' and p_input->>''kind''=''deposit'' and public.deal_agreement_triggered(p_dealer,p_id))');
  if body=original then raise exception 'agreement_receipt_patch_missing'; end if;
  execute format('create or replace function public.commercial_command(p_dealer uuid,p_command text,p_id uuid,p_input jsonb,p_request uuid) returns jsonb language plpgsql security definer set search_path=public as %L',body);
  select prosrc into body from pg_proc where oid='public.autosave_new_deal_v083(uuid,uuid,integer,jsonb,uuid)'::regprocedure;
  original:=body;
  body:=replace(body,'jsonb_array_length(deposits)>0 or jsonb_array_length(trades)>0',
    'public.deal_agreement_triggered(p_dealer,d.id)');
  if body=original then raise exception 'agreement_autosave_patch_missing'; end if;
  execute format('create or replace function public.autosave_new_deal_v083(p_dealer uuid,p_session uuid,p_revision integer,p_input jsonb,p_request uuid) returns jsonb language plpgsql security definer set search_path=public as %L',body);
  select prosrc into body from pg_proc where oid='public.create_deal_from_sheet(uuid,jsonb,jsonb,jsonb,text,uuid)'::regprocedure;
  original:=body;
  body:=replace(body,'not exists(select 1 from public.payments where deal_id=(result->>''id'')::uuid and kind=''deposit'')',
    'not public.deal_agreement_triggered(p_dealer,(result->>''id'')::uuid)');
  if body=original then raise exception 'agreement_sheet_patch_missing'; end if;
  body:=replace(body,'  return result;',
    '  if p_mode in (''deal'',''edit'') and public.deal_agreement_triggered(p_dealer,(result->>''id'')::uuid) then
      perform public.commercial_command(p_dealer,''force_agreement'',(result->>''id'')::uuid,
        jsonb_build_object(''expectedVersion'',(select version from public.deals where id=(result->>''id'')::uuid)),gen_random_uuid());
    end if;
    return result;');
  execute format('create or replace function public.create_deal_from_sheet(p_dealer uuid,p_sale jsonb,p_terms jsonb,p_finance jsonb,p_mode text,p_request uuid) returns jsonb language plpgsql security definer set search_path=public as %L',body);
end $$;
alter function public.commercial_command(uuid,text,uuid,jsonb,uuid) rename to commercial_command_v088;
revoke all on function public.commercial_command_v088(uuid,text,uuid,jsonb,uuid) from public,anon,authenticated;
create function public.commercial_command(p_dealer uuid,p_command text,p_id uuid,p_input jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; receipt public.payments; d public.deals; replay boolean; previous_clearance text;
begin
  if p_command='document' and p_input->>'kind'='quote' then
    if auth.uid() is null or not public.commercial_allowed(p_dealer,'work') then raise exception 'commercial_not_allowed'; end if;
    perform 1 from public.dealers where id=p_dealer for update;
    if public.deal_agreement_triggered(p_dealer,p_id) or exists(select 1 from public.deals candidate
      where candidate.id=p_id and candidate.dealer_id=p_dealer and (candidate.status in ('agreed','finance','completed')
        or exists(select 1 from public.deal_documents x where x.deal_id=candidate.id and x.dealer_id=p_dealer
          and x.kind='agreement' and x.status<>'void'))) then raise exception 'agreement_required'; end if;
  end if;
  if p_command='document' and p_input->>'kind'='agreement' then
    if auth.uid() is null or not public.commercial_allowed(p_dealer,'work') then raise exception 'commercial_not_allowed'; end if;
    perform 1 from public.dealers where id=p_dealer for update;
    select * into d from public.deals where id=p_id and dealer_id=p_dealer for update;
    if d.status='vehicle_interest' and public.deal_agreement_triggered(p_dealer,p_id) then
      perform public.commercial_command(p_dealer,'force_agreement',d.id,jsonb_build_object('expectedVersion',d.version),gen_random_uuid());
    end if;
  end if;
  if p_command<>'clear_receipt' then return public.commercial_command_v088(p_dealer,p_command,p_id,p_input,p_request); end if;
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'read') then raise exception 'commercial_not_allowed'; end if;
  perform 1 from public.dealers where id=p_dealer for update;
  select exists(select 1 from public.commercial_requests where dealer_id=p_dealer and request_id=p_request) into replay;
  select clearance_status into previous_clearance from public.payments where id=p_id and dealer_id=p_dealer;
  result:=public.commercial_command_v088(p_dealer,p_command,p_id,p_input,p_request);
  if not replay and previous_clearance='pending' then
    select * into receipt from public.payments where id=p_id and dealer_id=p_dealer;
    if receipt.kind='deposit' and public.deal_agreement_triggered(p_dealer,receipt.deal_id) then
      select * into d from public.deals where id=receipt.deal_id and dealer_id=p_dealer for update;
      if d.status not in ('completed','cancelled','reversed') then
        if exists(select 1 from public.deal_documents x where x.deal_id=d.id and x.kind='agreement' and x.status<>'void' and x.deal_version=d.version) then
          update public.deals set version=version+1,updated_at=now() where id=d.id returning * into d;
        end if;
        perform public.commercial_command(p_dealer,'force_agreement',d.id,jsonb_build_object('expectedVersion',d.version),gen_random_uuid());
      end if;
    end if;
  end if;
  return result;
end $$;
revoke all on function public.commercial_command(uuid,text,uuid,jsonb,uuid) from public,anon;
grant execute on function public.commercial_command(uuid,text,uuid,jsonb,uuid) to authenticated;
