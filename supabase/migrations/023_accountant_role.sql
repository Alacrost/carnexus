-- Autonexus 023: dedicated accountant role.
-- Read financials + manage deal records; no marketing. Added to the member_role enum.
-- (ALTER TYPE ADD VALUE runs outside a txn block; safe as its own migration.)

alter type public.member_role add value if not exists 'accountant';
