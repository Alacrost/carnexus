-- Autonexus 018: car viewings / appointments (Leads viewings + Dashboard mini-calendar)
-- A booked viewing: who, phone, which car (from inventory or free text), when.
-- Customer PII (name/phone) → agency role is blocked (docs/SECURITY.md). Shared by the
-- Leads viewings manager (M9) and the Dashboard mini viewings calendar (M8).

create table public.viewings (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  lead_name text not null,
  phone text,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  vehicle_label text,
  scheduled_for timestamptz not null,
  status text not null default 'booked'
    check (status in ('booked', 'done', 'no_show', 'cancelled')),
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index viewings_dealer_when_idx on public.viewings (dealer_id, scheduled_for);

alter table public.viewings enable row level security;

-- Customer PII: agency must never see viewings (owner/admin/sales only).
create policy "viewings read" on public.viewings
  for select using (public.user_role_in(dealer_id) in ('owner', 'admin', 'sales'));
create policy "viewings insert" on public.viewings
  for insert with check (public.user_role_in(dealer_id) in ('owner', 'admin', 'sales'));
create policy "viewings update" on public.viewings
  for update using (public.user_role_in(dealer_id) in ('owner', 'admin', 'sales'));
create policy "viewings delete" on public.viewings
  for delete using (public.user_role_in(dealer_id) in ('owner', 'admin', 'sales'));
