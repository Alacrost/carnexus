-- Autonexus 026: Deals & Trading core — a deal holds one or more orders (SO/PO) with a
-- customer, plus payments. Trade-in / finance / documents fields land in later phases;
-- their columns are added here so we build on the final shape once (no reshaping later).
-- Deal figures are customer-facing (sale price/deposit/balance) — owner/admin/SALES/
-- accountant may read. The COST/MARGIN side stays in vehicle_acquisitions/vehicle_costs
-- (owner/admin/accountant only) so sales never see margin.

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  deal_no text not null,                       -- YYYYMMDD-<n>
  customer_id uuid references public.customers (id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'quoted', 'agreed', 'finance', 'completed', 'cancelled')),
  salesperson_id uuid references auth.users (id),
  lead_id uuid references public.leads (id) on delete set null,
  currency text not null default 'EUR',
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);
create index deals_dealer_idx on public.deals (dealer_id, status);

create table public.deal_orders (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  deal_id uuid not null references public.deals (id) on delete cascade,
  kind text not null check (kind in ('sale', 'purchase')),
  vehicle_id uuid references public.vehicles (id) on delete set null,
  is_trade_in boolean not null default false,
  price numeric,
  vat_scheme text check (vat_scheme in ('standard', 'margin', 'none')),
  vat_amount numeric,
  discount numeric,
  add_ons jsonb not null default '[]',
  -- trade-in specifics (P2)
  settlement_amount numeric,
  settlement_provider text,
  settlement_valid_until date,
  net_equity numeric,
  condition_notes text,
  keys_count int,
  has_logbook boolean,
  service_history text,
  created_at timestamptz not null default now()
);
create index deal_orders_deal_idx on public.deal_orders (deal_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  deal_id uuid not null references public.deals (id) on delete cascade,
  kind text not null
    check (kind in ('deposit', 'balance', 'trade_allowance', 'finance_payout', 'refund')),
  method text check (method in ('cash', 'bank', 'card', 'finance', 'part_exchange')),
  amount numeric not null default 0,
  currency text not null default 'EUR',
  paid_on date,
  reference text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index payments_deal_idx on public.payments (deal_id);

-- ========== RLS — sales process (owner/admin/sales/accountant); agency blocked ==========
alter table public.deals enable row level security;
alter table public.deal_orders enable row level security;
alter table public.payments enable row level security;

create policy "deals read" on public.deals
  for select using (public.user_role_in(dealer_id) in ('owner', 'admin', 'sales', 'accountant'));
create policy "deals insert" on public.deals
  for insert with check (public.user_role_in(dealer_id) in ('owner', 'admin', 'sales', 'accountant'));
create policy "deals update" on public.deals
  for update using (public.user_role_in(dealer_id) in ('owner', 'admin', 'sales', 'accountant'));
create policy "deals delete" on public.deals
  for delete using (public.user_role_in(dealer_id) in ('owner', 'admin'));

create policy "deal_orders read" on public.deal_orders
  for select using (public.user_role_in(dealer_id) in ('owner', 'admin', 'sales', 'accountant'));
create policy "deal_orders insert" on public.deal_orders
  for insert with check (public.user_role_in(dealer_id) in ('owner', 'admin', 'sales', 'accountant'));
create policy "deal_orders update" on public.deal_orders
  for update using (public.user_role_in(dealer_id) in ('owner', 'admin', 'sales', 'accountant'));
create policy "deal_orders delete" on public.deal_orders
  for delete using (public.user_role_in(dealer_id) in ('owner', 'admin', 'sales', 'accountant'));

create policy "payments read" on public.payments
  for select using (public.user_role_in(dealer_id) in ('owner', 'admin', 'sales', 'accountant'));
create policy "payments insert" on public.payments
  for insert with check (public.user_role_in(dealer_id) in ('owner', 'admin', 'sales', 'accountant'));
create policy "payments update" on public.payments
  for update using (public.user_role_in(dealer_id) in ('owner', 'admin', 'sales', 'accountant'));
create policy "payments delete" on public.payments
  for delete using (public.user_role_in(dealer_id) in ('owner', 'admin', 'sales', 'accountant'));
