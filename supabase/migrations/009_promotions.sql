-- Autonexus 009: Events & Promotions studio
-- promotions: seasonal/holiday campaigns with AI angles + editable T&C.
-- Rules: dealer_id + RLS on every table (docs/SECURITY.md). Marketing roles
-- (owner/admin/agency) write; active promotions are publicly readable so the
-- shareable T&C page works without auth.

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  title text not null,
  kind text not null default 'seasonal'
    check (kind in ('seasonal', 'holiday', 'sale', 'finance', 'event', 'other')),
  brief text,
  offer_details text,
  included text,
  excluded text,
  starts_on date,
  ends_on date,
  terms text,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'ended')),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index promotions_dealer_idx on public.promotions (dealer_id, status);

-- ========== RLS ==========
alter table public.promotions enable row level security;

-- Dealer members read their own promotions (any status).
create policy "promotions read" on public.promotions
  for select using (dealer_id in (select public.user_dealer_ids()));

-- Anyone can read an ACTIVE promotion (public shareable T&C page).
create policy "promotions public read" on public.promotions
  for select using (status = 'active');

-- Marketing roles write.
create policy "promotions write" on public.promotions
  for insert with check (public.user_role_in(dealer_id) in ('owner', 'admin', 'agency'));
create policy "promotions update" on public.promotions
  for update using (public.user_role_in(dealer_id) in ('owner', 'admin', 'agency'));
create policy "promotions delete" on public.promotions
  for delete using (public.user_role_in(dealer_id) in ('owner', 'admin', 'agency'));
