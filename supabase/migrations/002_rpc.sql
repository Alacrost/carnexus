-- Autonexus 002: signup + invitation RPCs (security definer, transactional)

-- pgcrypto for digest()/gen_random_bytes()
create extension if not exists pgcrypto;

-- Called right after signup: creates the dealer and the owner membership atomically.
create or replace function public.create_dealer_with_owner(p_name text, p_slug text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dealer_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if char_length(trim(p_name)) < 2 then
    raise exception 'dealer name too short';
  end if;
  if p_slug !~ '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$' then
    raise exception 'invalid slug';
  end if;

  insert into public.dealers (name, slug)
  values (trim(p_name), p_slug)
  returning id into v_dealer_id;

  insert into public.dealer_members (dealer_id, user_id, role, status)
  values (v_dealer_id, auth.uid(), 'owner', 'active');

  insert into public.audit_logs (dealer_id, user_id, action, entity, entity_id)
  values (v_dealer_id, auth.uid(), 'dealer_created', 'dealer', v_dealer_id);

  return v_dealer_id;
end;
$$;

-- Accept an invitation token (raw token hashed with sha256 and compared).
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
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select email into v_email from auth.users where id = auth.uid();

  select * into v_inv
  from public.invitations
  where token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and accepted_at is null
    and expires_at > now();

  if v_inv.id is null then
    raise exception 'invitation invalid or expired';
  end if;

  if lower(v_inv.email) <> lower(v_email) then
    raise exception 'invitation was issued for a different email';
  end if;

  insert into public.dealer_members (dealer_id, user_id, role, status, invited_by)
  values (v_inv.dealer_id, auth.uid(), v_inv.role, 'active', v_inv.invited_by)
  on conflict (dealer_id, user_id) do nothing;

  update public.invitations set accepted_at = now() where id = v_inv.id;

  insert into public.audit_logs (dealer_id, user_id, action, entity, entity_id, meta)
  values (v_inv.dealer_id, auth.uid(), 'invitation_accepted', 'invitation', v_inv.id,
          jsonb_build_object('role', v_inv.role));

  return v_inv.dealer_id;
end;
$$;

-- Create an invitation; returns the RAW token (only time it is visible).
create or replace function public.create_invitation(p_dealer_id uuid, p_email text, p_role public.member_role)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_my_role public.member_role;
begin
  v_my_role := public.user_role_in(p_dealer_id);
  if v_my_role not in ('owner', 'admin') then
    raise exception 'not allowed';
  end if;
  -- admin cannot grant owner
  if v_my_role = 'admin' and p_role = 'owner' then
    raise exception 'admins cannot invite owners';
  end if;
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid email';
  end if;

  v_token := encode(gen_random_bytes(24), 'hex');

  insert into public.invitations (dealer_id, email, role, token_hash, invited_by)
  values (p_dealer_id, lower(p_email), p_role, encode(digest(v_token, 'sha256'), 'hex'), auth.uid());

  insert into public.audit_logs (dealer_id, user_id, action, entity, meta)
  values (p_dealer_id, auth.uid(), 'member_invited', 'invitation',
          jsonb_build_object('email', lower(p_email), 'role', p_role));

  return v_token;
end;
$$;
