-- Dealer-scoped internal Message Centre. Messages are immutable, participants
-- are active dealer members, and record context never grants record access.

create table public.message_threads(
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  kind text not null default 'direct' check(kind in ('direct','system')),
  title text check(title is null or char_length(title)<=120),
  direct_key text,
  created_by uuid references auth.users(id),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index message_threads_direct_key on public.message_threads(dealer_id,direct_key)
  where direct_key is not null;
create index message_threads_recent on public.message_threads(dealer_id,last_message_at desc);

create table public.message_participants(
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key(thread_id,user_id)
);
create index message_participants_user on public.message_participants(dealer_id,user_id,thread_id);

create table public.internal_messages(
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  sender_id uuid references auth.users(id),
  kind text not null default 'user' check(kind in ('user','system')),
  body text not null check(char_length(trim(body)) between 1 and 4000),
  context_type text check(context_type is null or context_type in ('deal','lead','customer','vehicle')),
  context_id uuid,
  context_label text check(context_label is null or char_length(context_label)<=180),
  created_at timestamptz not null default now(),
  check((context_type is null)=(context_id is null))
);
create index internal_messages_thread on public.internal_messages(thread_id,created_at desc,id desc);

create table public.message_requests(
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  request_id uuid not null,
  command text not null,
  input jsonb not null,
  result jsonb not null,
  primary key(dealer_id,request_id)
);

alter table public.message_threads enable row level security;
alter table public.message_participants enable row level security;
alter table public.internal_messages enable row level security;
alter table public.message_requests enable row level security;
revoke all on public.message_threads,public.message_participants,public.internal_messages,public.message_requests from anon,authenticated;
grant select on public.message_threads,public.message_participants,public.internal_messages to authenticated;

create function public.is_message_participant(p_dealer uuid,p_thread uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select auth.uid() is not null and exists(
    select 1 from public.message_participants mp
    join public.dealer_members dm on dm.dealer_id=mp.dealer_id and dm.user_id=mp.user_id and dm.status='active'
    where mp.dealer_id=p_dealer and mp.thread_id=p_thread and mp.user_id=auth.uid()
  );
$$;
revoke all on function public.is_message_participant(uuid,uuid) from public,anon;
grant execute on function public.is_message_participant(uuid,uuid) to authenticated;

create policy message_threads_read on public.message_threads for select
  using(public.is_message_participant(dealer_id,id));
create policy message_participants_read on public.message_participants for select
  using(public.is_message_participant(dealer_id,thread_id));
create policy internal_messages_read on public.internal_messages for select
  using(public.is_message_participant(dealer_id,thread_id));

create function public.message_unread_count(p_dealer uuid)
returns integer language sql stable security definer set search_path=public as $$
  select case when exists(select 1 from public.dealer_members where dealer_id=p_dealer and user_id=auth.uid() and status='active')
    then coalesce((select count(*)::integer from public.internal_messages m
      join public.message_participants mp on mp.thread_id=m.thread_id and mp.dealer_id=m.dealer_id and mp.user_id=auth.uid()
      where m.dealer_id=p_dealer and m.created_at>coalesce(mp.last_read_at,'epoch'::timestamptz)
        and m.sender_id is distinct from auth.uid()),0)
    else 0 end;
$$;
revoke all on function public.message_unread_count(uuid) from public,anon;
grant execute on function public.message_unread_count(uuid) to authenticated;

create function public.message_command(p_dealer uuid,p_command text,p_id uuid,p_input jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  cached public.message_requests;
  thread public.message_threads;
  target uuid;
  direct text;
  result jsonb;
  message_id uuid;
  context_kind text;
  context_uuid uuid;
  context_label text;
begin
  if auth.uid() is null or not exists(
    select 1 from public.dealer_members where dealer_id=p_dealer and user_id=auth.uid() and status='active'
  ) then raise exception 'message_not_allowed';end if;
  if p_request is null or p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>12000
    then raise exception 'invalid_request';end if;
  select * into cached from public.message_requests where dealer_id=p_dealer and request_id=p_request;
  if found then
    if cached.command<>p_command or cached.input<>jsonb_build_object('id',p_id,'data',p_input) then raise exception 'request_reused';end if;
    return cached.result;
  end if;

  if p_command='start_direct' then
    target:=nullif(p_input->>'targetId','')::uuid;
    if target is null or target=auth.uid() or not exists(
      select 1 from public.dealer_members where dealer_id=p_dealer and user_id=target and status='active'
    ) then raise exception 'invalid_message_recipient';end if;
    direct:=case when auth.uid()::text<target::text then auth.uid()::text||':'||target::text else target::text||':'||auth.uid()::text end;
    insert into public.message_threads(dealer_id,kind,direct_key,created_by)
      values(p_dealer,'direct',direct,auth.uid())
      on conflict(dealer_id,direct_key) where direct_key is not null
      do update set direct_key=excluded.direct_key returning * into thread;
    insert into public.message_participants(dealer_id,thread_id,user_id,last_read_at)
      values(p_dealer,thread.id,auth.uid(),now()),(p_dealer,thread.id,target,null)
      on conflict(thread_id,user_id) do nothing;
    result:=jsonb_build_object('id',thread.id);
  elsif p_command='send' then
    select * into thread from public.message_threads where id=p_id and dealer_id=p_dealer for update;
    if not found or not public.is_message_participant(p_dealer,thread.id) then raise exception 'message_thread_missing';end if;
    if char_length(trim(p_input->>'body')) not between 1 and 4000 then raise exception 'invalid_message';end if;
    context_kind:=nullif(p_input->>'contextType','');
    context_uuid:=nullif(p_input->>'contextId','')::uuid;
    if (context_kind is null) is distinct from (context_uuid is null) or context_kind is not null and context_kind not in ('deal','lead','customer','vehicle')
      then raise exception 'invalid_message_context';end if;
    if context_kind='deal' then
      if not public.commercial_allowed(p_dealer,'read') then raise exception 'message_context_not_allowed';end if;
      select 'Deal '||deal_no into context_label from public.deals where id=context_uuid and dealer_id=p_dealer;
    elsif context_kind='lead' then
      if not public.crm_allowed(p_dealer,'read') then raise exception 'message_context_not_allowed';end if;
      select title into context_label from public.leads where id=context_uuid and dealer_id=p_dealer;
    elsif context_kind='customer' then
      if not public.crm_allowed(p_dealer,'read') then raise exception 'message_context_not_allowed';end if;
      select name into context_label from public.customers where id=context_uuid and dealer_id=p_dealer and deleted_at is null;
    elsif context_kind='vehicle' then
      select concat_ws(' ',year,make,model,nullif(registration,'')) into context_label
      from public.vehicles where id=context_uuid and dealer_id=p_dealer;
    end if;
    if context_kind is not null and context_label is null then raise exception 'message_context_missing';end if;
    insert into public.internal_messages(dealer_id,thread_id,sender_id,kind,body,context_type,context_id,context_label)
      values(p_dealer,thread.id,auth.uid(),'user',trim(p_input->>'body'),context_kind,context_uuid,left(context_label,180))
      returning id into message_id;
    update public.message_threads set last_message_at=now() where id=thread.id;
    update public.message_participants set last_read_at=now() where thread_id=thread.id and user_id=auth.uid();
    result:=jsonb_build_object('id',message_id,'threadId',thread.id);
  elsif p_command='mark_read' then
    if not public.is_message_participant(p_dealer,p_id) then raise exception 'message_thread_missing';end if;
    update public.message_participants set last_read_at=now() where dealer_id=p_dealer and thread_id=p_id and user_id=auth.uid();
    result:=jsonb_build_object('id',p_id,'read',true);
  else raise exception 'invalid_message_command';end if;
  insert into public.message_requests(dealer_id,request_id,command,input,result)
    values(p_dealer,p_request,p_command,jsonb_build_object('id',p_id,'data',p_input),result);
  return result;
end $$;
revoke all on function public.message_command(uuid,text,uuid,jsonb,uuid) from public,anon;
grant execute on function public.message_command(uuid,text,uuid,jsonb,uuid) to authenticated;

create function public.message_centre_overview(p_dealer uuid,p_thread uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare threads jsonb;messages jsonb;members jsonb;
begin
  if auth.uid() is null or not exists(
    select 1 from public.dealer_members where dealer_id=p_dealer and user_id=auth.uid() and status='active'
  ) then raise exception 'message_not_allowed';end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x."lastAt" desc),'[]'::jsonb) into threads from (
    select t.id,t.kind,
      case when t.kind='system' then coalesce(t.title,'Assignments')
        else coalesce(nullif(p.full_name,''),split_part(u.email,'@',1),'Team member') end title,
      coalesce(last_message.body,'No messages yet') "lastBody",t.last_message_at "lastAt",
      (select count(*)::integer from public.internal_messages unread
        where unread.thread_id=t.id and unread.created_at>coalesce(mine.last_read_at,'epoch'::timestamptz)
          and unread.sender_id is distinct from auth.uid()) unread
    from public.message_threads t
    join public.message_participants mine on mine.thread_id=t.id and mine.user_id=auth.uid()
    left join lateral(
      select mp.user_id from public.message_participants mp where mp.thread_id=t.id and mp.user_id<>auth.uid() limit 1
    ) other on true
    left join public.profiles p on p.id=other.user_id left join auth.users u on u.id=other.user_id
    left join lateral(select body from public.internal_messages where thread_id=t.id order by created_at desc,id desc limit 1) last_message on true
    where t.dealer_id=p_dealer order by t.last_message_at desc limit 50
  ) x;
  if p_thread is not null and public.is_message_participant(p_dealer,p_thread) then
    select coalesce(jsonb_agg(to_jsonb(x) order by x."createdAt",x.id),'[]'::jsonb) into messages from (
      select m.id,m.body,m.kind,m.created_at "createdAt",m.sender_id "senderId",
        m.sender_id=auth.uid() mine,coalesce(nullif(p.full_name,''),case when m.sender_id is null then 'AutoNexus' else split_part(u.email,'@',1) end,'Team member') sender,
        m.context_type "contextType",m.context_id "contextId",m.context_label "contextLabel"
      from public.internal_messages m left join public.profiles p on p.id=m.sender_id left join auth.users u on u.id=m.sender_id
      where m.thread_id=p_thread order by m.created_at desc,m.id desc limit 100
    ) x;
  else messages:='[]'::jsonb;end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',dm.user_id,'name',coalesce(nullif(p.full_name,''),split_part(u.email,'@',1),'Team member'),'role',dm.role
  ) order by coalesce(nullif(p.full_name,''),u.email)),'[]'::jsonb) into members
  from public.dealer_members dm left join public.profiles p on p.id=dm.user_id left join auth.users u on u.id=dm.user_id
  where dm.dealer_id=p_dealer and dm.status='active' and dm.user_id<>auth.uid();
  return jsonb_build_object('threads',threads,'messages',messages,'members',members,
    'unreadTotal',public.message_unread_count(p_dealer));
end $$;
revoke all on function public.message_centre_overview(uuid,uuid) from public,anon;
grant execute on function public.message_centre_overview(uuid,uuid) to authenticated;

create function public.create_assignment_notification(
  p_dealer uuid,p_user uuid,p_context_type text,p_context_id uuid,p_label text,p_body text
) returns void language plpgsql security definer set search_path=public as $$
declare v_thread_id uuid;key text:='system:'||p_user::text;
begin
  if p_user is null or not exists(select 1 from public.dealer_members where dealer_id=p_dealer and user_id=p_user and status='active') then return;end if;
  insert into public.message_threads(dealer_id,kind,title,direct_key,created_by)
    values(p_dealer,'system','Assignments',key,null)
    on conflict(dealer_id,direct_key) where direct_key is not null
    do update set last_message_at=now() returning id into v_thread_id;
  insert into public.message_participants(dealer_id,thread_id,user_id) values(p_dealer,v_thread_id,p_user)
    on conflict on constraint message_participants_pkey do nothing;
  insert into public.internal_messages(dealer_id,thread_id,kind,body,context_type,context_id,context_label)
    values(p_dealer,v_thread_id,'system',p_body,p_context_type,p_context_id,left(p_label,180));
  update public.message_threads set last_message_at=now() where id=v_thread_id;
end $$;
revoke all on function public.create_assignment_notification(uuid,uuid,text,uuid,text,text) from public,anon,authenticated;

create function public.notify_lead_assignment() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.assigned_to is not null
    and (tg_op='INSERT' or new.assigned_to is distinct from old.assigned_to)
    and new.assigned_to is distinct from auth.uid() then
    perform public.create_assignment_notification(new.dealer_id,new.assigned_to,'lead',new.id,new.title,'A CRM lead was assigned to you');
  end if;
  return new;
end $$;
create function public.notify_deal_assignment() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.salesperson_id is not null
    and (tg_op='INSERT' or new.salesperson_id is distinct from old.salesperson_id)
    and new.salesperson_id is distinct from auth.uid() then
    perform public.create_assignment_notification(new.dealer_id,new.salesperson_id,'deal',new.id,'Deal '||new.deal_no,'A Deal was assigned to you');
  end if;
  return new;
end $$;
create trigger lead_assignment_message after insert or update of assigned_to on public.leads
  for each row execute function public.notify_lead_assignment();
create trigger deal_assignment_message after insert or update of salesperson_id on public.deals
  for each row execute function public.notify_deal_assignment();
