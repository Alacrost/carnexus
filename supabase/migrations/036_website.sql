-- Autonexus 036: Dealer Website — the 3rd product. A public car-listing site per dealer,
-- served from the dealer's stock (synced hourly from DoneDeal in a later integration).
-- website_settings holds the site config; anon may read an ENABLED site + its in-stock cars.

create table if not exists public.website_settings (
  dealer_id uuid primary key references public.dealers (id) on delete cascade,
  enabled boolean not null default false,
  headline text,
  subheadline text,
  about text,
  phone text,
  whatsapp text,
  email text,
  theme_color text default '#0ea5e9',
  donedeal_seller_url text,
  last_synced_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.website_settings enable row level security;

-- Members manage their own; anyone (anon) may read an enabled site's settings.
create policy "website settings members" on public.website_settings
  for select using (dealer_id in (select public.user_dealer_ids()));
create policy "website settings public" on public.website_settings
  for select using (enabled = true);
create policy "website settings write" on public.website_settings
  for all using (public.user_role_in(dealer_id) in ('owner','admin'))
  with check (public.user_role_in(dealer_id) in ('owner','admin'));

-- Anon can resolve an enabled dealer (name/slug) for the public site.
create policy "dealers public via website" on public.dealers
  for select using (id in (select dealer_id from public.website_settings where enabled = true));

-- Anon can read the in-stock MAIN cars of a dealer whose website is enabled.
create policy "vehicles public via website" on public.vehicles
  for select using (
    stock_class = 'main'
    and status in ('ready_for_sale', 'reserved')
    and dealer_id in (select dealer_id from public.website_settings where enabled = true)
  );
