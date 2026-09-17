-- Autonexus 035: Service Agreement acceptance (onboarding gate, like GarageManager's ToS).
-- The dealer must accept the current Terms of Service before using the app for writes.

alter table public.dealers
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text,
  add column if not exists terms_accepted_by uuid;
