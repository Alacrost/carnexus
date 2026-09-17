-- Autonexus 015: tag ad scripts by vehicle type (SUV, 7-seater, hatchback…)
-- Lets a dealer keep a standard DoneDeal description per car type. Nullable = "any type".

alter table public.ad_scripts
  add column if not exists vehicle_type text;
