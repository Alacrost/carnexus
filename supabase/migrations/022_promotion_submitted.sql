-- Autonexus 022: promotion "submitted for approval" flag.
-- A creator submits a draft → it enters the manager's approval queue. Approving
-- clears the flag and publishes. Buckets: active / awaiting approval / drafts / expired.

alter table public.promotions
  add column if not exists submitted_for_approval boolean not null default false;
