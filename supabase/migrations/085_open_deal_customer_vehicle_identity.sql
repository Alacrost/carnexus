-- A customer may have only one open negotiation for a vehicle in each dealer.
-- Existing duplicates are grandfathered, not deleted, merged or silently changed.
create table public.open_deal_pairs (
  dealer_id uuid not null,
  customer_id uuid not null,
  vehicle_id uuid not null,
  deal_ids uuid[] not null,
  primary key(dealer_id,customer_id,vehicle_id)
);
revoke all on public.open_deal_pairs from public,anon,authenticated;
create index open_deal_pairs_deals_idx on public.open_deal_pairs using gin(deal_ids);

insert into public.open_deal_pairs(dealer_id,customer_id,vehicle_id,deal_ids)
select d.dealer_id,d.customer_id,o.vehicle_id,array_agg(distinct d.id order by d.id)
from public.deals d join public.deal_orders o on o.deal_id=d.id
where d.customer_id is not null and o.vehicle_id is not null and o.kind='sale'
  and d.status not in ('completed','cancelled','reversed')
group by d.dealer_id,d.customer_id,o.vehicle_id;

create function public.sync_open_deal_pairs(p_deal uuid)
returns void language plpgsql security definer set search_path=public as $$
declare pair record; claimed uuid[];
begin
  -- Serialize edits of this Deal while the primary key serializes competing Deals.
  perform 1 from public.deals where id=p_deal for update;
  for pair in select * from public.open_deal_pairs where deal_ids @> array[p_deal]
    order by dealer_id,customer_id,vehicle_id for update loop
    if not exists(select 1 from public.deals d join public.deal_orders o on o.deal_id=d.id
      where d.id=p_deal and d.dealer_id=pair.dealer_id and d.customer_id=pair.customer_id
      and o.vehicle_id=pair.vehicle_id and o.kind='sale'
      and d.status not in ('completed','cancelled','reversed')) then
      update public.open_deal_pairs set deal_ids=array_remove(deal_ids,p_deal)
      where dealer_id=pair.dealer_id and customer_id=pair.customer_id and vehicle_id=pair.vehicle_id;
      delete from public.open_deal_pairs where dealer_id=pair.dealer_id
        and customer_id=pair.customer_id and vehicle_id=pair.vehicle_id and cardinality(deal_ids)=0;
    end if;
  end loop;
  for pair in select distinct d.dealer_id,d.customer_id,o.vehicle_id
    from public.deals d join public.deal_orders o on o.deal_id=d.id
    where d.id=p_deal and d.customer_id is not null and o.vehicle_id is not null
      and o.kind='sale' and d.status not in ('completed','cancelled','reversed')
    order by d.dealer_id,d.customer_id,o.vehicle_id loop
    claimed:=null;
    insert into public.open_deal_pairs as existing(dealer_id,customer_id,vehicle_id,deal_ids)
    values(pair.dealer_id,pair.customer_id,pair.vehicle_id,array[p_deal])
    on conflict(dealer_id,customer_id,vehicle_id) do update set deal_ids=existing.deal_ids
      where p_deal=any(existing.deal_ids)
    returning deal_ids into claimed;
    if claimed is null then raise exception 'existing_open_deal' using errcode='23505'; end if;
  end loop;
end $$;
revoke all on function public.sync_open_deal_pairs(uuid) from public,anon,authenticated;

create function public.guard_open_deal_pairs()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if TG_TABLE_NAME='deals' then
    if TG_OP='DELETE' then perform public.sync_open_deal_pairs(old.id);
    else perform public.sync_open_deal_pairs(new.id); end if;
  else
    if TG_OP<>'INSERT' then perform public.sync_open_deal_pairs(old.deal_id); end if;
    if TG_OP<>'DELETE' then perform public.sync_open_deal_pairs(new.deal_id); end if;
  end if;
  return null;
end $$;
revoke all on function public.guard_open_deal_pairs() from public,anon,authenticated;
create trigger guard_open_deal_pairs_deal
after insert or update of customer_id,dealer_id,status or delete on public.deals
for each row execute function public.guard_open_deal_pairs();
create trigger guard_open_deal_pairs_order
after insert or update of deal_id,vehicle_id,kind or delete on public.deal_orders
for each row execute function public.guard_open_deal_pairs();

-- New tabs return the existing Deal without applying any stale form values,
-- payments, trade-ins or terms. Existing sessions retain revision/idempotency guards.
alter function public.autosave_new_deal(uuid,uuid,integer,jsonb,uuid) rename to autosave_new_deal_v083;
revoke all on function public.autosave_new_deal_v083(uuid,uuid,integer,jsonb,uuid) from public,anon,authenticated;
create function public.autosave_new_deal(p_dealer uuid,p_session uuid,p_revision integer,p_input jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare cached public.commercial_requests; payload jsonb; d public.deals; result jsonb;
begin
  if auth.uid() is null or not public.commercial_allowed(p_dealer,'work') then raise exception 'commercial_not_allowed'; end if;
  if p_session is null or p_request is null or p_revision is null or p_input is null
    or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>80000 then raise exception 'invalid_request'; end if;
  perform 1 from public.dealers where id=p_dealer for update;
  payload:=jsonb_build_object('session',p_session,'revision',p_revision,'input',p_input);
  select * into cached from public.commercial_requests where dealer_id=p_dealer and request_id=p_request;
  if found then
    if cached.command<>'autosave_new_deal' or cached.input<>payload then raise exception 'request_reused'; end if;
    return cached.result;
  end if;
  if not exists(select 1 from public.new_deal_sessions where dealer_id=p_dealer and session_id=p_session) then
    if p_revision<>0 then raise exception 'stale_deal'; end if;
    select candidate.* into d from public.deals candidate
    where candidate.dealer_id=p_dealer and candidate.customer_id=(p_input->'sale'->>'customerId')::uuid
      and candidate.status not in ('completed','cancelled','reversed')
      and exists(select 1 from public.deal_orders o where o.deal_id=candidate.id and o.kind='sale'
        and o.vehicle_id=(p_input->'sale'->>'vehicleId')::uuid)
    order by candidate.created_at,candidate.id limit 1;
    if found then
      result:=jsonb_build_object('existingDeal',jsonb_build_object('id',d.id,'number',d.deal_no,'status',d.status));
      insert into public.commercial_requests(dealer_id,request_id,command,input,result)
      values(p_dealer,p_request,'autosave_new_deal',payload,result);
      return result;
    end if;
  end if;
  return public.autosave_new_deal_v083(p_dealer,p_session,p_revision,p_input,p_request);
end $$;
revoke all on function public.autosave_new_deal(uuid,uuid,integer,jsonb,uuid) from public,anon;
grant execute on function public.autosave_new_deal(uuid,uuid,integer,jsonb,uuid) to authenticated;
