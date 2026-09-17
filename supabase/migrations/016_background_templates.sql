-- Autonexus 016: saved background templates for the Photo/Cover Studio
-- A dealer defines their standard backdrop once (a short description / prompt) and
-- reuses it when improving any car photo. The car is never altered — only the
-- background around it (docs/SECURITY.md §9). Same access model as overlay_patterns.
-- ponytail: a template is a named prompt (no generated image stored) — the existing
-- image-edit background op uses the prompt. Add a preview image_path only if needed.

create table public.background_templates (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  name text not null,
  prompt text not null,
  created_at timestamptz not null default now()
);

create index background_templates_dealer_idx
  on public.background_templates (dealer_id);

alter table public.background_templates enable row level security;

create policy "backgrounds read" on public.background_templates
  for select using (dealer_id in (select public.user_dealer_ids()));
create policy "backgrounds insert" on public.background_templates
  for insert with check (public.user_role_in(dealer_id) in ('owner', 'admin', 'agency'));
create policy "backgrounds delete" on public.background_templates
  for delete using (public.user_role_in(dealer_id) in ('owner', 'admin', 'agency'));
