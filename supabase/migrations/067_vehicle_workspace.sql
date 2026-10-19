-- Vehicle detail fields and the actions shown on the stock record.
alter table public.vehicles
  add column if not exists website_visible boolean not null default true,
  add column if not exists featured boolean not null default false,
  add column if not exists location_id uuid references public.dealer_locations(id);
update public.vehicles v set location_id=l.id
from public.dealer_locations l
where v.dealer_id=l.dealer_id and l.is_primary and v.location_id is null;
create index if not exists vehicles_location_idx on public.vehicles(dealer_id,location_id);

alter table public.vehicle_details
  add column if not exists first_registered_on date,
  add column if not exists local_registered_on date,
  add column if not exists original_registration text,
  add column if not exists tax_expiry date,
  add column if not exists co2_g_km integer check(co2_g_km between 0 and 1000),
  add column if not exists gross_weight_kg numeric(8,2) check(gross_weight_kg >= 0),
  add column if not exists body_length_mm numeric(8,2) check(body_length_mm >= 0),
  add column if not exists engine_no text,
  add column if not exists doors text,
  add column if not exists metallic_paint boolean not null default false,
  add column if not exists key_peg_ref text,
  add column if not exists hp_check_status text not null default 'not_checked'
    check(hp_check_status in ('not_checked','clear','finance_recorded','attention')),
  add column if not exists vlc_status text,
  add column if not exists vlc_number text,
  add column if not exists repair_notes text,
  add column if not exists internal_notes text,
  add column if not exists yard text,
  add column if not exists tags text[] not null default '{}';

create table public.vehicle_trade_prices(
  vehicle_id uuid primary key references public.vehicles(id) on delete cascade,
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  trade_price numeric(12,2) check(trade_price >= 0),
  updated_at timestamptz not null default now()
);
alter table public.vehicle_trade_prices enable row level security;
revoke all on public.vehicle_trade_prices from anon,authenticated;
grant select on public.vehicle_trade_prices to authenticated;
create policy vehicle_trade_prices_read on public.vehicle_trade_prices for select
using(public.commercial_allowed(dealer_id,'cost'));

-- Separate operational log, so a hold, loan or workshop request has an actor and history.
create table public.vehicle_workspace_events(
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  kind text not null check(kind in ('hold','loan','external_repair','event','workshop_request')),
  status text not null default 'open' check(status in ('open','closed')),
  title text not null check(char_length(trim(title)) between 2 and 120),
  note text,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  closed_by uuid references auth.users(id),
  closed_at timestamptz
);
create index vehicle_workspace_events_vehicle_idx on public.vehicle_workspace_events(dealer_id,vehicle_id,created_at desc);
create unique index vehicle_one_active_hold on public.vehicle_workspace_events(vehicle_id) where kind='hold' and status='open';
alter table public.vehicle_workspace_events enable row level security;
revoke all on public.vehicle_workspace_events from anon,authenticated;
grant select on public.vehicle_workspace_events to authenticated;
create policy vehicle_workspace_events_read on public.vehicle_workspace_events for select
using(public.commercial_allowed(dealer_id,'read'));

-- A hold is an actual sale constraint, not only a disabled button in the browser.
create function public.guard_held_vehicle_sale() returns trigger language plpgsql set search_path=public as $$
begin
  if new.kind='sale' and exists(select 1 from public.vehicle_workspace_events e
    where e.vehicle_id=new.vehicle_id and e.dealer_id=new.dealer_id and e.kind='hold' and e.status='open')
    then raise exception 'vehicle_on_hold'; end if;
  return new;
end $$;
create trigger guard_held_vehicle_sale before insert on public.deal_orders
  for each row execute function public.guard_held_vehicle_sale();

create table public.vehicle_checks(
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  code text not null check(code in ('identity','finance','mechanical','documents','photos','road_test')),
  status text not null default 'pending' check(status in ('pending','passed','attention')),
  note text,
  checked_by uuid references auth.users(id),
  checked_at timestamptz,
  primary key(vehicle_id,code)
);
alter table public.vehicle_checks enable row level security;
revoke all on public.vehicle_checks from anon,authenticated;
grant select on public.vehicle_checks to authenticated;
create policy vehicle_checks_read on public.vehicle_checks for select
using(public.commercial_allowed(dealer_id,'read'));

-- Keep public listing controlled by the new vehicle-level visibility flag.
drop policy if exists "vehicles public via website" on public.vehicles;
create policy "vehicles public via website" on public.vehicles for select
using(stock_class='main' and status in ('ready_for_sale','reserved')
  and website_visible and public.website_is_published(dealer_id));
grant select(vehicle_no,website_visible,featured,location_id) on public.vehicles to authenticated;
grant select(website_visible) on public.vehicles to anon;

create function public.vehicle_workspace_command(
  p_dealer uuid,p_vehicle uuid,p_command text,p_data jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare current_vehicle public.vehicles; current_event public.vehicle_workspace_events;
  event_id uuid; current_status text; row_before jsonb; result jsonb;
begin
  if auth.uid() is null or coalesce(public.user_role_in(p_dealer)::text,'') not in ('owner','admin')
    or not public.commercial_allowed(p_dealer,'work') then raise exception 'vehicle_action_not_allowed'; end if;
  if p_data is null or octet_length(p_data::text)>12000 then raise exception 'invalid_vehicle_data'; end if;
  select * into current_vehicle from public.vehicles where id=p_vehicle and dealer_id=p_dealer for update;
  if not found then raise exception 'vehicle_missing'; end if;
  if p_command='update' then
    if coalesce(length(trim(p_data->>'make')),0)<2 or coalesce(length(trim(p_data->>'model')),0)<1
      or coalesce(length(trim(p_data->>'registration')),0)<2
      or (p_data->>'year')::int not between 1950 and 2100
      or (p_data->>'km')::int<0
      or (p_data->>'fuel') not in ('petrol','diesel','hybrid','electric','other')
      or (p_data->>'transmission') not in ('manual','automatic')
      or (p_data->>'stock_class') not in ('main','trade') then raise exception 'invalid_vehicle_data'; end if;
    if p_data->>'location_id' is not null and p_data->>'location_id'<>''
      and not exists(select 1 from public.dealer_locations where id=(p_data->>'location_id')::uuid and dealer_id=p_dealer and active)
      then raise exception 'invalid_location'; end if;
    if exists(select 1 from public.vehicles
      where dealer_id=p_dealer and id<>p_vehicle and status<>'sold'
        and lower(regexp_replace(registration,'[^a-zA-Z0-9]','','g'))=
          lower(regexp_replace(p_data->>'registration','[^a-zA-Z0-9]','','g')))
      then raise exception 'duplicate_registration'; end if;
    row_before:=jsonb_build_object('vehicle',to_jsonb(current_vehicle),
      'details',(select to_jsonb(d) from public.vehicle_details d where d.vehicle_id=p_vehicle),
      'trade_price',(select trade_price from public.vehicle_trade_prices where vehicle_id=p_vehicle));
    update public.vehicles set
      make=left(trim(p_data->>'make'),60),model=left(trim(p_data->>'model'),80),
      year=(p_data->>'year')::int,km=(p_data->>'km')::int,
      registration=upper(left(trim(p_data->>'registration'),20)),
      fuel=(p_data->>'fuel')::public.fuel_type,
      transmission=(p_data->>'transmission')::public.transmission_type,
      sale_price=nullif(p_data->>'sale_price','')::numeric,
      stock_class=p_data->>'stock_class',
      location_id=coalesce(nullif(p_data->>'location_id','')::uuid,location_id),
      website_visible=coalesce((p_data->>'website_visible')::boolean,false),
      featured=coalesce((p_data->>'featured')::boolean,false),
      description=left(p_data->>'description',2000),updated_at=now()
      where id=p_vehicle;
    insert into public.vehicle_details(vehicle_id,dealer_id) values(p_vehicle,p_dealer)
      on conflict(vehicle_id) do nothing;
    update public.vehicle_details set
      vin=upper(left(p_data->>'vin',17)),trim=left(p_data->>'trim',80),
      body_style=left(p_data->>'body_style',40),colour=left(p_data->>'colour',40),
      engine_cc=nullif(p_data->>'engine_cc','')::int,
      keys_count=nullif(p_data->>'keys_count','')::int,
      previous_owners=nullif(p_data->>'previous_owners','')::int,
      service_history=coalesce(nullif(p_data->>'service_history',''),'unknown'),
      last_service_on=nullif(p_data->>'last_service_on','')::date,
      last_service_km=nullif(p_data->>'last_service_km','')::int,
      timing_belt_on=nullif(p_data->>'timing_belt_on','')::date,
      nct_expiry=nullif(p_data->>'nct_expiry','')::date,
      warranty_months=nullif(p_data->>'warranty_months','')::int,
      has_logbook=coalesce((p_data->>'has_logbook')::boolean,false),
      equipment=array(select jsonb_array_elements_text(coalesce(p_data->'equipment','[]'::jsonb))),
      condition_notes=left(p_data->>'condition_notes',2000),
      first_registered_on=nullif(p_data->>'first_registered_on','')::date,
      local_registered_on=nullif(p_data->>'local_registered_on','')::date,
      original_registration=upper(left(p_data->>'original_registration',20)),
      tax_expiry=nullif(p_data->>'tax_expiry','')::date,
      co2_g_km=nullif(p_data->>'co2_g_km','')::int,
      gross_weight_kg=nullif(p_data->>'gross_weight_kg','')::numeric,
      body_length_mm=nullif(p_data->>'body_length_mm','')::numeric,
      engine_no=left(p_data->>'engine_no',80),
      doors=left(p_data->>'doors',30),
      metallic_paint=coalesce((p_data->>'metallic_paint')::boolean,false),
      key_peg_ref=left(p_data->>'key_peg_ref',60),
      hp_check_status=coalesce(nullif(p_data->>'hp_check_status',''),'not_checked'),
      vlc_status=left(p_data->>'vlc_status',60),
      vlc_number=left(p_data->>'vlc_number',60),
      repair_notes=left(p_data->>'repair_notes',2000),
      internal_notes=left(p_data->>'internal_notes',2000),
      yard=left(p_data->>'yard',120),
      tags=array(select jsonb_array_elements_text(coalesce(p_data->'tags','[]'::jsonb))),
      updated_at=now()
      where vehicle_id=p_vehicle and dealer_id=p_dealer;
    insert into public.vehicle_trade_prices(vehicle_id,dealer_id,trade_price)
    values(p_vehicle,p_dealer,nullif(p_data->>'trade_price','')::numeric)
    on conflict(vehicle_id) do update set trade_price=excluded.trade_price,updated_at=now();
    update public.vehicles set nct_expiry=nullif(p_data->>'nct_expiry','')::date,
      warranty_months=nullif(p_data->>'warranty_months','')::int where id=p_vehicle;
    result:=jsonb_build_object('id',p_vehicle);
  elsif p_command='open_activity' then
    if p_data->>'kind' not in ('hold','loan','external_repair','event','workshop_request')
      or coalesce(length(trim(p_data->>'title')),0)<2 then raise exception 'invalid_activity'; end if;
    if current_vehicle.status='sold' and p_data->>'kind' in ('hold','loan','external_repair')
      then raise exception 'vehicle_already_sold'; end if;
    if p_data->>'kind'='hold' and exists(select 1 from public.vehicle_workspace_events
      where vehicle_id=p_vehicle and kind='hold' and status='open') then raise exception 'vehicle_already_on_hold'; end if;
    insert into public.vehicle_workspace_events(dealer_id,vehicle_id,kind,title,note,starts_at,ends_at,created_by)
    values(p_dealer,p_vehicle,p_data->>'kind',left(trim(p_data->>'title'),120),
      left(p_data->>'note',2000),nullif(p_data->>'starts_at','')::timestamptz,
      nullif(p_data->>'ends_at','')::timestamptz,auth.uid()) returning id into event_id;
    result:=jsonb_build_object('id',event_id);
  elsif p_command='close_activity' then
    select * into current_event from public.vehicle_workspace_events
      where id=(p_data->>'event_id')::uuid and dealer_id=p_dealer and vehicle_id=p_vehicle and status='open' for update;
    if not found then raise exception 'activity_missing'; end if;
    update public.vehicle_workspace_events set status='closed',closed_by=auth.uid(),closed_at=now()
      where id=current_event.id;
    result:=jsonb_build_object('id',current_event.id);
  elsif p_command='check' then
    if p_data->>'code' not in ('identity','finance','mechanical','documents','photos','road_test')
      or p_data->>'status' not in ('pending','passed','attention') then raise exception 'invalid_check'; end if;
    insert into public.vehicle_checks(dealer_id,vehicle_id,code,status,note,checked_by,checked_at)
    values(p_dealer,p_vehicle,p_data->>'code',p_data->>'status',left(p_data->>'note',1000),auth.uid(),now())
    on conflict(vehicle_id,code) do update set status=excluded.status,note=excluded.note,
      checked_by=excluded.checked_by,checked_at=excluded.checked_at;
    result:=jsonb_build_object('code',p_data->>'code','status',p_data->>'status');
  else raise exception 'invalid_vehicle_command'; end if;
  insert into public.audit_logs(dealer_id,user_id,action,entity,entity_id,meta)
  values(p_dealer,auth.uid(),'vehicle_workspace_'||p_command,'vehicle',p_vehicle,
    jsonb_build_object('before',row_before,'input',p_data,'result',result));
  return result;
end $$;
revoke all on function public.vehicle_workspace_command(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.vehicle_workspace_command(uuid,uuid,text,jsonb) to authenticated;
