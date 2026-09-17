-- Autonexus 005: Ad description scripts (reusable, dealer-defined ad skeletons).
-- A "script" is a preferred description template with {placeholders} the generator
-- fills from vehicle + brand data. Drives both the AI and the fallback engine.
-- Same tenancy rules as 004: dealer_id + RLS, marketing roles write.

create table public.ad_scripts (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  name text not null,
  channel public.ad_channel,            -- null = works for any channel
  body text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index ad_scripts_dealer_idx on public.ad_scripts (dealer_id);

alter table public.ad_scripts enable row level security;

create policy "marketing read ad scripts" on public.ad_scripts
  for select using (dealer_id in (select public.user_dealer_ids()));
create policy "marketing write ad scripts" on public.ad_scripts
  for insert with check (public.user_role_in(dealer_id) in ('owner', 'admin', 'agency'));
create policy "marketing update ad scripts" on public.ad_scripts
  for update using (public.user_role_in(dealer_id) in ('owner', 'admin', 'agency'));
create policy "marketing delete ad scripts" on public.ad_scripts
  for delete using (public.user_role_in(dealer_id) in ('owner', 'admin', 'agency'));
