-- Autonexus 029: Deal as the central object — pipeline stage, money fields, audit timeline.
-- A deal is the umbrella for a car sale (like GarageManager's Deal/Lead): it moves through
-- pipeline stages, records an event log, and carries the money summary (retail / trade-in
-- SIV / cost-to-change). Customer-facing figures → owner/admin/sales/accountant (agency blocked).

alter table public.deals
  add column if not exists stage text not null default 'vehicle_interest'
    check (stage in ('initial_contact','vehicle_interest','test_drive','proposal',
                     'negotiation','closing','after_sales','cancelled')),
  add column if not exists retail_price numeric,
  add column if not exists siv_total numeric not null default 0,   -- trade-in / settlement value
  add column if not exists agreement_printed_at timestamptz,
  add column if not exists quote_printed_at timestamptz,
  add column if not exists terms text;

create index if not exists deals_dealer_stage_idx on public.deals (dealer_id, stage);

-- Immutable audit / timeline of everything that happened on a deal.
create table if not exists public.deal_events (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  deal_id uuid not null references public.deals (id) on delete cascade,
  kind text not null,                 -- created | stage_changed | deposit | agreement_printed | note | so_created
  detail jsonb not null default '{}',
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists deal_events_deal_idx on public.deal_events (deal_id, created_at);

alter table public.deal_events enable row level security;

create policy "deal_events read" on public.deal_events
  for select using (public.user_role_in(dealer_id) in ('owner','admin','sales','accountant'));
create policy "deal_events insert" on public.deal_events
  for insert with check (public.user_role_in(dealer_id) in ('owner','admin','sales','accountant'));
create policy "deal_events delete" on public.deal_events
  for delete using (public.user_role_in(dealer_id) in ('owner','admin'));
