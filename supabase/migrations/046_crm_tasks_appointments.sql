-- CRM work queue and transactional appointments. Existing viewings are evolved,
-- not replaced, and Dublin local wall time is converted in PostgreSQL.

alter table public.viewings
  add column lead_id uuid references public.leads(id),
  add column customer_id uuid references public.customers(id),
  add column deal_id uuid references public.deals(id),
  add column assigned_to uuid references auth.users(id),
  add column version integer not null default 1,
  add column updated_at timestamptz not null default now(),
  add column completed_at timestamptz,
  add column cancelled_at timestamptz;

create table public.crm_tasks(
  id uuid primary key default gen_random_uuid(),dealer_id uuid not null references public.dealers(id) on delete cascade,
  title text not null check(char_length(trim(title)) between 2 and 160),
  type text not null default 'follow_up' check(type in ('follow_up','call','email','document','finance','handover','other')),
  status text not null default 'open' check(status in ('open','in_progress','completed','cancelled')),
  priority text not null default 'normal' check(priority in ('low','normal','high','urgent')),
  due_at timestamptz not null,assigned_to uuid references auth.users(id),created_by uuid references auth.users(id),
  completed_by uuid references auth.users(id),completed_at timestamptz,cancelled_at timestamptz,
  customer_id uuid references public.customers(id),lead_id uuid references public.leads(id),deal_id uuid references public.deals(id),
  notes text check(char_length(notes)<=2000),version integer not null default 1,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  check(customer_id is not null or lead_id is not null or deal_id is not null)
);
create index crm_tasks_queue_idx on public.crm_tasks(dealer_id,status,due_at);
create table public.crm_work_events(
  id uuid primary key default gen_random_uuid(),dealer_id uuid not null references public.dealers(id) on delete cascade,
  task_id uuid references public.crm_tasks(id),viewing_id uuid references public.viewings(id),
  kind text not null,detail jsonb not null default '{}',created_by uuid references auth.users(id),created_at timestamptz not null default now(),
  check((task_id is not null)::int+(viewing_id is not null)::int=1)
);
create table public.crm_work_requests(dealer_id uuid references public.dealers(id),request_id uuid,command text,input jsonb,result jsonb,primary key(dealer_id,request_id));

do $$ declare p record; begin for p in select policyname from pg_policies where schemaname='public' and tablename='viewings' loop execute format('drop policy %I on public.viewings',p.policyname); end loop; end $$;
alter table public.crm_tasks enable row level security;alter table public.crm_work_events enable row level security;alter table public.crm_work_requests enable row level security;
revoke all on public.viewings,public.crm_tasks,public.crm_work_events,public.crm_work_requests from anon,authenticated;
grant select on public.viewings,public.crm_tasks,public.crm_work_events to authenticated;
create policy crm_viewings_read on public.viewings for select using(public.crm_allowed(dealer_id,'read'));
create policy crm_tasks_read on public.crm_tasks for select using(public.crm_allowed(dealer_id,'read'));
create policy crm_work_events_read on public.crm_work_events for select using(public.crm_allowed(dealer_id,'read'));

create function public.crm_work_command(p_dealer uuid,p_command text,p_id uuid,p_input jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare t public.crm_tasks;v public.viewings;cached public.crm_work_requests;result jsonb;
  lead uuid;customer uuid;deal uuid;assignee uuid;due timestamptz;next_status text;
begin
  if auth.uid() is null or not public.crm_allowed(p_dealer,'work') then raise exception 'crm_not_allowed'; end if;
  if p_request is null or p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>16000 then raise exception 'invalid_request'; end if;
  select * into cached from public.crm_work_requests where dealer_id=p_dealer and request_id=p_request;
  if found then if cached.command<>p_command or cached.input<>jsonb_build_object('id',p_id,'data',p_input) then raise exception 'request_reused'; end if;return cached.result;end if;
  lead:=nullif(p_input->>'leadId','')::uuid;customer:=nullif(p_input->>'customerId','')::uuid;deal:=nullif(p_input->>'dealId','')::uuid;assignee:=nullif(p_input->>'assignedTo','')::uuid;
  if lead is not null then select customer_id into customer from public.leads where id=lead and dealer_id=p_dealer; if not found then raise exception 'lead_not_found'; end if; end if;
  if customer is not null and not exists(select 1 from public.customers where id=customer and dealer_id=p_dealer and deleted_at is null) then raise exception 'invalid_customer'; end if;
  if deal is not null and not exists(select 1 from public.deals where id=deal and dealer_id=p_dealer) then raise exception 'deal_missing'; end if;
  if assignee is not null and not exists(select 1 from public.dealer_members where dealer_id=p_dealer and user_id=assignee and status='active' and role in ('owner','admin','sales')) then raise exception 'invalid_assignee'; end if;
  if assignee is not null and assignee<>auth.uid() and not public.crm_allowed(p_dealer,'assign') then raise exception 'assignment_not_allowed'; end if;

  if p_command='create_task' then
    if lead is null and customer is null and deal is null then raise exception 'crm_link_required'; end if;
    due:=(p_input->>'dueLocal')::timestamp at time zone 'Europe/Dublin';
    if char_length(trim(p_input->>'title')) not between 2 and 160 or p_input->>'type' not in ('follow_up','call','email','document','finance','handover','other') or p_input->>'priority' not in ('low','normal','high','urgent') then raise exception 'invalid_task'; end if;
    insert into public.crm_tasks(dealer_id,title,type,priority,due_at,assigned_to,created_by,customer_id,lead_id,deal_id,notes)
    values(p_dealer,trim(p_input->>'title'),p_input->>'type',p_input->>'priority',due,coalesce(assignee,auth.uid()),auth.uid(),customer,lead,deal,nullif(trim(p_input->>'notes'),'')) returning * into t;
    insert into public.crm_work_events(dealer_id,task_id,kind,detail,created_by) values(p_dealer,t.id,'created',jsonb_build_object('title',t.title,'due_at',t.due_at),auth.uid());result:=jsonb_build_object('id',t.id);
  elsif p_command='task_status' then
    select * into t from public.crm_tasks where id=p_id and dealer_id=p_dealer for update;if not found then raise exception 'task_missing';end if;
    if (p_input->>'expectedVersion')::int is distinct from t.version then raise exception 'stale_task';end if;next_status:=p_input->>'status';if next_status not in ('open','in_progress','completed','cancelled') then raise exception 'invalid_task';end if;
    update public.crm_tasks set status=next_status,completed_at=case when next_status='completed' then now() else null end,completed_by=case when next_status='completed' then auth.uid() else null end,cancelled_at=case when next_status='cancelled' then now() else null end,version=version+1,updated_at=now() where id=t.id;
    insert into public.crm_work_events(dealer_id,task_id,kind,detail,created_by) values(p_dealer,t.id,'status_changed',jsonb_build_object('before',t.status,'after',next_status),auth.uid());result:=jsonb_build_object('id',t.id);
  elsif p_command='create_viewing' then
    due:=(p_input->>'scheduledLocal')::timestamp at time zone 'Europe/Dublin';
    if char_length(trim(p_input->>'leadName')) not between 2 and 120 then raise exception 'invalid_appointment';end if;
    if nullif(p_input->>'vehicleId','') is not null and not exists(select 1 from public.vehicles where id=(p_input->>'vehicleId')::uuid and dealer_id=p_dealer) then raise exception 'invalid_vehicle';end if;
    insert into public.viewings(dealer_id,lead_name,phone,vehicle_id,vehicle_label,scheduled_for,notes,responsible,created_by,lead_id,customer_id,deal_id,assigned_to)
    values(p_dealer,trim(p_input->>'leadName'),nullif(trim(p_input->>'phone'),''),nullif(p_input->>'vehicleId','')::uuid,nullif(trim(p_input->>'vehicleLabel'),''),due,nullif(trim(p_input->>'notes'),''),nullif(trim(p_input->>'responsible'),''),auth.uid(),lead,customer,deal,assignee) returning * into v;
    insert into public.crm_work_events(dealer_id,viewing_id,kind,detail,created_by) values(p_dealer,v.id,'created',jsonb_build_object('scheduled_for',v.scheduled_for),auth.uid());result:=jsonb_build_object('id',v.id,'scheduledFor',v.scheduled_for);
  elsif p_command='viewing_status' then
    select * into v from public.viewings where id=p_id and dealer_id=p_dealer for update;if not found then raise exception 'appointment_missing';end if;
    if (p_input->>'expectedVersion')::int is distinct from v.version then raise exception 'stale_appointment';end if;next_status:=p_input->>'status';if next_status not in ('booked','done','no_show','cancelled') then raise exception 'invalid_appointment';end if;
    update public.viewings set status=next_status,completed_at=case when next_status='done' then now() else null end,cancelled_at=case when next_status='cancelled' then now() else null end,version=version+1,updated_at=now() where id=v.id;
    insert into public.crm_work_events(dealer_id,viewing_id,kind,detail,created_by) values(p_dealer,v.id,'status_changed',jsonb_build_object('before',v.status,'after',next_status),auth.uid());result:=jsonb_build_object('id',v.id);
  else raise exception 'invalid_command';end if;
  insert into public.crm_work_requests values(p_dealer,p_request,p_command,jsonb_build_object('id',p_id,'data',p_input),result);return result;
end $$;
revoke all on function public.crm_work_command(uuid,text,uuid,jsonb,uuid) from public,anon;
grant execute on function public.crm_work_command(uuid,text,uuid,jsonb,uuid) to authenticated;
