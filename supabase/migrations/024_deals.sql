-- Autonexus 024: Sales & Accounting (Deals) — Phase 1.
-- Per-vehicle commercial record + cost line-items. Revenue/cost/margin/VAT/profit are
-- computed in the app (src/lib/finance.ts). FINANCIALS ARE SENSITIVE: only owner/admin/
-- accountant may read or write these tables (sales/agency are blocked at the DB level).
-- Buyer contact is minimal PII; keep it lean (docs/SECURITY.md).

-- One commercial record per vehicle.
create table public.vehicle_deals (
  vehicle_id uuid primary key references public.vehicles (id) on delete cascade,
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  -- Purchase
  purchase_price numeric,
  purchase_date date,
  supplier text,
  source text check (source in ('trade', 'auction', 'private', 'part_exchange', 'other')),
  vat_scheme text not null default 'standard'
    check (vat_scheme in ('standard', 'margin', 'none')),
  -- Sale
  sale_price numeric,
  deposit_amount numeric,
  deposit_date date,
  buyer_name text,
  buyer_phone text,
  payment_method text check (payment_method in ('cash', 'bank', 'finance', 'card', 'mixed')),
  finance_provider text,
  part_exchange_value numeric,
  salesperson text,
  sale_status text not null default 'none'
    check (sale_status in ('none', 'reserved', 'deposit_paid', 'sold', 'delivered')),
  sold_date date,
  delivered_date date,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index vehicle_deals_dealer_idx on public.vehicle_deals (dealer_id);

-- Cost line-items (prep, valet, parts, transport…).
create table public.vehicle_costs (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  kind text not null default 'other'
    check (kind in ('prep', 'nct', 'valet', 'parts', 'transport', 'advertising', 'other')),
  amount numeric not null default 0,
  cost_date date,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index vehicle_costs_vehicle_idx on public.vehicle_costs (dealer_id, vehicle_id);

-- ========== RLS — financial roles only ==========
alter table public.vehicle_deals enable row level security;
alter table public.vehicle_costs enable row level security;

create policy "deals read" on public.vehicle_deals
  for select using (public.user_role_in(dealer_id) in ('owner', 'admin', 'accountant'));
create policy "deals insert" on public.vehicle_deals
  for insert with check (public.user_role_in(dealer_id) in ('owner', 'admin', 'accountant'));
create policy "deals update" on public.vehicle_deals
  for update using (public.user_role_in(dealer_id) in ('owner', 'admin', 'accountant'));
create policy "deals delete" on public.vehicle_deals
  for delete using (public.user_role_in(dealer_id) in ('owner', 'admin', 'accountant'));

create policy "costs read" on public.vehicle_costs
  for select using (public.user_role_in(dealer_id) in ('owner', 'admin', 'accountant'));
create policy "costs insert" on public.vehicle_costs
  for insert with check (public.user_role_in(dealer_id) in ('owner', 'admin', 'accountant'));
create policy "costs update" on public.vehicle_costs
  for update using (public.user_role_in(dealer_id) in ('owner', 'admin', 'accountant'));
create policy "costs delete" on public.vehicle_costs
  for delete using (public.user_role_in(dealer_id) in ('owner', 'admin', 'accountant'));
