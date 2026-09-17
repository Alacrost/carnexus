-- Autonexus 017: scheduled social content (Social Media Studio + Dashboard calendar)
-- One row per planned/created post. Draft-first — never auto-published (AGENTS.md).
-- Shared by the Social Media Studio (M6) and the Dashboard content calendar (M8).
-- Rules: dealer_id + RLS. Marketing write (owner/admin/agency); members read.

create table public.scheduled_content (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  channel text not null check (channel in ('facebook', 'instagram')),
  kind text not null check (kind in ('tip', 'info', 'car_of_week', 'promo', 'custom')),
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'posted', 'late', 'cancelled')),
  scheduled_for date,
  body text,
  hashtags text,
  image_path text,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  promotion_id uuid references public.promotions (id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index scheduled_content_dealer_date_idx
  on public.scheduled_content (dealer_id, scheduled_for);

alter table public.scheduled_content enable row level security;

create policy "content read" on public.scheduled_content
  for select using (dealer_id in (select public.user_dealer_ids()));
create policy "content insert" on public.scheduled_content
  for insert with check (public.user_role_in(dealer_id) in ('owner', 'admin', 'agency'));
create policy "content update" on public.scheduled_content
  for update using (public.user_role_in(dealer_id) in ('owner', 'admin', 'agency'));
create policy "content delete" on public.scheduled_content
  for delete using (public.user_role_in(dealer_id) in ('owner', 'admin', 'agency'));
