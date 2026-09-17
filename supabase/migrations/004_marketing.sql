-- Autonexus 004: Marketing & AI Studio (Stage 1)
-- brand_kits, description_templates, ad_creatives, generated_descriptions
-- Rules: dealer_id + RLS on every table (docs/SECURITY.md). Agency role has access
-- to marketing tables but NEVER to customers/leads.

create type public.template_kind as enum ('warranty', 'finance', 'hours', 'trade_in', 'custom');
create type public.ad_channel as enum ('donedeal', 'facebook', 'instagram_feed', 'instagram_story', 'google', 'website');
create type public.creative_status as enum ('processing', 'ready', 'published');

-- One brand kit per dealer: visual identity + logo placement rules.
create table public.brand_kits (
  dealer_id uuid primary key references public.dealers (id) on delete cascade,
  logo_path text,
  primary_color text default '#0ea5e9',
  secondary_color text default '#0f172a',
  font_family text,
  tone_of_voice text default 'professional and friendly',
  website_url text,
  -- logo placement: standard fields
  logo_position text not null default 'bottom_right'
    check (logo_position in ('top_left', 'top_right', 'bottom_left', 'bottom_right', 'center')),
  logo_size_pct int not null default 12 check (logo_size_pct between 4 and 40),
  logo_opacity_pct int not null default 90 check (logo_opacity_pct between 10 and 100),
  frame_style text not null default 'none'
    check (frame_style in ('none', 'banner_bottom', 'banner_top', 'border')),
  -- dealer-defined extra fields (free-form)
  custom_fields jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- Standard description blocks appended to every ad (warranty, finance, hours...).
create table public.description_templates (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  name text not null,
  kind public.template_kind not null default 'custom',
  body text not null,
  is_default boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index description_templates_dealer_idx on public.description_templates (dealer_id);

-- Enhanced photos. enhancement_meta records EXACTLY what the AI changed —
-- quality only, never the car's real condition (docs/SECURITY.md §9).
create table public.ad_creatives (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  source_photo_path text not null,
  enhanced_photo_path text,
  channel public.ad_channel not null,
  status public.creative_status not null default 'processing',
  enhancement_meta jsonb not null default '{}',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index ad_creatives_dealer_idx on public.ad_creatives (dealer_id, vehicle_id);

-- AI-generated ad copy per channel.
create table public.generated_descriptions (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  channel public.ad_channel not null,
  title text not null,
  body text not null,
  hashtags text,
  template_ids uuid[] not null default '{}',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index generated_descriptions_dealer_idx on public.generated_descriptions (dealer_id, vehicle_id);

-- Brand assets bucket (logos).
insert into storage.buckets (id, name, public)
values ('brand-assets', 'brand-assets', false)
on conflict (id) do nothing;

-- ========== RLS ==========
alter table public.brand_kits enable row level security;
alter table public.description_templates enable row level security;
alter table public.ad_creatives enable row level security;
alter table public.generated_descriptions enable row level security;

-- marketing roles: owner/admin/agency (sales can read copy to paste into portals)
create policy "marketing read brand kit" on public.brand_kits
  for select using (dealer_id in (select public.user_dealer_ids()));
create policy "marketing write brand kit" on public.brand_kits
  for insert with check (public.user_role_in(dealer_id) in ('owner', 'admin', 'agency'));
create policy "marketing update brand kit" on public.brand_kits
  for update using (public.user_role_in(dealer_id) in ('owner', 'admin', 'agency'));

create policy "marketing read templates" on public.description_templates
  for select using (dealer_id in (select public.user_dealer_ids()));
create policy "marketing write templates" on public.description_templates
  for insert with check (public.user_role_in(dealer_id) in ('owner', 'admin', 'agency'));
create policy "marketing update templates" on public.description_templates
  for update using (public.user_role_in(dealer_id) in ('owner', 'admin', 'agency'));
create policy "marketing delete templates" on public.description_templates
  for delete using (public.user_role_in(dealer_id) in ('owner', 'admin', 'agency'));

create policy "marketing read creatives" on public.ad_creatives
  for select using (dealer_id in (select public.user_dealer_ids()));
create policy "marketing write creatives" on public.ad_creatives
  for insert with check (public.user_role_in(dealer_id) in ('owner', 'admin', 'agency'));
create policy "marketing update creatives" on public.ad_creatives
  for update using (public.user_role_in(dealer_id) in ('owner', 'admin', 'agency'));
create policy "marketing delete creatives" on public.ad_creatives
  for delete using (public.user_role_in(dealer_id) in ('owner', 'admin', 'agency'));

create policy "marketing read descriptions" on public.generated_descriptions
  for select using (dealer_id in (select public.user_dealer_ids()));
create policy "marketing write descriptions" on public.generated_descriptions
  for insert with check (public.user_role_in(dealer_id) in ('owner', 'admin', 'agency'));
create policy "marketing delete descriptions" on public.generated_descriptions
  for delete using (public.user_role_in(dealer_id) in ('owner', 'admin', 'agency'));

-- brand-assets storage: {dealer_id}/... path, marketing roles write, members read
create policy "members read brand assets" on storage.objects
  for select using (
    bucket_id = 'brand-assets'
    and (storage.foldername(name))[1]::uuid in (select public.user_dealer_ids())
  );
create policy "marketing upload brand assets" on storage.objects
  for insert with check (
    bucket_id = 'brand-assets'
    and public.user_role_in((storage.foldername(name))[1]::uuid) in ('owner', 'admin', 'agency')
  );
create policy "marketing delete brand assets" on storage.objects
  for delete using (
    bucket_id = 'brand-assets'
    and public.user_role_in((storage.foldername(name))[1]::uuid) in ('owner', 'admin', 'agency')
  );
