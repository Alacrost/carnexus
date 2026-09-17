-- Autonexus 001: core schema, multi-tenancy, RLS
-- Rules: every tenant table has dealer_id + RLS. See docs/SECURITY.md.

-- ========== ENUMS ==========
create type public.dealer_plan as enum ('starter', 'professional', 'dealer_group');
-- 'agency' = our in-office marketing team: marketing module + vehicle read only.
-- Never sees customer PII, buy prices or billing. See docs/SECURITY.md §3.
create type public.member_role as enum ('owner', 'admin', 'sales', 'agency');
create type public.member_status as enum ('active', 'suspended');
create type public.fuel_type as enum ('petrol', 'diesel', 'hybrid', 'electric', 'other');
create type public.transmission_type as enum ('manual', 'automatic');
create type public.vehicle_status as enum ('bought', 'preparation', 'ready_for_sale', 'reserved', 'sold');
create type public.lead_source as enum ('website', 'donedeal', 'facebook', 'instagram', 'whatsapp', 'walk_in', 'phone', 'other');
create type public.lead_stage as enum ('new', 'contacted', 'appointment', 'test_drive', 'finance_applied', 'sold', 'after_sales', 'lost');
create type public.lead_score as enum ('hot', 'warm', 'cold');
create type public.activity_type as enum ('note', 'call', 'email', 'whatsapp', 'status_change', 'ai_reply');

-- ========== TABLES ==========

create table public.dealers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique,
  plan public.dealer_plan not null default 'starter',
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.dealer_members (
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'sales',
  status public.member_status not null default 'active',
  invited_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  primary key (dealer_id, user_id)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  email text not null,
  role public.member_role not null default 'sales',
  token_hash text not null unique,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  invited_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  make text not null,
  model text not null,
  year int not null check (year between 1950 and 2100),
  km int not null default 0 check (km >= 0),
  fuel public.fuel_type not null default 'petrol',
  transmission public.transmission_type not null default 'manual',
  buy_price numeric(12,2) check (buy_price >= 0),
  sale_price numeric(12,2) check (sale_price >= 0),
  status public.vehicle_status not null default 'bought',
  nct_expiry date,
  warranty_months int check (warranty_months >= 0),
  description text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index vehicles_dealer_idx on public.vehicles (dealer_id, status);

create table public.vehicle_photos (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  storage_path text not null,
  position int not null default 0,
  is_cover boolean not null default false,
  created_at timestamptz not null default now()
);
create index vehicle_photos_vehicle_idx on public.vehicle_photos (vehicle_id);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  name text not null,
  email text,
  phone text,
  notes text,
  gdpr_consent_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index customers_dealer_idx on public.customers (dealer_id);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  source public.lead_source not null default 'other',
  stage public.lead_stage not null default 'new',
  score public.lead_score,
  assigned_to uuid references auth.users (id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index leads_dealer_idx on public.leads (dealer_id, stage);

create table public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  type public.activity_type not null default 'note',
  body text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index lead_activities_lead_idx on public.lead_activities (lead_id);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  user_id uuid references auth.users (id),
  action text not null,
  entity text not null,
  entity_id uuid,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_logs_dealer_idx on public.audit_logs (dealer_id, created_at desc);

-- ========== HELPERS ==========

-- Security definer helpers avoid RLS recursion on dealer_members.
create or replace function public.user_dealer_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select dealer_id from public.dealer_members
  where user_id = auth.uid() and status = 'active';
$$;

create or replace function public.user_role_in(p_dealer_id uuid)
returns public.member_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.dealer_members
  where user_id = auth.uid() and dealer_id = p_dealer_id and status = 'active';
$$;

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger vehicles_updated_at before update on public.vehicles
  for each row execute function public.set_updated_at();
create trigger leads_updated_at before update on public.leads
  for each row execute function public.set_updated_at();

-- auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ========== ROW LEVEL SECURITY ==========

alter table public.dealers enable row level security;
alter table public.profiles enable row level security;
alter table public.dealer_members enable row level security;
alter table public.invitations enable row level security;
alter table public.vehicles enable row level security;
alter table public.vehicle_photos enable row level security;
alter table public.customers enable row level security;
alter table public.leads enable row level security;
alter table public.lead_activities enable row level security;
alter table public.audit_logs enable row level security;

-- dealers: members can read; only owner can update; delete only owner
create policy "members read dealer" on public.dealers
  for select using (id in (select public.user_dealer_ids()));
create policy "owner updates dealer" on public.dealers
  for update using (public.user_role_in(id) = 'owner');
create policy "owner deletes dealer" on public.dealers
  for delete using (public.user_role_in(id) = 'owner');

-- profiles: user reads/updates own; co-members can read basic profile
create policy "own profile read" on public.profiles
  for select using (
    id = auth.uid()
    or id in (
      select dm.user_id from public.dealer_members dm
      where dm.dealer_id in (select public.user_dealer_ids())
    )
  );
create policy "own profile update" on public.profiles
  for update using (id = auth.uid());

-- dealer_members: members read own dealer's memberships; owner/admin manage
create policy "members read memberships" on public.dealer_members
  for select using (dealer_id in (select public.user_dealer_ids()));
create policy "owner/admin insert members" on public.dealer_members
  for insert with check (public.user_role_in(dealer_id) in ('owner', 'admin'));
create policy "owner/admin update members" on public.dealer_members
  for update using (public.user_role_in(dealer_id) in ('owner', 'admin'));
create policy "owner/admin delete members" on public.dealer_members
  for delete using (
    public.user_role_in(dealer_id) in ('owner', 'admin')
    or user_id = auth.uid() -- leave dealer
  );

-- invitations: owner/admin manage; accept happens via security-definer RPC
create policy "owner/admin read invitations" on public.invitations
  for select using (public.user_role_in(dealer_id) in ('owner', 'admin'));
create policy "owner/admin create invitations" on public.invitations
  for insert with check (public.user_role_in(dealer_id) in ('owner', 'admin'));
create policy "owner/admin delete invitations" on public.invitations
  for delete using (public.user_role_in(dealer_id) in ('owner', 'admin'));

-- vehicles: all members read; owner/admin write
create policy "members read vehicles" on public.vehicles
  for select using (dealer_id in (select public.user_dealer_ids()));
create policy "owner/admin insert vehicles" on public.vehicles
  for insert with check (public.user_role_in(dealer_id) in ('owner', 'admin'));
create policy "owner/admin update vehicles" on public.vehicles
  for update using (public.user_role_in(dealer_id) in ('owner', 'admin'));
create policy "owner/admin delete vehicles" on public.vehicles
  for delete using (public.user_role_in(dealer_id) in ('owner', 'admin'));

-- vehicle_photos: same as vehicles
create policy "members read photos" on public.vehicle_photos
  for select using (dealer_id in (select public.user_dealer_ids()));
create policy "owner/admin insert photos" on public.vehicle_photos
  for insert with check (public.user_role_in(dealer_id) in ('owner', 'admin'));
create policy "owner/admin delete photos" on public.vehicle_photos
  for delete using (public.user_role_in(dealer_id) in ('owner', 'admin'));

-- customers: owner/admin/sales only — agency must never see customer PII
create policy "members read customers" on public.customers
  for select using (public.user_role_in(dealer_id) in ('owner', 'admin', 'sales'));
create policy "members insert customers" on public.customers
  for insert with check (public.user_role_in(dealer_id) in ('owner', 'admin', 'sales'));
create policy "members update customers" on public.customers
  for update using (public.user_role_in(dealer_id) in ('owner', 'admin', 'sales'));
create policy "owner/admin delete customers" on public.customers
  for delete using (public.user_role_in(dealer_id) in ('owner', 'admin'));

-- leads: owner/admin/sales only — agency sees aggregate campaign metrics, not lead PII
create policy "members read leads" on public.leads
  for select using (public.user_role_in(dealer_id) in ('owner', 'admin', 'sales'));
create policy "members insert leads" on public.leads
  for insert with check (public.user_role_in(dealer_id) in ('owner', 'admin', 'sales'));
create policy "members update leads" on public.leads
  for update using (public.user_role_in(dealer_id) in ('owner', 'admin', 'sales'));
create policy "owner/admin delete leads" on public.leads
  for delete using (public.user_role_in(dealer_id) in ('owner', 'admin'));

-- lead_activities: owner/admin/sales read/insert; immutable afterwards
create policy "members read activities" on public.lead_activities
  for select using (public.user_role_in(dealer_id) in ('owner', 'admin', 'sales'));
create policy "members insert activities" on public.lead_activities
  for insert with check (public.user_role_in(dealer_id) in ('owner', 'admin', 'sales'));

-- audit_logs: insert by members, read by owner/admin only; no update/delete
create policy "members insert audit" on public.audit_logs
  for insert with check (dealer_id in (select public.user_dealer_ids()));
create policy "owner/admin read audit" on public.audit_logs
  for select using (public.user_role_in(dealer_id) in ('owner', 'admin'));
