-- Autonexus 013: Dealer integrations (social links + DoneDeal credentials)
-- Structured, machine-usable links for the Social Media Studio + a place for the
-- DoneDeal API key. The key is stored as AES-256-GCM ciphertext produced in the
-- server action (src/lib/crypto.ts) — never plaintext, never sent to the client.
-- Rules: dealer_id + RLS (docs/SECURITY.md). Write limited to owner/admin (Settings).

create table public.dealer_integrations (
  dealer_id uuid primary key references public.dealers (id) on delete cascade,
  facebook_url text,
  instagram_url text,
  website_url text,
  donedeal_api_key text,   -- AES-256-GCM ciphertext (base64); decrypted server-side only
  updated_at timestamptz not null default now()
);

alter table public.dealer_integrations enable row level security;

create policy "integrations read" on public.dealer_integrations
  for select using (dealer_id in (select public.user_dealer_ids()));
create policy "integrations insert" on public.dealer_integrations
  for insert with check (public.user_role_in(dealer_id) in ('owner', 'admin'));
create policy "integrations update" on public.dealer_integrations
  for update using (public.user_role_in(dealer_id) in ('owner', 'admin'));
