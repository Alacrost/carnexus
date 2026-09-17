-- Autonexus 019: assign a responsible salesperson to each viewing.
-- Picked from staff (dealer_members) or typed manually when the person isn't a
-- staff member yet. Stored as a name so a not-yet-added salesman still works.

alter table public.viewings
  add column if not exists responsible text;
