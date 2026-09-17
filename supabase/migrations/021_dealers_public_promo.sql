-- Autonexus 021: expose the dealer trading name on the public promo T&C page.
-- Only dealers that have an ACTIVE promotion become publicly readable (name/slug),
-- so the shareable /promo/[id] page can show the dealer's branded wordmark.
-- Trading names are public information; no PII is exposed.

create policy "dealers public via active promo" on public.dealers
  for select using (
    exists (
      select 1 from public.promotions p
      where p.dealer_id = dealers.id and p.status = 'active'
    )
  );
