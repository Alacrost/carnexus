-- Autonexus 006: Cover Photo Studio overlay patterns.
-- Reusable positioned-PNG patterns per dealer. The PNG files live in the existing
-- brand-assets bucket under {dealer_id}/overlays/; this table stores each pattern's
-- name + item geometry (storage path + position/size/opacity as image fractions).
-- Same tenancy rules as 004: dealer_id + RLS, marketing roles write.

create table public.overlay_patterns (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  name text not null,
  items jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index overlay_patterns_dealer_idx on public.overlay_patterns (dealer_id);

alter table public.overlay_patterns enable row level security;

create policy "marketing read overlay patterns" on public.overlay_patterns
  for select using (dealer_id in (select public.user_dealer_ids()));
create policy "marketing write overlay patterns" on public.overlay_patterns
  for insert with check (public.user_role_in(dealer_id) in ('owner', 'admin', 'agency'));
create policy "marketing update overlay patterns" on public.overlay_patterns
  for update using (public.user_role_in(dealer_id) in ('owner', 'admin', 'agency'));
create policy "marketing delete overlay patterns" on public.overlay_patterns
  for delete using (public.user_role_in(dealer_id) in ('owner', 'admin', 'agency'));
