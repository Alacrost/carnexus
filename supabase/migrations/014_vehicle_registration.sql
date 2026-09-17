-- Autonexus 014: Vehicle registration (plate) + DoneDeal sync groundwork
-- The registration (Irish plate) is required going forward so we can cross-reference
-- stock with DoneDeal. Columns are nullable in the DB (existing rows) but enforced in
-- the app (form + zod). donedeal_ad_id / last_synced_at back the live sync (stubbed now).

alter table public.vehicles
  add column if not exists registration text,
  add column if not exists donedeal_ad_id text,
  add column if not exists last_synced_at timestamptz;

-- Lookup by plate within a dealer (used by the future DoneDeal reconcile).
create index if not exists vehicles_dealer_registration_idx
  on public.vehicles (dealer_id, registration);
