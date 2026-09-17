-- Autonexus 008: Business Setup profile
-- One profile per dealer describing the business. Fed to the AI as context for
-- every generated ad/description. Rules: dealer_id + RLS (docs/SECURITY.md).
-- Same access model as brand_kits (owner/admin/agency write, members read).

create table public.business_profiles (
  dealer_id uuid primary key references public.dealers (id) on delete cascade,
  opening_hours text,
  warranty_info text,       -- warranty types offered & what's covered
  whats_included text,      -- what's included / not charged in the deal
  extra_services text,      -- other services & benefits on the sale
  phone text,
  whatsapp text,
  email text,
  website_url text,
  social_links text,        -- free text, one link/handle per line
  finance_available boolean not null default false,
  finance_details text,     -- basic rules & requirements for finance
  updated_at timestamptz not null default now()
);

alter table public.business_profiles enable row level security;

create policy "business read profile" on public.business_profiles
  for select using (dealer_id in (select public.user_dealer_ids()));
create policy "business write profile" on public.business_profiles
  for insert with check (public.user_role_in(dealer_id) in ('owner', 'admin', 'agency'));
create policy "business update profile" on public.business_profiles
  for update using (public.user_role_in(dealer_id) in ('owner', 'admin', 'agency'));
