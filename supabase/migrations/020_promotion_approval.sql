-- Autonexus 020: promotion T&C approval / signature.
-- Terms must be approved & signed by a manager (owner or admin = marketing manager)
-- before a promotion goes public. The signature is shown on the public T&C page.

alter table public.promotions
  add column if not exists approved_by text,
  add column if not exists approved_role text,
  add column if not exists approved_at timestamptz;
