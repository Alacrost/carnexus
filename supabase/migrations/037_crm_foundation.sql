-- Stage 1: operational leads, scoped CRM permissions, transactional commands and audit.
create table public.crm_roles (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 60),
  permissions text[] not null default '{}'
    check (permissions <@ array['read','work','assign','report']::text[]),
  unique(dealer_id, name), unique(dealer_id, id)
);
alter table public.crm_roles enable row level security;
grant select, insert, update on public.crm_roles to authenticated;
create policy "crm roles read" on public.crm_roles for select
  using (dealer_id in (select public.user_dealer_ids()));
create policy "owner creates crm roles" on public.crm_roles for insert
  with check (public.user_role_in(dealer_id) = 'owner');
create policy "owner updates crm roles" on public.crm_roles for update
  using (public.user_role_in(dealer_id) = 'owner')
  with check (public.user_role_in(dealer_id) = 'owner');
alter table public.dealer_members add column crm_role_id uuid;
alter table public.dealer_members add constraint membership_crm_role_tenant
  foreign key (dealer_id, crm_role_id) references public.crm_roles(dealer_id, id);

-- Custom profiles are CRM-only; they cannot grant billing or legacy financial access.
create function public.crm_allowed(p_dealer_id uuid, p_permission text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select
    coalesce((d.modules->>'sales')::boolean, false) and
    case when m.role in ('owner','admin') then true
      when m.role <> 'sales' then false
      when m.crm_role_id is null then p_permission in ('read','work','report')
      else p_permission = any(r.permissions) and 'read' = any(r.permissions)
    end
    from public.dealer_members m join public.dealers d on d.id = m.dealer_id
    left join public.crm_roles r on r.id = m.crm_role_id and r.dealer_id = m.dealer_id
    where m.dealer_id = p_dealer_id and m.user_id = auth.uid() and m.status = 'active'), false);
$$;
revoke all on function public.crm_allowed(uuid,text) from public, anon;
grant execute on function public.crm_allowed(uuid,text) to authenticated;

-- Close direct admin -> owner escalation, independent of invitation RPC checks.
drop policy "owner/admin insert members" on public.dealer_members;
drop policy "owner/admin update members" on public.dealer_members;
drop policy "owner/admin delete members" on public.dealer_members;
create policy "safe member insert" on public.dealer_members for insert with check (
  public.user_role_in(dealer_id) = 'owner' or
  (public.user_role_in(dealer_id) = 'admin' and role <> 'owner' and crm_role_id is null));
create policy "safe member update" on public.dealer_members for update using (
  public.user_role_in(dealer_id) = 'owner' or
  (public.user_role_in(dealer_id) = 'admin' and role <> 'owner')) with check (
  public.user_role_in(dealer_id) = 'owner' or
  (public.user_role_in(dealer_id) = 'admin' and role <> 'owner'));
create policy "safe member delete" on public.dealer_members for delete using (
  public.user_role_in(dealer_id) = 'owner' or
  (public.user_role_in(dealer_id) = 'admin' and role <> 'owner') or
  (user_id = auth.uid() and role <> 'owner'));

create function public.guard_crm_membership() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.dealer_id <> old.dealer_id or new.user_id <> old.user_id then
    raise exception 'membership_identity_immutable';
  end if;
  if new.crm_role_id is distinct from old.crm_role_id
    and public.user_role_in(old.dealer_id) is distinct from 'owner' then
    raise exception 'owner_required';
  end if;
  return new;
end;
$$;
create trigger guard_crm_membership before update on public.dealer_members
  for each row execute function public.guard_crm_membership();

alter table public.leads
  add column title text not null default 'Vehicle enquiry' check (char_length(trim(title)) between 2 and 160),
  add column next_action text check (char_length(next_action) <= 300),
  add column next_action_at timestamptz,
  add column lost_reason text check (char_length(lost_reason) <= 500),
  add column version integer not null default 1;
create index leads_follow_up_idx on public.leads(dealer_id,next_action_at)
  where stage not in ('sold','after_sales','lost');
alter table public.lead_activities add column detail jsonb not null default '{}';

-- Commands own writes. Removing all old policies avoids permissive-policy OR bypasses.
do $$ declare p record; begin
  for p in select tablename,policyname from pg_policies where schemaname='public'
    and tablename in ('leads','lead_activities') loop
    execute format('drop policy %I on public.%I',p.policyname,p.tablename);
  end loop;
end $$;
revoke all on public.leads, public.lead_activities from anon, authenticated;
grant select on public.leads, public.lead_activities to authenticated;
create policy "crm lead read" on public.leads for select
  using (public.crm_allowed(dealer_id,'read'));
create policy "crm activity read" on public.lead_activities for select
  using (public.crm_allowed(dealer_id,'read'));

create function public.save_crm_lead(p_dealer_id uuid, p_id uuid, p_expected_version int, p_input jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_old public.leads%rowtype; v_new public.leads%rowtype;
  v_customer uuid; v_vehicle uuid; v_assignee uuid; v_stage public.lead_stage;
  v_title text; v_next text; v_due timestamptz; v_lost text; v_notes text;
  v_source public.lead_source; v_score public.lead_score; v_name text;
begin
  if auth.uid() is null or not public.crm_allowed(p_dealer_id,'work') then
    raise exception 'crm_not_allowed';
  end if;
  if p_id is not null then
    select * into v_old from public.leads where dealer_id=p_dealer_id and id=p_id for update;
    if not found then raise exception 'lead_not_found'; end if;
    if p_expected_version is distinct from v_old.version then raise exception 'stale_lead'; end if;
  end if;
  v_title := trim(p_input->>'title');
  v_customer := nullif(p_input->>'customer_id','')::uuid;
  v_vehicle := nullif(p_input->>'vehicle_id','')::uuid;
  v_assignee := nullif(p_input->>'assigned_to','')::uuid;
  v_stage := coalesce(nullif(p_input->>'stage',''),'new')::public.lead_stage;
  v_source := coalesce(nullif(p_input->>'source',''),'other')::public.lead_source;
  v_score := nullif(p_input->>'score','')::public.lead_score;
  v_next := nullif(trim(p_input->>'next_action'),'');
  v_due := nullif(p_input->>'next_action_at','')::timestamptz;
  v_lost := nullif(trim(p_input->>'lost_reason'),'');
  v_notes := nullif(trim(p_input->>'notes'),'');
  if v_title is null or char_length(v_title) not between 2 and 160
    or char_length(v_notes)>4000 or char_length(v_next)>300 or char_length(v_lost)>500 then
    raise exception 'invalid_lead';
  end if;
  if p_id is null and v_stage <> 'new' then raise exception 'new_lead_stage_required'; end if;
  if v_stage='lost' and v_lost is null then raise exception 'loss_reason_required'; end if;
  if v_stage in ('sold','after_sales') and not exists (
    select 1 from public.deals where dealer_id=p_dealer_id and lead_id=p_id and status='completed'
  ) then raise exception 'completed_deal_required'; end if;
  if v_stage in ('sold','after_sales','lost') then v_due:=null; v_next:=null; end if;
  if (v_next is null) <> (v_due is null) then raise exception 'follow_up_requires_action_and_date'; end if;
  if not public.crm_allowed(p_dealer_id,'assign') then
    if p_id is null then
      if v_assignee is not null and v_assignee <> auth.uid() then raise exception 'assignment_not_allowed'; end if;
      v_assignee := auth.uid();
    elsif v_assignee is distinct from v_old.assigned_to then raise exception 'assignment_not_allowed';
    end if;
  end if;
  if v_assignee is not null and not exists (
    select 1 from public.dealer_members where dealer_id=p_dealer_id and user_id=v_assignee
      and status='active' and role in ('owner','admin','sales')
  ) then raise exception 'invalid_assignee'; end if;
  if v_vehicle is not null and not exists (select 1 from public.vehicles where dealer_id=p_dealer_id and id=v_vehicle)
    then raise exception 'invalid_vehicle'; end if;
  if p_id is not null and v_customer is distinct from v_old.customer_id then
    raise exception 'lead_customer_immutable';
  end if;
  if v_customer is not null then
    if not exists (select 1 from public.customers where dealer_id=p_dealer_id and id=v_customer and deleted_at is null)
      then raise exception 'invalid_customer'; end if;
  elsif p_id is null then
    v_name := trim(p_input->>'customer_name');
    if v_name is null or char_length(v_name) not between 2 and 120
      or char_length(p_input->>'email')>254 or char_length(p_input->>'phone')>40 then
      raise exception 'invalid_customer';
    end if;
    insert into public.customers(dealer_id,name,email,phone)
      values(p_dealer_id,v_name,nullif(trim(p_input->>'email'),''),nullif(trim(p_input->>'phone'),''))
      returning id into v_customer;
  end if;
  if p_id is null then
    insert into public.leads(dealer_id,title,customer_id,vehicle_id,source,stage,score,assigned_to,notes,next_action,next_action_at,lost_reason)
    values(p_dealer_id,v_title,v_customer,v_vehicle,v_source,v_stage,v_score,v_assignee,v_notes,v_next,v_due,v_lost)
    returning * into v_new;
  else
    update public.leads set title=v_title,vehicle_id=v_vehicle,source=v_source,stage=v_stage,
      score=v_score,assigned_to=v_assignee,notes=v_notes,next_action=v_next,next_action_at=v_due,
      lost_reason=case when v_stage='lost' then v_lost else null end,version=version+1
    where id=p_id and dealer_id=p_dealer_id returning * into v_new;
  end if;
  insert into public.lead_activities(dealer_id,lead_id,type,body,created_by,detail)
  values(p_dealer_id,v_new.id,'status_change',case when p_id is null then 'Lead created' else 'Lead updated' end,auth.uid(),
    jsonb_build_object('before',case when p_id is null then null else
      jsonb_build_object('stage',v_old.stage,'assigned_to',v_old.assigned_to,'next_action',v_old.next_action,'next_action_at',v_old.next_action_at,'title',v_old.title,'source',v_old.source,'score',v_old.score,'vehicle_id',v_old.vehicle_id,'lost_reason',v_old.lost_reason,'notes',v_old.notes) end,
      'after',jsonb_build_object('stage',v_new.stage,'assigned_to',v_new.assigned_to,'next_action',v_new.next_action,'next_action_at',v_new.next_action_at,'title',v_new.title,'source',v_new.source,'score',v_new.score,'vehicle_id',v_new.vehicle_id,'lost_reason',v_new.lost_reason,'notes',v_new.notes),
      'version',v_new.version));
  return v_new.id;
end;
$$;

create function public.record_crm_activity(p_dealer_id uuid,p_lead_id uuid,p_type text,p_body text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.crm_allowed(p_dealer_id,'work') then raise exception 'crm_not_allowed'; end if;
  if not exists(select 1 from public.leads where id=p_lead_id and dealer_id=p_dealer_id) then raise exception 'lead_not_found'; end if;
  if p_type is null or p_type not in ('note','call','email','whatsapp') or p_body is null
    or char_length(trim(p_body)) not between 1 and 4000 then raise exception 'invalid_activity'; end if;
  insert into public.lead_activities(dealer_id,lead_id,type,body,created_by)
    values(p_dealer_id,p_lead_id,p_type::public.activity_type,trim(p_body),auth.uid());
end;
$$;

-- Aggregate in the database; no client-side row cap. Dates are a creation cohort, not revenue attribution.
create function public.crm_report(p_dealer_id uuid,p_from timestamptz,p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  if not public.crm_allowed(p_dealer_id,'report') then raise exception 'crm_not_allowed'; end if;
  if p_from is null or p_to is null or p_from>=p_to then raise exception 'invalid_period'; end if;
  with cohort as (
    select * from public.leads where dealer_id=p_dealer_id and created_at>=p_from and created_at<p_to
  ) select jsonb_build_object(
    'total',count(*), 'won',count(*) filter(where stage in ('sold','after_sales')),
    'lost',count(*) filter(where stage='lost'),
    'open',count(*) filter(where stage not in ('sold','after_sales','lost')),
    'overdue',count(*) filter(where next_action_at<now() and stage not in ('sold','after_sales','lost')),
    'unassigned',count(*) filter(where assigned_to is null and stage not in ('sold','after_sales','lost')),
    'stages',coalesce((select jsonb_agg(x) from (select stage as label,count(*) as count from cohort group by stage order by stage) x),'[]'),
    'sources',coalesce((select jsonb_agg(x) from (select source as label,count(*) as count,
      count(*) filter(where stage in ('sold','after_sales')) as won from cohort group by source order by count(*) desc) x),'[]'),
    'assignees',coalesce((select jsonb_agg(x) from (select c.assigned_to as id,coalesce(p.full_name,'Unassigned') as label,count(*) as count,
      count(*) filter(where c.stage in ('sold','after_sales')) as won from cohort c left join public.profiles p on p.id=c.assigned_to
      group by c.assigned_to,p.full_name order by count(*) desc) x),'[]')
  ) into result from cohort;
  return result;
end;
$$;
revoke all on function public.save_crm_lead(uuid,uuid,int,jsonb),public.record_crm_activity(uuid,uuid,text,text),public.crm_report(uuid,timestamptz,timestamptz) from public,anon;
grant execute on function public.save_crm_lead(uuid,uuid,int,jsonb),public.record_crm_activity(uuid,uuid,text,text),public.crm_report(uuid,timestamptz,timestamptz) to authenticated;

-- Audit CRM role definitions and membership changes with server-controlled actor.
create function public.audit_crm_access() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if TG_OP='UPDATE' and to_jsonb(old)=to_jsonb(new) then return new; end if;
  insert into public.audit_logs(dealer_id,user_id,action,entity,entity_id,meta)
  values(new.dealer_id,auth.uid(),lower(TG_OP),TG_TABLE_NAME,
    (case when TG_TABLE_NAME='crm_roles' then to_jsonb(new)->>'id' else to_jsonb(new)->>'user_id' end)::uuid,
    jsonb_build_object('before',case when TG_OP='UPDATE' then to_jsonb(old) else null end,'after',to_jsonb(new)));
  return new;
end;
$$;
create trigger audit_crm_role after insert or update on public.crm_roles for each row execute function public.audit_crm_access();
create trigger audit_crm_assignment after update on public.dealer_members for each row execute function public.audit_crm_access();

-- Safe read of team names without handing clients unrestricted profiles access.
create function public.crm_team(p_dealer_id uuid)
returns table(id uuid,name text,base_role text,crm_role_id uuid)
language sql stable security definer set search_path=public as $$
  select m.user_id,coalesce(nullif(p.full_name,''),'Team member'),m.role::text,m.crm_role_id
  from public.dealer_members m left join public.profiles p on p.id=m.user_id
  where m.dealer_id=p_dealer_id and m.status='active' and m.role in ('owner','admin','sales')
    and public.crm_allowed(p_dealer_id,'read') order by p.full_name,m.user_id;
$$;
revoke all on function public.crm_team(uuid) from public,anon;
grant execute on function public.crm_team(uuid) to authenticated;
