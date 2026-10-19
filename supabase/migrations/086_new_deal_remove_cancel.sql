-- Terminal tab identities contain no Deal data. Keep them even after hard removal,
-- so an old revision-zero request cannot create the negotiation again.
create table public.new_deal_terminal_sessions (
  dealer_id uuid not null references public.dealers(id),
  session_id uuid not null, created_by uuid not null references auth.users(id),
  action text not null check(action in ('remove','cancel')),
  request_id uuid not null, closed_at timestamptz not null default now(),
  primary key(dealer_id,session_id)
);
alter table public.new_deal_terminal_sessions enable row level security;
revoke all on public.new_deal_terminal_sessions from public,anon,authenticated;

alter function public.autosave_new_deal(uuid,uuid,integer,jsonb,uuid) rename to autosave_new_deal_v085;
revoke all on function public.autosave_new_deal_v085(uuid,uuid,integer,jsonb,uuid) from public,anon,authenticated;
create function public.autosave_new_deal(p_dealer uuid,p_session uuid,p_revision integer,p_input jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'work') then raise exception 'commercial_not_allowed'; end if;
  perform 1 from public.dealers where id=p_dealer for update;
  if exists(select 1 from public.new_deal_terminal_sessions where dealer_id=p_dealer and session_id=p_session) then raise exception 'deal_closed'; end if;
  return public.autosave_new_deal_v085(p_dealer,p_session,p_revision,p_input,p_request);
end $$;
revoke all on function public.autosave_new_deal(uuid,uuid,integer,jsonb,uuid) from public,anon;
grant execute on function public.autosave_new_deal(uuid,uuid,integer,jsonb,uuid) to authenticated;

create function public.terminate_new_deal(p_dealer uuid,p_session uuid,p_deal uuid,p_action text,p_version integer,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.new_deal_sessions; terminal public.new_deal_terminal_sessions; d public.deals; result jsonb;
begin
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'work') then raise exception 'commercial_not_allowed'; end if;
  if p_session is null or p_request is null or p_action is null or p_action not in ('remove','cancel') then raise exception 'invalid_request'; end if;
  perform 1 from public.dealers where id=p_dealer for update;
  select * into terminal from public.new_deal_terminal_sessions where dealer_id=p_dealer and session_id=p_session;
  if found then
    if terminal.created_by<>auth.uid() then raise exception 'commercial_not_allowed'; end if;
    if terminal.action<>p_action or terminal.request_id<>p_request then raise exception 'deal_closed'; end if;
    return jsonb_build_object('id',null,'status',case when p_action='remove' then 'removed' else 'cancelled' end);
  end if;
  select * into s from public.new_deal_sessions where dealer_id=p_dealer and session_id=p_session for update;
  if found then
    if s.created_by<>auth.uid() then raise exception 'commercial_not_allowed'; end if;
    if p_deal is not null and p_deal<>s.deal_id then raise exception 'invalid_new_deal'; end if;
    select * into d from public.deals where id=s.deal_id and dealer_id=p_dealer for update;
    if not found or d.status in ('completed','cancelled','reversed') then raise exception 'deal_closed'; end if;
    if d.version is distinct from coalesce(p_version,s.deal_version) then raise exception 'stale_deal'; end if;
    if exists(select 1 from public.payments where deal_id=d.id)
      or exists(select 1 from public.purchase_orders where deal_id=d.id)
      or exists(select 1 from public.deal_orders where deal_id=d.id and (kind<>'sale' or is_trade_in))
      or exists(select 1 from public.deal_documents where deal_id=d.id and kind<>'quote') then
      raise exception 'financial_deal_requires_review';
    end if;
    if p_action='remove' then
      if exists(select 1 from public.crm_tasks where deal_id=d.id)
        or exists(select 1 from public.viewings where deal_id=d.id)
        or exists(select 1 from public.sales_quotes where deal_id=d.id)
        or exists(select 1 from public.deal_follow_up_steps where deal_id=d.id) then raise exception 'linked_deal_requires_review'; end if;
      -- Children (orders, quote documents, addons, disclosures, events) cascade.
      -- Remove only technical replay records belonging to this negotiation.
      delete from public.commercial_requests r where r.dealer_id=p_dealer and
        (r.input->>'id'=d.id::text or r.result->>'id'=d.id::text or r.result->'existingDeal'->>'id'=d.id::text);
      delete from public.deal_sheet_requests r where r.dealer_id=p_dealer and r.result->>'id'=d.id::text;
      delete from public.deal_sheet_trade_requests r where r.dealer_id=p_dealer and r.result->>'id'=d.id::text;
      insert into public.new_deal_terminal_sessions(dealer_id,session_id,created_by,action,request_id)
        select dealer_id,session_id,created_by,p_action,p_request from public.new_deal_sessions
        where dealer_id=p_dealer and deal_id=d.id and session_id<>p_session
        on conflict do nothing;
      if d.status<>'vehicle_interest' then
        update public.vehicles v set status='ready_for_sale'
        where v.dealer_id=p_dealer and v.status='reserved'
          and exists(select 1 from public.deal_orders o where o.deal_id=d.id and o.vehicle_id=v.id and o.kind='sale')
          and not exists(select 1 from public.deal_orders o join public.deals other on other.id=o.deal_id
            where o.vehicle_id=v.id and o.kind='sale' and other.id<>d.id
            and other.status not in ('vehicle_interest','completed','cancelled','reversed'));
      end if;
      delete from public.new_deal_sessions where dealer_id=p_dealer and deal_id=d.id;
      delete from public.deals where id=d.id and dealer_id=p_dealer;
      result:=jsonb_build_object('id',null,'status','removed');
    else
      result:=public.commercial_command(p_dealer,'cancel_deal',d.id,
        jsonb_build_object('expectedVersion',d.version,'reason','Cancelled from New Deal'),p_request);
      insert into public.new_deal_terminal_sessions(dealer_id,session_id,created_by,action,request_id)
        select dealer_id,session_id,created_by,p_action,p_request from public.new_deal_sessions
        where dealer_id=p_dealer and deal_id=d.id and session_id<>p_session
        on conflict do nothing;
    end if;
  else
    if p_deal is not null then raise exception 'invalid_new_deal'; end if;
    result:=jsonb_build_object('id',null,'status','discarded');
  end if;
  insert into public.new_deal_terminal_sessions(dealer_id,session_id,created_by,action,request_id)
    values(p_dealer,p_session,auth.uid(),p_action,p_request);
  return result;
end $$;
revoke all on function public.terminate_new_deal(uuid,uuid,uuid,text,integer,uuid) from public,anon;
grant execute on function public.terminate_new_deal(uuid,uuid,uuid,text,integer,uuid) to authenticated;
