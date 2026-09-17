-- Autonexus 030: deal documents — Agreement, Invoice (SO), Quote, receipts.
-- A document freezes an immutable snapshot (jsonb) of the deal at print time and carries a
-- per-dealer number (invoice # YYMMDDNN, agreement AGR-YYYYMMDD-NNN). Customer-facing money →
-- owner/admin/sales/accountant may read/create; only owner/admin/accountant void/mark paid.

create table if not exists public.deal_documents (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  deal_id uuid not null references public.deals (id) on delete cascade,
  kind text not null check (kind in ('agreement','invoice','quote','purchase_receipt','credit_note')),
  number text not null,
  status text not null default 'printed' check (status in ('draft','printed','paid','void')),
  snapshot jsonb not null default '{}',   -- immutable frozen copy for print/PDF
  pdf_path text,
  printed_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists deal_documents_deal_idx on public.deal_documents (dealer_id, deal_id, created_at);

alter table public.deal_documents enable row level security;

create policy "deal_documents read" on public.deal_documents
  for select using (public.user_role_in(dealer_id) in ('owner','admin','sales','accountant'));
create policy "deal_documents insert" on public.deal_documents
  for insert with check (public.user_role_in(dealer_id) in ('owner','admin','sales','accountant'));
create policy "deal_documents update" on public.deal_documents
  for update using (public.user_role_in(dealer_id) in ('owner','admin','accountant'));
create policy "deal_documents delete" on public.deal_documents
  for delete using (public.user_role_in(dealer_id) in ('owner','admin'));
