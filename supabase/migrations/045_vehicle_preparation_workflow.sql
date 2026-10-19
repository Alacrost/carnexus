-- Operational preparation queue. Preparation membership is a scoped capability,
-- not a new global role and does not grant CRM, sales or cost access.

create table public.preparation_team_members(
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  added_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key(dealer_id,user_id),
  foreign key(dealer_id,user_id) references public.dealer_members(dealer_id,user_id)
);
create table public.vehicle_preparations(
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','in_progress','completed')),
  assigned_to uuid references auth.users(id),
  version integer not null default 1,
  started_at timestamptz,
  completed_at timestamptz,
  completed_by uuid references auth.users(id),
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(dealer_id,vehicle_id)
);
create table public.preparation_items(
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  preparation_id uuid not null references public.vehicle_preparations(id) on delete cascade,
  category text not null check(category in ('cleaning','photos','service','maintenance','bodywork','other')),
  title text not null check(char_length(trim(title)) between 2 and 120),
  status text not null default 'pending' check(status in ('pending','in_progress','done','skipped')),
  required boolean not null default false,
  notes text check(char_length(notes)<=1000),
  position integer not null default 0,
  completed_by uuid references auth.users(id),
  completed_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.preparation_requests(
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  request_id uuid not null,
  command text not null,
  input jsonb not null,
  result jsonb not null,
  primary key(dealer_id,request_id)
);

create function public.preparation_allowed(p_dealer uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select coalesce(public.user_role_in(p_dealer)::text in ('owner','admin'),false)
    or exists(select 1 from public.preparation_team_members t join public.dealer_members m
      on m.dealer_id=t.dealer_id and m.user_id=t.user_id and m.status='active'
      where t.dealer_id=p_dealer and t.user_id=auth.uid());
$$;
revoke all on function public.preparation_allowed(uuid) from public,anon;
grant execute on function public.preparation_allowed(uuid) to authenticated;

alter table public.preparation_team_members enable row level security;
alter table public.vehicle_preparations enable row level security;
alter table public.preparation_items enable row level security;
alter table public.preparation_requests enable row level security;
revoke all on public.preparation_team_members,public.vehicle_preparations,public.preparation_items,public.preparation_requests from anon,authenticated;
grant select on public.preparation_team_members,public.vehicle_preparations,public.preparation_items to authenticated;
create policy preparation_team_read on public.preparation_team_members for select using(public.preparation_allowed(dealer_id));
create policy vehicle_preparation_read on public.vehicle_preparations for select using(public.preparation_allowed(dealer_id));
create policy preparation_item_read on public.preparation_items for select using(public.preparation_allowed(dealer_id));

create function public.seed_vehicle_preparation() returns trigger
language plpgsql security definer set search_path=public as $$
declare prep uuid;
begin
  if new.status='preparation' and (tg_op='INSERT' or old.status is distinct from new.status) then
    insert into public.vehicle_preparations(dealer_id,vehicle_id) values(new.dealer_id,new.id)
      on conflict(dealer_id,vehicle_id) do update set status='pending',version=vehicle_preparations.version+1,
        completed_at=null,completed_by=null,notified_at=null,updated_at=now()
      returning id into prep;
    if not exists(select 1 from public.preparation_items where preparation_id=prep and category='cleaning' and required) then
      insert into public.preparation_items(dealer_id,preparation_id,category,title,required,position)
      values(new.dealer_id,prep,'cleaning','Cleaning and valet',true,10);
    end if;
    if not exists(select 1 from public.preparation_items where preparation_id=prep and category='photos' and required) then
      insert into public.preparation_items(dealer_id,preparation_id,category,title,required,position)
      values(new.dealer_id,prep,'photos','Vehicle photos',true,20);
    end if;
  end if;
  return new;
end $$;
create trigger seed_vehicle_preparation after insert or update of status on public.vehicles
  for each row execute function public.seed_vehicle_preparation();

do $$ declare v record; begin
  for v in select * from public.vehicles where status='preparation' loop
    insert into public.vehicle_preparations(dealer_id,vehicle_id) values(v.dealer_id,v.id) on conflict do nothing;
  end loop;
end $$;
insert into public.preparation_items(dealer_id,preparation_id,category,title,required,position)
select dealer_id,id,'cleaning','Cleaning and valet',true,10 from public.vehicle_preparations on conflict do nothing;
insert into public.preparation_items(dealer_id,preparation_id,category,title,required,position)
select dealer_id,id,'photos','Vehicle photos',true,20 from public.vehicle_preparations;

create function public.preparation_command(p_dealer uuid,p_command text,p_preparation uuid,p_input jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare prep public.vehicle_preparations; item public.preparation_items; cached public.preparation_requests;
  result jsonb; assignee uuid; next_status text;
begin
  if auth.uid() is null or not public.preparation_allowed(p_dealer) then raise exception 'preparation_not_allowed'; end if;
  if p_request is null or p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>12000 then raise exception 'invalid_request'; end if;
  select * into cached from public.preparation_requests where dealer_id=p_dealer and request_id=p_request;
  if found then
    if cached.command<>p_command or cached.input<>jsonb_build_object('preparation_id',p_preparation,'data',p_input) then raise exception 'request_reused'; end if;
    return cached.result;
  end if;
  select * into prep from public.vehicle_preparations where id=p_preparation and dealer_id=p_dealer for update;
  if not found then raise exception 'preparation_missing'; end if;
  if prep.status='completed' then raise exception 'preparation_closed'; end if;
  if (p_input->>'expectedVersion')::integer is distinct from prep.version then raise exception 'stale_preparation'; end if;

  if p_command='add_item' then
    if p_input->>'category' not in ('cleaning','photos','service','maintenance','bodywork','other')
      or char_length(trim(p_input->>'title')) not between 2 and 120 then raise exception 'invalid_preparation_item'; end if;
    insert into public.preparation_items(dealer_id,preparation_id,category,title,required,notes,position,created_by)
    values(p_dealer,prep.id,p_input->>'category',trim(p_input->>'title'),false,nullif(trim(p_input->>'notes'),''),100,auth.uid()) returning id into assignee;
    update public.vehicle_preparations set status='in_progress',started_at=coalesce(started_at,now()),version=version+1,updated_at=now() where id=prep.id;
    result:=jsonb_build_object('id',assignee);
  elsif p_command='set_item' then
    select * into item from public.preparation_items where id=(p_input->>'itemId')::uuid and preparation_id=prep.id and dealer_id=p_dealer for update;
    if not found then raise exception 'preparation_item_missing'; end if;
    next_status:=p_input->>'status';
    if next_status not in ('pending','in_progress','done','skipped') or (item.required and next_status='skipped') then raise exception 'invalid_preparation_status'; end if;
    if item.category='photos' and next_status='done' and not exists(select 1 from public.vehicle_photos where dealer_id=p_dealer and vehicle_id=prep.vehicle_id) then raise exception 'preparation_photos_required'; end if;
    update public.preparation_items set status=next_status,notes=coalesce(nullif(trim(p_input->>'notes'),''),notes),
      completed_by=case when next_status='done' then auth.uid() else null end,
      completed_at=case when next_status='done' then now() else null end where id=item.id;
    update public.vehicle_preparations set status='in_progress',started_at=coalesce(started_at,now()),version=version+1,updated_at=now() where id=prep.id;
    result:=jsonb_build_object('id',item.id);
  elsif p_command='assign' then
    if public.user_role_in(p_dealer)::text not in ('owner','admin') then raise exception 'preparation_admin_required'; end if;
    assignee:=nullif(p_input->>'assignedTo','')::uuid;
    if assignee is not null and not exists(select 1 from public.preparation_team_members t join public.dealer_members m on m.dealer_id=t.dealer_id and m.user_id=t.user_id where t.dealer_id=p_dealer and t.user_id=assignee and m.status='active') then raise exception 'invalid_preparation_assignee'; end if;
    update public.vehicle_preparations set assigned_to=assignee,version=version+1,updated_at=now() where id=prep.id;
    result:=jsonb_build_object('id',prep.id);
  elsif p_command='complete' then
    if exists(select 1 from public.preparation_items where preparation_id=prep.id and (status not in ('done','skipped') or (required and status<>'done'))) then raise exception 'preparation_items_pending'; end if;
    update public.vehicle_preparations set status='completed',completed_at=now(),completed_by=auth.uid(),notified_at=now(),version=version+1,updated_at=now() where id=prep.id;
    update public.vehicles set status='ready_for_sale' where id=prep.vehicle_id and dealer_id=p_dealer and status='preparation';
    insert into public.audit_logs(dealer_id,user_id,action,entity,entity_id,meta) values(p_dealer,auth.uid(),'vehicle_preparation_completed','vehicle',prep.vehicle_id,jsonb_build_object('preparation_id',prep.id));
    result:=jsonb_build_object('id',prep.id,'status','completed','vehicleId',prep.vehicle_id);
  else raise exception 'invalid_command'; end if;
  insert into public.preparation_requests values(p_dealer,p_request,p_command,jsonb_build_object('preparation_id',p_preparation,'data',p_input),result);
  return result;
end $$;
revoke all on function public.preparation_command(uuid,text,uuid,jsonb,uuid) from public,anon;
grant execute on function public.preparation_command(uuid,text,uuid,jsonb,uuid) to authenticated;

create function public.set_preparation_team_member(p_dealer uuid,p_user uuid,p_enabled boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or public.user_role_in(p_dealer)::text not in ('owner','admin') then raise exception 'preparation_admin_required'; end if;
  if not exists(select 1 from public.dealer_members where dealer_id=p_dealer and user_id=p_user and status='active') then raise exception 'invalid_preparation_assignee'; end if;
  if p_enabled then
    insert into public.preparation_team_members(dealer_id,user_id,added_by) values(p_dealer,p_user,auth.uid()) on conflict do nothing;
  else
    delete from public.preparation_team_members where dealer_id=p_dealer and user_id=p_user;
    update public.vehicle_preparations set assigned_to=null,version=version+1,updated_at=now() where dealer_id=p_dealer and assigned_to=p_user and status<>'completed';
  end if;
  insert into public.audit_logs(dealer_id,user_id,action,entity,entity_id,meta)
  values(p_dealer,auth.uid(),case when p_enabled then 'preparation_member_added' else 'preparation_member_removed' end,'member',p_user,'{}');
end $$;
revoke all on function public.set_preparation_team_member(uuid,uuid,boolean) from public,anon;
grant execute on function public.set_preparation_team_member(uuid,uuid,boolean) to authenticated;
