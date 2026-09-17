-- Autonexus 031: product entitlements per dealer. The three separately-sold products
-- (Sales CRM, Marketing Studio, Dealer Website) are toggled per dealer. Nav/routes gate on
-- these. Default: sales + marketing on, website off (website is a later, separate product).

alter table public.dealers
  add column if not exists modules jsonb not null default '{"sales": true, "marketing": true, "website": false}';
