-- Autonexus 025: dealer currency setting + customer/party fields.
-- A party is a customer record — an individual or a business (e.g. an auction house we
-- buy stock from). Currency is a single per-dealer setting (EUR default).

alter table public.dealers
  add column if not exists currency text not null default 'EUR';

alter table public.customers
  add column if not exists type text not null default 'individual'
    check (type in ('individual', 'business')),
  add column if not exists business_name text,
  add column if not exists vat_number text,
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists city text,
  add column if not exists county text,
  add column if not exists eircode text,
  add column if not exists marketing_consent boolean not null default false;

-- Accountant can read parties for invoicing (customers were owner/admin/sales).
create policy "accountant read customers" on public.customers
  for select using (public.user_role_in(dealer_id) = 'accountant');
