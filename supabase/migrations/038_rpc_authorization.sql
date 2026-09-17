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
  if auth.uid() is null or v_my_role is null or v_my_role not in ('owner', 'admin') then
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

-- Spend AI image credits atomically. Fails closed when the balance is short.
-- Returns the remaining balance. Marketing roles only.
create or replace function public.spend_ai_credits(p_dealer_id uuid, p_amount int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining int;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;
  if auth.uid() is null or coalesce(public.user_role_in(p_dealer_id) not in ('owner', 'admin', 'agency'), true) then
    raise exception 'not_authorised';
  end if;

  update public.dealers
    set ai_credits = ai_credits - p_amount
    where id = p_dealer_id and ai_credits >= p_amount
    returning ai_credits into v_remaining;

  if v_remaining is null then
    raise exception 'insufficient_credits';
  end if;

  return v_remaining;
end;
$$;

revoke all on function public.create_invitation(uuid,text,public.member_role), public.spend_ai_credits(uuid,int) from public, anon;
grant execute on function public.create_invitation(uuid,text,public.member_role), public.spend_ai_credits(uuid,int) to authenticated;
