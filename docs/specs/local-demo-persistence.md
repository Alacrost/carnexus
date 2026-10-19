# Local sales demo persistence

The existing development-only demo flag remains unchanged. In demo mode, the sales
client uses a local PGlite PostgreSQL database at `.autonexus-demo/postgres`.
This folder is ignored by Git. No Supabase URL or key is used by this local client,
and a local failure never falls back to the remote database.

## Included

- Customer intake from New Deal, search for saved customers and customer history.
- New Deal autosave with stable session identity, revision checking and request replay.
- Vehicle Interest without deposit, non-reserving quote, explicit agreement without
  deposit, and the existing deposit/trade-in agreement triggers.
- Saved Deal detail/edit/finish review, documents, event log and financial RPCs.
- Local Deals, Customers and Quotes lists. Deal quotations without expiry remain in
  Historical; no validity date is invented.
- Purchase creation, list and detail now use the same local database. Creating a PO
  for an existing vehicle resolves its persisted identity, including known legacy demo
  links. Newly saved POs no longer redirect to a static-fixture-only 404 page.
- Files persist across browser reloads and development-server restarts. The New Deal
  form itself retains its existing same-tab reload recovery; after leaving it, reopen
  the saved Deal from Sales & Deals.

All migrations run against the **local** database on its first initialization. Later
starts apply only new migrations; a changed already-applied SQL file fails explicitly.
The seeded company and printable quote/agreement are visibly marked TEST ONLY.
PO, stock, money, audit and idempotency rules come from the same SQL as production.

## Limits / operation

- Development only; the existing production demo prohibition remains in place.
- One running development server per checkout/local database. Not a hosted,
  multi-user or multi-device demo service. First opening may take longer to initialize.
- Use fictitious information. The local folder is not encrypted or remotely backed up.
- Other demo modules can still show their original fixtures; this is not persistence
  for the entire application. Inventory editors, legacy intake-completion actions, bank reconciliation,
  reports, marketing and team management were not converted in this task.
- Cars are seeded without fabricated purchase orders. The purchase workflow can now
  record and reopen their actual PO in the local database. Invoice completion still
  requires a verified PO; quote and agreement do not bypass it. Inventory demo screens
  may still show fixtures and are not evidence of the latest persisted stock state.
- The separate Customers “create” dialog is still legacy preview behavior; persistent
  customer intake in this delivery is through New Deal → Continue.
- No reset/delete of existing demo data is performed automatically. To start a fresh
  demo later, stop the server and preserve/rename the specific `.autonexus-demo` folder
  first. Do not run multiple processes against that same database.
- Switching out of demo uses the existing Supabase client; local data is not uploaded.

## Verification

`npm run test:demo` creates its own disposable OS-temporary database, tests customer
save, autosave/replay, quote, explicit no-deposit agreement, deposit trigger, reopening
the on-disk database, and missing-PO protection. `npm test` exercises the existing
commercial and CRM regression suite, including trade-ins and cancellation/refunds.
Browser verification also covers New Deal autosave, quote rendering, agreement
creation, saved detail reload and printable agreement rendering.
