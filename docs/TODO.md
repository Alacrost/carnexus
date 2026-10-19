# AutoNexus — current delivery checklist

Updated: 2026-09-27. This is the operational source of truth for what remains. `ROADMAP.md` describes the wider product vision; completed local work is evidenced in `DELIVERY.md`.

## Completed locally

- [x] Multiple trade-ins with individual vehicle/history entry, finance settlement, negative equity and Deal confirmation summary.
- [x] Per-car post-invoice reversal: replacement standalone PO for retained cars; return blocked while PO payments remain unreversed.
- [x] Persistent vehicle history reports and current buyer disclosure required before invoice; additional positive findings invalidate prior confirmation.

- [x] Transactional Deal/SO flow, assigned salesperson, deposits, agreement and invoice.
- [x] PO-backed acquisition, supplier/lender liabilities and `to be paid` reporting.
- [x] Required purchase reference/date/arrival/mileage; optional unknown purchase and sale prices.
- [x] Guarded deletion of an unused direct PO, its financial rows and vehicle.
- [x] Reviewed cancellation, credit notes, confirmed vehicle-return refunds and retained-trade-in replacement PO.
- [x] Vehicle preparation queue with cleaning/photos and dealer-defined service, maintenance and bodywork.
- [x] CRM tasks, appointments, customer timeline, invitations/member controls and bounded CSV exports.
- [x] Permission alignment and clean test/typecheck/lint/build gates.
- [x] Invoice-backed revenue, open-agreement reporting and PO/vendor/lender outstanding reporting.
- [x] Sales attribution to the responsible salesperson rather than the record creator.
- [x] Cheque/bank-draft receipts, unpresented-receipt reporting and audited clearance.
- [x] Rejected/bounced cheque and draft reversal with immutable compensating movement and reopened customer balance.
- [x] Internal Message Centre with direct conversations, unread/read state, record links and automatic assignment alerts.
- [x] Manual bank-statement reconciliation with account/period setup, split matching, balance proof and immutable completed periods.
- [x] Source-linked nominal ledger, trial balance, management P&L, aged debtors/creditors and auditable accounting-period close/reopen.
- [x] Review-only VAT3 working figures with explicit close blockers; never presented as a filed or accountant-approved return.
- [x] Configurable invoice backdating with separate effective/issue dates, role restriction, future-date rejection and closed-period enforcement.
- [x] Atomic bank-statement CSV import with signed amounts, duplicate-content detection and audited batches.
- [x] Reviewed manual journals with balanced drafts, independent posting, immutable ledger inclusion and reversing entries.
- [x] Multiple opening deposits with date, method, reference and independent clearance state; entry dates default to today.
- [x] Post-invoice partial collection, customer overpayment visibility and immutable receipt reversal that reopens the balance.
- [x] Explicit no-deposit agreement action while untouched pre-invoice records remain quotes.
- [x] Sales reports filter by period/custom dates, status, responsible salesperson and branch, with Deal-date or invoice-date basis.
- [x] Full sales-receipt audit register with entry actor/time, manual effective date, method, reference, status and reversal reason.
- [x] Multi-location setup and Deal attribution to the selected dealership branch.
- [x] Deal customer step persists the buyer immediately for later reuse, with replay-safe creation/update and actor/time audit.
- [x] Wide, structured Deal payment register separating effective payment date from recorded-at/by audit data, with live balance after each confirmed deposit.

## Next product work

### P0 — financial integrity gaps

- [ ] Extend bank reconciliation with bank-to-bank transfers, reviewed contra/write-off entries and OFX import. Manual entry and CSV import are complete.
- [ ] Extend effective dates to an explicit supply/delivery-date policy where it differs from invoice date. Configurable invoice look-back and closed-period enforcement are implemented.
- [ ] Add an audited workflow for filling an acquisition amount initially recorded as unknown.
- [ ] Validate accountant access to clearance/reconciliation against the final role policy.

### P1 — accounting and statutory reporting

- [ ] Extend the core nominal ledger with dealer-defined accounts, locations/cost centres and year-end opening-balance carry-forward. Reviewed manual journals are complete.
- [ ] Add configurable ageing buckets and historical “as at” snapshots. Current debtors/creditors show live age and outstanding amount.
- [ ] Complete accountant-approved VAT sales/purchase registers, VAT3/RTD, EU/Intrastat/VRT/TAN/G46 data contracts. Current VAT3 figures are a review-only domestic working draft and margin/EU/import cases remain exceptions.
- [ ] Cash/lodgement, PO money-out, SO money-in, post-sale cost and vehicle-movement reports.
- [ ] Stock-at-date valuation and document/vehicle/status exception reports.

### P1 — CRM and operations completion

- [ ] Message search, archive/mute, attachments and retention. The current centre refreshes every eight seconds; provider realtime/presence is not claimed.
- [ ] Email delivery for invitations; current secure links are manually shared.
- [ ] GDPR retention/purge scheduling and complete data-subject export. Current CSVs are operational only.
- [ ] Customer/vehicle document evidence, maintenance attachments and electronic signatures.
- [ ] Preparation workload/team metrics if dealer usage shows the queue needs capacity planning.

### P2 — integrations and other products

- [ ] Real DoneDeal/Carzone/CarsIreland feeds and publishing/reconciliation.
- [ ] Website, email, DoneDeal and Meta lead-ingestion adapters with deduplication.
- [ ] Facebook, Instagram and WhatsApp provider integrations; no simulated publishing success.
- [ ] Stripe billing, plan enforcement and platform super-admin.
- [ ] Premium white-label websites, domains and shared-stock publishing.
- [ ] Full BI and market-price comparison after the accounting contract stabilises.

## Explicitly deferred by current decision

- [x] Apply migration `076` to hosted Supabase. Applied 2026-09-27; post-application dry-run confirms no pending migrations through `076`.

- [x] Apply local migrations `042`–`060` to hosted Supabase. Applied and verified 2026-09-21; remote dry-run reports up to date.
- [x] Apply migration `061` to hosted Supabase. Applied and verified 2026-09-21; remote dry-run reports up to date.
- [x] Apply migrations `062`–`064` to hosted Supabase. Applied and verified 2026-09-21; remote dry-run reports up to date.
- [x] Apply migration `065` to hosted Supabase. Applied and verified 2026-09-21; remote dry-run reports up to date.
- [x] Apply migrations `066`–`069` to hosted Supabase. Migration `069` links an existing unprovenanced vehicle to a new PO without duplicating the car; applied and verified 2026-09-22 by an up-to-date remote dry-run.
- [x] Apply migration `070` to hosted Supabase. Its original PO-at-Deal-opening gate was superseded by migration `071` after the workflow was clarified.
- [x] Apply migration `071` to hosted Supabase. Deals may open before the PO; final completion/invoice waits for a verified PO with required direct-purchase details. Applied and verified 2026-09-23 by an up-to-date remote dry-run.
- [ ] Hosted login and full authenticated end-to-end acceptance.
- [ ] Upgrade/confirm the paid Supabase plan and obtain a restorable scheduled backup before real dealer data. Dashboard verification on 2026-09-21 still shows `FREE` and `LAST BACKUP No backups`.
- [ ] Hosted isolation acceptance with two dealers/users.
- [ ] Redesign or full validation of base/custom roles.

These remain mandatory before production onboarding even though they are intentionally deferred during local development.

## Immediate recommended order

1. Upgrade Supabase and verify a restorable scheduled backup; do not onboard real dealers before this.
2. Hosted login/E2E and two-dealer isolation acceptance.
3. Bank transfer/contra/write-off and OFX workflow.
4. Accountant-approved statutory data contracts and provider-backed integrations.
