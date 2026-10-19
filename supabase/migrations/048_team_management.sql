-- Operable invitation and membership lifecycle using the existing base roles.
-- Role redesign and hosted email delivery remain explicitly out of scope.

alter table public.invitations add column revoked_at timestamptz;

create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.invitations%rowtype;
  v_email text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select email into v_email from auth.users where id = auth.uid();
  select * into v_inv from public.invitations
  where token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and accepted_at is null and revoked_at is null and expires_at > now()
  for update;
  if v_inv.id is null then raise exception 'invitation invalid or expired'; end if;
  if lower(v_inv.email) <> lower(v_email) then raise exception 'invitation was issued for a different email'; end if;
  if exists(select 1 from public.dealer_members where dealer_id=v_inv.dealer_id and user_id=auth.uid()) then
    raise exception 'membership already exists';
  end if;
  insert into public.dealer_members(dealer_id,user_id,role,status,invited_by)
  values(v_inv.dealer_id,auth.uid(),v_inv.role,'active',v_inv.invited_by);
  update public.invitations set accepted_at=now() where id=v_inv.id;
  insert into public.audit_logs(dealer_id,user_id,action,entity,entity_id,meta)
  values(v_inv.dealer_id,auth.uid(),'invitation_accepted','invitation',v_inv.id,jsonb_build_object('role',v_inv.role));
  return v_inv.dealer_id;
end;
$$;

create or replace function public.create_invitation(p_dealer_id uuid,p_email text,p_role public.member_role)
returns text language plpgsql security definer set search_path=public as $$
declare v_token text;v_my_role public.member_role;v_email text:=lower(trim(p_email));
begin
  v_my_role:=public.user_role_in(p_dealer_id);
  if auth.uid() is null or v_my_role is null or v_my_role not in ('owner','admin') then raise exception 'not allowed';end if;
  if v_my_role='admin' and p_role='owner' then raise exception 'admins cannot invite owners';end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid email';end if;
  if exists(select 1 from auth.users u join public.dealer_members m on m.user_id=u.id where m.dealer_id=p_dealer_id and lower(u.email)=v_email) then raise exception 'membership already exists';end if;
  if exists(select 1 from public.invitations where dealer_id=p_dealer_id and email=v_email and accepted_at is null and revoked_at is null and expires_at>now()) then raise exception 'pending invitation exists';end if;
  v_token:=encode(gen_random_bytes(24),'hex');
  insert into public.invitations(dealer_id,email,role,token_hash,invited_by) values(p_dealer_id,v_email,p_role,encode(digest(v_token,'sha256'),'hex'),auth.uid());
  insert into public.audit_logs(dealer_id,user_id,action,entity,meta) values(p_dealer_id,auth.uid(),'member_invited','invitation',jsonb_build_object('email',v_email,'role',p_role));
  return v_token;
end;
$$;

create function public.team_command(p_dealer uuid,p_command text,p_target uuid,p_input jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  actor_role public.member_role;target_member public.dealer_members;inv public.invitations;
  requested_role public.member_role;token text;
begin
  actor_role:=public.user_role_in(p_dealer);
  if auth.uid() is null or actor_role is null or actor_role not in ('owner','admin') then raise exception 'team_not_allowed';end if;

  if p_command in ('revoke_invitation','resend_invitation') then
    select * into inv from public.invitations where id=p_target and dealer_id=p_dealer for update;
    if not found or inv.accepted_at is not null or inv.revoked_at is not null then raise exception 'invitation_not_pending';end if;
    if actor_role='admin' and inv.role='owner' then raise exception 'owner_protected';end if;
    update public.invitations set revoked_at=now() where id=inv.id;
    insert into public.audit_logs(dealer_id,user_id,action,entity,entity_id,meta)
    values(p_dealer,auth.uid(),'invitation_revoked','invitation',inv.id,jsonb_build_object('email',inv.email,'role',inv.role,'reason',case when p_command='resend_invitation' then 'resend' else 'manual' end));
    if p_command='resend_invitation' then
      token:=encode(gen_random_bytes(24),'hex');
      insert into public.invitations(dealer_id,email,role,token_hash,invited_by)
      values(p_dealer,inv.email,inv.role,encode(digest(token,'sha256'),'hex'),auth.uid());
      insert into public.audit_logs(dealer_id,user_id,action,entity,meta)
      values(p_dealer,auth.uid(),'invitation_resent','invitation',jsonb_build_object('email',inv.email,'role',inv.role));
      return jsonb_build_object('token',token);
    end if;
    return jsonb_build_object('revoked',true);
  end if;

  select * into target_member from public.dealer_members where dealer_id=p_dealer and user_id=p_target for update;
  if not found then raise exception 'member_not_found';end if;
  if p_command='assign_crm_profile' then
    if actor_role<>'owner' then raise exception 'owner_required';end if;
    if target_member.role<>'sales' or target_member.status<>'active' then raise exception 'active_sales_member_required';end if;
    if nullif(p_input->>'crmRoleId','') is not null and not exists(select 1 from public.crm_roles where id=(p_input->>'crmRoleId')::uuid and dealer_id=p_dealer) then raise exception 'invalid_crm_profile';end if;
    update public.dealer_members set crm_role_id=nullif(p_input->>'crmRoleId','')::uuid where dealer_id=p_dealer and user_id=p_target;
    return jsonb_build_object('assigned',true);
  end if;
  if target_member.role='owner' then raise exception 'owner_protected';end if;
  if actor_role='admin' and target_member.role='admin' then raise exception 'admin_peer_protected';end if;
  if p_target=auth.uid() then raise exception 'self_management_not_allowed';end if;

  if p_command='set_member_status' then
    if p_input->>'status' not in ('active','suspended') then raise exception 'invalid_status';end if;
    update public.dealer_members set status=(p_input->>'status')::public.member_status where dealer_id=p_dealer and user_id=p_target;
    insert into public.audit_logs(dealer_id,user_id,action,entity,entity_id,meta)
    values(p_dealer,auth.uid(),case when p_input->>'status'='active' then 'member_restored' else 'member_suspended' end,'dealer_member',p_target,jsonb_build_object('role',target_member.role));
    return jsonb_build_object('status',p_input->>'status');
  elsif p_command='set_member_role' then
    requested_role:=(p_input->>'role')::public.member_role;
    if requested_role='owner' then raise exception 'owner_protected';end if;
    if actor_role='admin' and requested_role='admin' then raise exception 'admin_peer_protected';end if;
    if actor_role='admin' and target_member.crm_role_id is not null then raise exception 'owner_required_for_profiled_member';end if;
    update public.dealer_members set role=requested_role,crm_role_id=null where dealer_id=p_dealer and user_id=p_target;
    insert into public.audit_logs(dealer_id,user_id,action,entity,entity_id,meta)
    values(p_dealer,auth.uid(),'member_role_changed','dealer_member',p_target,jsonb_build_object('before',target_member.role,'after',requested_role));
    return jsonb_build_object('role',requested_role);
  end if;
  raise exception 'invalid_team_command';
end;
$$;

-- Membership and invitation writes must go through audited commands.
do $$ declare p record; begin
  for p in select tablename,policyname from pg_policies where schemaname='public' and tablename in ('dealer_members','invitations') and cmd<>'SELECT' loop
    execute format('drop policy %I on public.%I',p.policyname,p.tablename);
  end loop;
end $$;
revoke insert,update,delete on public.dealer_members,public.invitations from authenticated,anon;
grant select on public.dealer_members to authenticated;
revoke select on public.invitations from authenticated,anon;
grant select(id,dealer_id,email,role,expires_at,accepted_at,revoked_at,invited_by,created_at) on public.invitations to authenticated;
revoke all on function public.team_command(uuid,text,uuid,jsonb) from public,anon;
grant execute on function public.team_command(uuid,text,uuid,jsonb) to authenticated;
revoke all on function public.create_invitation(uuid,text,public.member_role),public.accept_invitation(text) from public,anon;
grant execute on function public.create_invitation(uuid,text,public.member_role),public.accept_invitation(text) to authenticated;

create function public.team_overview(p_dealer uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select case when public.user_role_in(p_dealer) in ('owner','admin') then jsonb_build_object(
    'members',coalesce((select jsonb_agg(jsonb_build_object(
      'id',m.user_id,'name',coalesce(nullif(p.full_name,''),split_part(u.email,'@',1),'Team member'),
      'email',u.email,'role',m.role,'status',m.status,'crmRoleId',m.crm_role_id
    ) order by m.created_at) from public.dealer_members m left join public.profiles p on p.id=m.user_id left join auth.users u on u.id=m.user_id where m.dealer_id=p_dealer),'[]'::jsonb),
    'invitations',coalesce((select jsonb_agg(jsonb_build_object(
      'id',i.id,'email',i.email,'role',i.role,'createdAt',i.created_at,'expiresAt',i.expires_at,
      'status',case when i.accepted_at is not null then 'accepted' when i.revoked_at is not null then 'revoked' when i.expires_at<=now() then 'expired' else 'pending' end
    ) order by i.created_at desc) from public.invitations i where i.dealer_id=p_dealer and i.accepted_at is null),'[]'::jsonb)
  ) else null end;
$$;
revoke all on function public.team_overview(uuid) from public,anon;
grant execute on function public.team_overview(uuid) to authenticated;
