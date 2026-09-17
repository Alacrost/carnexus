-- Autonexus 034: deal extras — Required Documents (KYC checklist) + Add-ons (warranty / GAP /
-- service plan = "supplementary sales"). Required docs are a simple received-yes/no checklist
-- (jsonb on the deal). Add-ons carry a customer price and a cost (profit is owner/admin/accountant).

alter table public.deals
  add column if not exists required_docs jsonb not null default '{}';

create table if not exists public.deal_addons (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  deal_id uuid not null references public.deals (id) on delete cascade,
  kind text not null check (kind in ('warranty','gap','service_plan','other')),
  name text not null,
  price numeric not null default 0,
  cost numeric not null default 0,
  months int,
  terms text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists deal_addons_deal_idx on public.deal_addons (deal_id);

alter table public.deal_addons enable row level security;

create policy "deal_addons read" on public.deal_addons
  for select using (public.user_role_in(dealer_id) in ('owner','admin','sales','accountant'));
create policy "deal_addons insert" on public.deal_addons
  for insert with check (public.user_role_in(dealer_id) in ('owner','admin','sales','accountant'));
create policy "deal_addons update" on public.deal_addons
  for update using (public.user_role_in(dealer_id) in ('owner','admin','sales','accountant'));
create policy "deal_addons delete" on public.deal_addons
  for delete using (public.user_role_in(dealer_id) in ('owner','admin','accountant'));
