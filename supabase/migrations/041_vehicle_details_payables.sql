create table public.vehicle_details (
  vehicle_id uuid primary key references vehicles(id),dealer_id uuid not null references dealers(id),
  vin text,trim text,body_style text,colour text,engine_cc integer check(engine_cc between 0 and 20000),
  keys_count integer check(keys_count between 0 and 10),previous_owners integer check(previous_owners between 0 and 50),
  service_history text not null default 'unknown' check(service_history in ('unknown','none','partial','full')),
  last_service_on date,last_service_km integer check(last_service_km>=0),timing_belt_on date,
  nct_expiry date,warranty_months integer check(warranty_months between 0 and 120),
  has_logbook boolean not null default false,equipment text[] not null default '{}',condition_notes text,
  updated_at timestamptz not null default now()
);
create table public.vehicle_service_history (
  id uuid primary key default gen_random_uuid(),dealer_id uuid not null references dealers(id),vehicle_id uuid not null references vehicles(id),
  serviced_on date not null,km integer check(km>=0),description text not null,provider text,reference text,
  created_by uuid references auth.users(id),created_at timestamptz not null default now()
);
alter table public.vehicle_details enable row level security;
alter table public.vehicle_service_history enable row level security;
revoke all on public.vehicle_details,public.vehicle_service_history from anon,authenticated;
grant select on public.vehicle_details,public.vehicle_service_history to authenticated;
create policy vehicle_details_read on public.vehicle_details for select using(commercial_allowed(dealer_id,'read'));
create policy vehicle_service_read on public.vehicle_service_history for select using(commercial_allowed(dealer_id,'read'));
create function public.save_vehicle_details(p_dealer uuid,p_vehicle uuid,p_kind text,p_data jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare previous jsonb;
begin
  if not commercial_allowed(p_dealer,'work') or user_role_in(p_dealer) not in ('owner','admin') then raise exception 'commercial_not_allowed'; end if;
  perform 1 from vehicles where id=p_vehicle and dealer_id=p_dealer for update;
  if not found or octet_length(p_data::text)>12000 then raise exception 'invalid_vehicle'; end if;
  if p_kind='details' then
    select to_jsonb(v) into previous from vehicle_details v where vehicle_id=p_vehicle;
    insert into vehicle_details(vehicle_id,dealer_id,vin,trim,body_style,colour,engine_cc,keys_count,previous_owners,service_history,last_service_on,last_service_km,timing_belt_on,nct_expiry,warranty_months,has_logbook,equipment,condition_notes)
    values(p_vehicle,p_dealer,upper(left(p_data->>'vin',17)),left(p_data->>'trim',80),left(p_data->>'body_style',40),left(p_data->>'colour',40),nullif(p_data->>'engine_cc','')::integer,nullif(p_data->>'keys_count','')::integer,nullif(p_data->>'previous_owners','')::integer,coalesce(p_data->>'service_history','unknown'),nullif(p_data->>'last_service_on','')::date,nullif(p_data->>'last_service_km','')::integer,nullif(p_data->>'timing_belt_on','')::date,nullif(p_data->>'nct_expiry','')::date,nullif(p_data->>'warranty_months','')::integer,coalesce((p_data->>'has_logbook')::boolean,false),array(select jsonb_array_elements_text(coalesce(p_data->'equipment','[]'))),left(p_data->>'condition_notes',2000))
    on conflict(vehicle_id) do update set vin=excluded.vin,trim=excluded.trim,body_style=excluded.body_style,colour=excluded.colour,engine_cc=excluded.engine_cc,keys_count=excluded.keys_count,previous_owners=excluded.previous_owners,service_history=excluded.service_history,last_service_on=excluded.last_service_on,last_service_km=excluded.last_service_km,timing_belt_on=excluded.timing_belt_on,nct_expiry=excluded.nct_expiry,warranty_months=excluded.warranty_months,has_logbook=excluded.has_logbook,equipment=excluded.equipment,condition_notes=excluded.condition_notes,updated_at=now();
    update vehicles set nct_expiry=nullif(p_data->>'nct_expiry','')::date,warranty_months=nullif(p_data->>'warranty_months','')::integer where id=p_vehicle;
  elsif p_kind='service' then
    if coalesce(length(trim(p_data->>'description')),0)<3 or nullif(p_data->>'serviced_on','') is null or (p_data->>'serviced_on')::date>current_date then raise exception 'invalid_service'; end if;
    insert into vehicle_service_history(dealer_id,vehicle_id,serviced_on,km,description,provider,reference,created_by)
    values(p_dealer,p_vehicle,(p_data->>'serviced_on')::date,nullif(p_data->>'km','')::integer,left(p_data->>'description',2000),left(p_data->>'provider',120),left(p_data->>'reference',120),auth.uid());
  else raise exception 'invalid_command'; end if;
  insert into audit_logs(dealer_id,user_id,action,entity,entity_id,meta) values(p_dealer,auth.uid(),'vehicle_'||p_kind,'vehicle',p_vehicle,jsonb_build_object('before',previous,'after',p_data));
end $$;
revoke all on function public.save_vehicle_details(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.save_vehicle_details(uuid,uuid,text,jsonb) to authenticated;

create function public.purchase_balances(p_dealer uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
  if not commercial_allowed(p_dealer,'purchase') then raise exception 'commercial_not_allowed'; end if;
  return coalesce((select jsonb_agg(to_jsonb(r) order by r.due_on nulls last,r.po_no) from (
    select po.id,po.po_no,po.status,po.due_on,po.finance_company,po.finance_reference,po.trade_credit,po.deal_id,
      c.name vendor,v.year||' '||v.make||' '||v.model||' · '||coalesce(v.registration,'') car,
      coalesce(l.total,0) total,coalesce(p.paid,0) paid,
      coalesce(l.total,0)-po.trade_credit-coalesce(p.paid,0) outstanding,
      po.settlement_due-coalesce(p.finance,0) finance_outstanding,
      coalesce(l.total,0)-po.trade_credit-po.settlement_due-coalesce(p.vendor,0) vendor_outstanding
    from purchase_orders po left join customers c on c.id=po.vendor_id and c.dealer_id=po.dealer_id
    left join vehicles v on v.id=po.vehicle_id and v.dealer_id=po.dealer_id
    left join lateral(select sum(gross) total from po_lines where po_id=po.id) l on true
    left join lateral(select sum(amount) paid,sum(amount) filter(where recipient='finance') finance,sum(amount) filter(where recipient='vendor') vendor from po_payments where po_id=po.id) p on true
    where po.dealer_id=p_dealer and po.status<>'cancelled'
  ) r),'[]');
end $$;
revoke all on function public.purchase_balances(uuid) from public,anon;
grant execute on function public.purchase_balances(uuid) to authenticated;

-- Legacy editors must not modify a ledger-linked commercial record independently.
create function public.guard_legacy_commercial() returns trigger language plpgsql set search_path=public as $$
declare vid uuid;
begin
  if current_user in ('authenticated','anon') then
    if tg_table_name='vehicles' then
      vid:=old.id;
      if tg_op='DELETE' or new.status is distinct from old.status then
        if exists(select 1 from deal_orders where vehicle_id=vid and kind='sale') then raise exception 'use_deal_workflow'; end if;
      end if;
    else
      vid:=case when tg_op='DELETE' then old.vehicle_id else new.vehicle_id end;
      if exists(select 1 from deal_orders where vehicle_id=vid) or exists(select 1 from purchase_orders where vehicle_id=vid) then raise exception 'use_commercial_workflow'; end if;
    end if;
  end if;
  if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger guard_legacy_vehicle before update or delete on public.vehicles for each row execute function public.guard_legacy_commercial();
create trigger guard_legacy_finance before insert or update or delete on public.vehicle_deals for each row execute function public.guard_legacy_commercial();

create function public.deal_balances(p_dealer uuid,p_deal uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
  if not commercial_allowed(p_dealer,'read') or not exists(select 1 from deals where id=p_deal and dealer_id=p_dealer) then raise exception 'commercial_not_allowed'; end if;
  return commercial_totals(p_deal);
end $$;
revoke all on function public.deal_balances(uuid,uuid) from public,anon;
grant execute on function public.deal_balances(uuid,uuid) to authenticated;
