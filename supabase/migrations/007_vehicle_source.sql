-- Autonexus 007: store the source listing URL (e.g. DoneDeal) for later API import.
alter table public.vehicles add column if not exists source_url text;
