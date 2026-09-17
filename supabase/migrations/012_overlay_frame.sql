-- Cover Studio: let a saved overlay pattern also remember its border/frame, so a
-- dealer can build a template once and only swap the background car photo.
alter table public.overlay_patterns
  add column if not exists frame jsonb not null default '{}'::jsonb;
