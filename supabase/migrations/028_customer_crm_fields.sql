-- Autonexus 028: richer CRM contact fields on customers (Search or Create New Contact).
-- Existing columns reused: business_name (company), phone (main phone), email,
-- address_line1 (address), city (town), county, eircode (post code).

alter table public.customers
  add column if not exists title text,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists job_title text,
  add column if not exists data_consent text,
  add column if not exists ddi_phone text,
  add column if not exists fax text,
  add column if not exists mobile text,
  add column if not exists country text default 'IE';
