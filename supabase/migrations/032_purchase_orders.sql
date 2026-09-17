-- Autonexus 032: Purchases (Purchase Orders) — buying stock/services from a vendor party.
-- Mirrors GarageManager's PO: a PO has a vendor (customers/party), an optional vehicle
-- (CAR bought), line items with nominal codes, an approval-before-pay flow, and vendor
-- payments. Buying is the COST side → owner/admin/accountant only (sales/agency blocked).

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  po_no text not null,
  vendor_id uuid references public.customers (id) on delete set null,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  inv_ref text,                                        -- supplier invoice reference
  status text not null default 'to_be_paid'
    check (status in ('to_be_paid','approved','paid','cancelled')),
  vat_scheme text not null default 'none'
    check (vat_scheme in ('standard','margin','none')),
  notes text,
  approved_by uuid,
  approved_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists purchase_orders_dealer_idx on public.purchase_orders (dealer_id, status);

create table if not exists public.po_lines (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  po_id uuid not null references public.purchase_orders (id) on delete cascade,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  description text not null,
  nominal_code text,
  qty numeric not null default 1,
  net numeric not null default 0,
  vat numeric not null default 0,
  gross numeric not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists po_lines_po_idx on public.po_lines (po_id);

create table if not exists public.po_payments (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  po_id uuid not null references public.purchase_orders (id) on delete cascade,
  amount numeric not null default 0,
  method text check (method in ('cash','bank','card','finance')),
  paid_on date,
  reference text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists po_payments_po_idx on public.po_payments (po_id);

-- ========== RLS — financial roles only (cost side) ==========
alter table public.purchase_orders enable row level security;
alter table public.po_lines enable row level security;
alter table public.po_payments enable row level security;

do $$
declare t text;
begin
  foreach t in array array['purchase_orders','po_lines','po_payments'] loop
    execute format($f$
      create policy "%1$s read" on public.%1$s
        for select using (public.user_role_in(dealer_id) in ('owner','admin','accountant'));
      create policy "%1$s insert" on public.%1$s
        for insert with check (public.user_role_in(dealer_id) in ('owner','admin','accountant'));
      create policy "%1$s update" on public.%1$s
        for update using (public.user_role_in(dealer_id) in ('owner','admin','accountant'));
      create policy "%1$s delete" on public.%1$s
        for delete using (public.user_role_in(dealer_id) in ('owner','admin'));
    $f$, t);
  end loop;
end $$;
