-- Autonexus 010: Campaign Composer (Marketing MVP)
-- campaigns: bundle of per-channel text + sized image assets for one vehicle.
-- AI image credits: simple per-dealer balance, spent atomically via RPC.
-- Rules: dealer_id + RLS on every table (docs/SECURITY.md). Marketing roles
-- (owner/admin/agency) write. No customer PII involved.

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  promotion_id uuid references public.promotions (id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'ready')),
  assets jsonb not null default '{}',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index campaigns_dealer_idx on public.campaigns (dealer_id, status);

-- AI image credit balance per dealer (top-up/billing is post-MVP).
alter table public.dealers add column if not exists ai_credits int not null default 200;

-- ========== RLS ==========
alter table public.campaigns enable row level security;

create policy "campaigns read" on public.campaigns
  for select using (dealer_id in (select public.user_dealer_ids()));
create policy "campaigns write" on public.campaigns
  for insert with check (public.user_role_in(dealer_id) in ('owner', 'admin', 'agency'));
create policy "campaigns update" on public.campaigns
  for update using (public.user_role_in(dealer_id) in ('owner', 'admin', 'agency'));
create policy "campaigns delete" on public.campaigns
  for delete using (public.user_role_in(dealer_id) in ('owner', 'admin', 'agency'));

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
  if public.user_role_in(p_dealer_id) not in ('owner', 'admin', 'agency') then
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
