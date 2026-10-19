-- Interest records are removable, but only an activated negotiation is cancellable.
-- Keep the existing confirmed-money predicate separate from explicit agreements.
create function public.deal_is_activated(p_dealer uuid,p_deal uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.commercial_allowed(p_dealer,'read') and exists(select 1 from public.deals d where d.id=p_deal and d.dealer_id=p_dealer and (
    exists(select 1 from public.payments p where p.deal_id=d.id and p.dealer_id=p_dealer
      and p.kind in ('deposit','balance','finance_payout') and p.clearance_status in ('pending','cleared','not_required')
      and p.amount>coalesce((select sum(r.amount) from public.payments r where r.reverses_payment_id=p.id
        and (r.clearance_status in ('cleared','not_required') or (r.kind='receipt_reversal'
          and (p.clearance_status in ('cleared','not_required') or p.cleared_at is not null)))),0))
    or exists(select 1 from public.deal_orders o where o.deal_id=d.id and o.dealer_id=p_dealer and o.kind='purchase' and o.is_trade_in)
    or exists(select 1 from public.deal_documents x where x.deal_id=d.id and x.dealer_id=p_dealer and x.kind='agreement' and x.status<>'void')));
$$;
revoke all on function public.deal_is_activated(uuid,uuid) from public,anon,authenticated;

create function public.activate_registered_deal(p_dealer uuid,p_deal uuid)
returns void language plpgsql security definer set search_path=public as $$
declare d public.deals; v public.vehicles;
begin
  select * into d from public.deals where id=p_deal and dealer_id=p_dealer for update;
  if not found or d.status in ('completed','cancelled','reversed') or not public.deal_is_activated(p_dealer,p_deal) then return; end if;
  if d.status='vehicle_interest' then
    select car.* into v from public.vehicles car join public.deal_orders o on o.vehicle_id=car.id
      where o.deal_id=d.id and o.kind='sale' and car.dealer_id=p_dealer for update of car;
    if v.id is null or v.status in ('sold','reserved','returned_to_customer') or exists(
      select 1 from public.deal_orders o join public.deals other on other.id=o.deal_id where o.vehicle_id=v.id
        and o.kind='sale' and other.id<>d.id and other.status not in ('vehicle_interest','cancelled','completed','reversed')) then raise exception 'vehicle_has_open_deal'; end if;
    update public.vehicles set status='reserved' where id=v.id;
  end if;
  if d.status='vehicle_interest' or d.stage not in ('closing','after_sales') then
    update public.deals set status=case when status='vehicle_interest' then 'agreed' else status end,
      stage=case when stage='after_sales' then stage else 'closing' end,updated_at=now() where id=d.id;
    insert into public.deal_events(dealer_id,deal_id,kind,detail,created_by) values(p_dealer,d.id,'automatic_closing',
      jsonb_build_object('message','Deal activated by a registered payment, trade-in or agreement','before',d.stage,'after','closing'),auth.uid());
  end if;
end $$;
revoke all on function public.activate_registered_deal(uuid,uuid) from public,anon,authenticated;

alter function public.commercial_command(uuid,text,uuid,jsonb,uuid) rename to commercial_command_v091;
revoke all on function public.commercial_command_v091(uuid,text,uuid,jsonb,uuid) from public,anon,authenticated;
create function public.commercial_command(p_dealer uuid,p_command text,p_id uuid,p_input jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare d public.deals; replay boolean:=false; result jsonb;
begin
  if p_command='cancel_deal' or p_command='force_agreement'
    or (p_command='document' and p_input->>'kind'='agreement') then
    if auth.uid() is null or not public.commercial_allowed(p_dealer,'work') then raise exception 'commercial_not_allowed'; end if;
    perform 1 from public.dealers where id=p_dealer for update;
    select exists(select 1 from public.commercial_requests where dealer_id=p_dealer and request_id=p_request) into replay;
    -- Delegate cached requests so the existing request/input identity checks apply.
    if not replay then
      select * into d from public.deals where id=p_id and dealer_id=p_dealer for update;
      if found and d.status not in ('completed','cancelled','reversed') then
        if p_command='cancel_deal' then
          if not public.deal_is_activated(p_dealer,p_id) then
            raise exception 'vehicle_interest_requires_activation';
          end if;
        elsif d.stage not in ('closing','after_sales') and (p_command='force_agreement' or not exists(
          select 1 from public.deal_documents where dealer_id=p_dealer and deal_id=p_id
            and kind='agreement' and status<>'void')) then
          -- Do this before issuing the snapshot. Any failure in the underlying
          -- agreement command rolls back this update and its event atomically.
          update public.deals set stage='closing',updated_at=now() where id=d.id;
          insert into public.deal_events(dealer_id,deal_id,kind,detail,created_by)
            values(p_dealer,d.id,'automatic_closing',jsonb_build_object(
              'message','Deal moved to closing when creating an agreement',
              'before',d.stage,'after','closing'),auth.uid());
        end if;
      end if;
    end if;
  end if;
  if p_command='payment' then
    if auth.uid() is null or not public.commercial_allowed(p_dealer,'payment') then raise exception 'commercial_not_allowed'; end if;
    perform 1 from public.dealers where id=p_dealer for update;
    select exists(select 1 from public.commercial_requests where dealer_id=p_dealer and request_id=p_request) into replay;
  end if;
  result:=public.commercial_command_v091(p_dealer,p_command,p_id,p_input,p_request);
  if p_command='payment' and not replay and p_input->>'kind' in ('deposit','balance','finance_payout') then
    perform public.activate_registered_deal(p_dealer,p_id);
  end if;
  return result;
end $$;
revoke all on function public.commercial_command(uuid,text,uuid,jsonb,uuid) from public,anon;
grant execute on function public.commercial_command(uuid,text,uuid,jsonb,uuid) to authenticated;

alter function public.create_deal_from_sheet(uuid,jsonb,jsonb,jsonb,text,uuid) rename to create_deal_from_sheet_v091;
revoke all on function public.create_deal_from_sheet_v091(uuid,jsonb,jsonb,jsonb,text,uuid) from public,anon,authenticated;
create function public.create_deal_from_sheet(p_dealer uuid,p_sale jsonb,p_terms jsonb,p_finance jsonb,p_mode text,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; replay boolean; d public.deals;
begin
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'work') then raise exception 'commercial_not_allowed'; end if;
  perform 1 from public.dealers where id=p_dealer for update;
  select exists(select 1 from public.deal_sheet_requests where dealer_id=p_dealer and request_id=p_request) into replay;
  result:=public.create_deal_from_sheet_v091(p_dealer,p_sale,p_terms,p_finance,p_mode,p_request);
  if not replay then perform public.activate_registered_deal(p_dealer,(result->>'id')::uuid); end if;
  select * into d from public.deals where id=(result->>'id')::uuid and dealer_id=p_dealer;
  if found then result:=result||jsonb_build_object('status',d.status,'stage',d.stage,'version',d.version); end if;
  return result;
end $$;
revoke all on function public.create_deal_from_sheet(uuid,jsonb,jsonb,jsonb,text,uuid) from public,anon;
grant execute on function public.create_deal_from_sheet(uuid,jsonb,jsonb,jsonb,text,uuid) to authenticated;

-- New document snapshots expose receipt state without changing confirmed totals
-- or rewriting historical documents.
do $$
declare body text; original text;
begin
  select prosrc into body from pg_proc where oid='public.issue_commercial_document_v058(uuid,text)'::regprocedure;
  original:=body;
  body:=replace(body,'''date'',paid_on,''reference'',reference)',
    '''date'',paid_on,''reference'',reference,''clearance_status'',clearance_status)');
  if body=original then raise exception 'payment_snapshot_clearance_patch_missing'; end if;
  execute format('create or replace function public.issue_commercial_document_v058(p_deal uuid,p_kind text) returns uuid language plpgsql security definer set search_path=public as %L',body);
end $$;
