-- Autonexus 011: Campaign recipes (reusable, dealer-defined campaign starting points).
-- A "recipe" captures the Composer settings (push, audience, angle, promotion) so a
-- dealer can start a new campaign from a saved preset instead of from scratch.
-- Same tenancy rules as 004/005: dealer_id + RLS, marketing roles write.

create table public.campaign_templates (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  name text not null,
  config jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index campaign_templates_dealer_idx on public.campaign_templates (dealer_id);

alter table public.campaign_templates enable row level security;

create policy "marketing read campaign templates" on public.campaign_templates
  for select using (dealer_id in (select public.user_dealer_ids()));
create policy "marketing write campaign templates" on public.campaign_templates
  for insert with check (public.user_role_in(dealer_id) in ('owner', 'admin', 'agency'));
create policy "marketing update campaign templates" on public.campaign_templates
  for update using (public.user_role_in(dealer_id) in ('owner', 'admin', 'agency'));
create policy "marketing delete campaign templates" on public.campaign_templates
  for delete using (public.user_role_in(dealer_id) in ('owner', 'admin', 'agency'));
