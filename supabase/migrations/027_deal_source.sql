-- Autonexus 027: deal lead source (how the customer found us).
alter table public.deals
  add column if not exists source text;
