# Product direction and delivery log

Updated 2026-09-27. This supersedes older marketing-first priorities in VISION/ROADMAP.

## Multiple trade-ins and hosted rollout — 2026-09-27

- New Deal supports multiple trade-ins entered by plate, vehicle/history details and negotiation, followed by a confirmation summary. Negative equity increases the buyer balance.
- Each trade-in has its own PO. Post-invoice returns resolve each car separately: retain it under a replacement standalone PO or return it to the customer. Returning a trade-in is blocked until its PO payments are regularized/reversed.
- Vehicle history findings remain visible on resale. Invoice issuance requires current buyer confirmation for positive findings; a new positive report requires renewed confirmation. New quote/agreement/invoice snapshots include the recorded findings.
- Migration `076_multi_trade_ins_and_vehicle_disclosures.sql` was dry-run and applied to linked project `wrpambhxyrcehefxpyli`. The post-application dry-run confirmed the remote database is up to date, with no pending migrations. The optional local Docker catalogue cache warning did not affect application.
- Hosted authenticated end-to-end acceptance, external plate lookup and the previously deferred operational checks remain separate work.
- Production build completed successfully on 2026-09-27, including TypeScript and all 46 static pages, after allowing the existing Google Fonts download. No font or environment configuration change was needed.

## Agreed product

Three independently sold products share tenant identity and stock:

1. **Sales CRM (primary):** enquiry to after-sales, salesperson/manager/admin/owner workflows, configurable roles, ownership, follow-up, documents/payments, reports and an attributable audit trail.
2. **Marketing support:** DoneDeal ad copy/assets and promotion planning with reviewed terms. Social automation is not the core product.
3. **Dealer Website:** selectable market-standard premium templates (clean, restrained, Apple-inspired quality without copying assets), dealer colours/copy and shared stock. Independent subscription.

Later: Meta Ads lead collection, website/email/DoneDeal intake, messaging policies and assisted AI replies, provider integrations, evidence-based analytics. Meta lead capture is distinct from ad creation/publication. Platform operations will manage dealers, subscriptions, product entitlements, usage and support access.

## Working method — Ponytail

Plan each bounded slice before code; reuse Next.js/Supabase and native controls; add no speculative infrastructure. Record shipped versus pending; tests must fail on security/money regressions. User has authorised implementation without repeated approvals. Only unresolved product choices require clarification. No credentials in source and no untested remote migrations.

## Delivery sequence

| Stage | Scope | State |
|---|---|---|
| 1 | CRM lead workflow, follow-up, immutable audit, scoped CRM roles, lead reporting; immediate RPC authorisation fixes | Implemented and tested locally; staging pending |
| 2 | Transactional sales/purchases/payments, trade-in settlements, document numbers, vehicle specifications | Core implemented and tested locally; staging and reversal workflows pending |
| 3 | Complete CRM operations: tasks/appointments, invitations, customer history and operational exports | Implemented and tested locally; retention automation and staging pending |
| 4 | Website themes/domains/stock photos/intake; focused DoneDeal and promotions UX | Planned |
| 5 | Email/DoneDeal/Meta Ads lead adapters, deduplication, inbox; AI review then explicitly configurable automation | Planned; provider credentials/access required |
| 6 | Platform management, billing/provisioning, cross-product analytics and rollout | Planned |

Detailed pre-implementation plan for commercial reversals, CRM tasks/appointments,
customer timeline, invitation management, operational exports, legacy permission alignment
and lint closure: [sales-crm-completion-ponytail.md](specs/sales-crm-completion-ponytail.md).
Hosted login/E2E acceptance, plan/backups, hosted two-dealer isolation and role redesign are
explicitly deferred. Slices 0 + 1 were the first authorised implementation unit and are now
recorded below. Slice 2 remains a separate decision; no hosted migration has been authorised.

Subsequent business rules have been captured, but are deliberately not yet scheduled, in
[inventory-procurement-sales-lifecycle.md](specs/inventory-procurement-sales-lifecycle.md):
inventory must originate from a PO (direct customer purchase, supplier purchase or trade-in),
PO vendor/lender payments drive the `to be paid` reports, an open Deal means the agreement
phase, and Deal completion is atomic with final invoice generation. Prior invoice/effective
dates must preserve the actual server issue timestamp and require an accountant-approved policy.

### Reviewed pre-invoice cancellation — 2026-09-19

Slices 0 and 1 of the completion plan are implemented locally. Migration 042 adds an
idempotent, version-checked `cancel_deal` command with mandatory reason, audit/event history,
document voiding without snapshot deletion, safe stock release and an optional explicit linked-
lead transition. Net receipts must be refunded first; invoiced and trade-in deals remain protected
for their later credit-note/reversal slices. The legacy bare `status=cancelled` path is blocked.

`npm test`, TypeScript, focused lint and production build passed. Browser demo review covered the
normal and payment-blocked panels. Full lint is unchanged at the known legacy baseline of 7 errors
and 1 warning. No hosted migration was applied.

## Stage 1 plan (before implementation)

- Reuse `leads`, `customers`, `lead_activities`; add title, next action/date, loss reason and version for optimistic concurrency.
- One transactional database command creates/updates a lead and records who changed which workflow fields. A separate command records notes/calls/email activity (logging only; no email transport).
- Reuse the existing stage enum; new → contacted → appointment → test drive → finance → sold → after-sales; lost requires a reason. Completed sales must link to the commercial workflow in stage 2; stage 1 must not pretend a lead label books a sale.
- CRM permission sets control read/work/assign/report. Owner/admin retain oversight. Manager is a configurable CRM profile over the sales base role; this does not grant billing/financial/legacy-module permissions. Owner configures CRM profiles and assignment. Legacy security remains a separate stage-2 task.
- Database checks tenant references and active assignees, blocks unauthorised direct writes, records attributable append-only workflow events, and computes reports in SQL without the 1,000-row client limit.
- UI: searchable/paginated leads, pipeline filters, lead detail with activity history and next action, report counts by stage/source/assignee and overdue follow-up. Explicit empty/error/demo states.
- Setup example and runnable regression checks; apply migrations only to disposable test data locally, not a remote project.

## Stage 1 acceptance

Create lead + contact atomically; assign only active same-dealer sales staff; stale edit is rejected; loss requires reason; terminal stage clears follow-up; workflow changes and notes record server-controlled actor/time; agency/non-member cannot read CRM; profile removal does not silently restore default CRM access; reports respect the same permissions; no fake Meta/DoneDeal connection success.

## Environment

Local implementation uses `feat/crm-foundation`. The Supabase project `wrpambhxyrcehefxpyli` is linked to the repository and has migrations 001–041. The app still needs its local public URL/key configuration and authenticated browser acceptance checks before this environment is considered ready for operational use. Existing audit remains the baseline for unresolved security and commercial issues.

## Stage 1 delivery — 2026-09-17

- Lead creation/contact creation are atomic; editing uses a version check. Next action, responsible salesperson, loss reasons, source and stage changes are attributable in append-only history. Notes/call/email/WhatsApp entries log activity only; they do not send messages.
- Added lead search, pagination, detail/edit, reports by period/stage/source/salesperson, and owner-managed CRM profiles. The existing appointments screen remains at `/leads/viewings` with its legacy permissions; the new profiles govern leads and their reports, not every legacy module.
- Continue-to-deal carries the lead, source and contact into the existing sale form. Completing a deal is still the legacy workflow and is not certified transactional. A lead cannot be labelled sold without an associated completed deal.
- Closed missing-membership invitation/credit RPC checks and admin-to-owner escalation. Public stock cannot select `buy_price`; public dealer lookup returns only identity fields. Dealers cannot self-provision modules or credits through ordinary table updates.
- Removed the placeholder DoneDeal sync action and misleading success state. Website stock uses the local inventory; external feeds and Meta Ads remain planned integrations.
- Added `.env.example`, Node 24 test scripts and a disposable PostgreSQL regression suite. No remote database was modified.

### Validation

- `npm test`: passed. Applies all 39 migrations and exercises two tenants, anonymous/non-member denial, escalation prevention, permission revocation, atomic rollback, stale edits, workflow guards, immutable activity, reports and public column restrictions.
- `npm run typecheck`: passed.
- `npm run build`: passed, including all new routes.
- Browser preview: lead list, creation form, detail, report period controls and team/profile page render. Demo deliberately does not persist changes and does not fabricate report performance. Real authenticated Supabase browser flows remain a staging requirement.
- Full `npm run lint`: **9 existing errors and 1 warning remain**, down from the audit baseline of 11 errors and 1 warning. Findings concern state updates in legacy deal/purchase/marketing effects, a marketing `prefer-const`, and an inventory hook dependency. Separate ESLint validation of the leads directory, CRM libraries and tests passed.

### Next bounded slice

Stage 2 must first make sale creation/completion/payments atomic and align role enforcement, then verify stock reservation, financial totals, document numbering and audit attribution together. Remaining audit P0s and global role coverage must be closed before production onboarding. Stage 1 is a foundation, not a claim that the complete CRM or all three commercial products are finished.

## Stage 2 delivery — 2026-09-18

Planned in [sales-purchases-stage2.md](specs/sales-purchases-stage2.md) before implementation. Reused existing tables and UI. Replaced separate commercial writes with one transactional command, rather than adding a second sales system. No new dependency.

- A sale locks its vehicle, reserves stock, allocates Deal/SO numbers, and records an initial deposit atomically. A second active deal on the same car is rejected. Price overrides require an explicit button, permission, reason and current version.
- Multiple receipts/refunds and lender payouts use server-side balances, cents validation, tenant checks and replay protection. Pending finance is separate from received funds. Negative trade equity is retained. Purchase and trade-in create stock, cost records and numbered POs together.
- Purchase balances separate vendor and lender obligations, including partial settlements and due dates. A trade-in PO remains outstanding independently of the completed customer sale. A trade-in cannot itself be sold before the originating sale completes.
- Completion requires an agreed deal, a current agreement, zero customer balance and receipt of expected finance. It marks stock sold, updates the commercial record, advances a linked lead and issues the invoice in one transaction.
- Agreements/invoices preserve snapshots, document numbers, SO/deal references, customer and finance-company recipient, vehicle, line items, receipts, trade-in, company address/registration and configured terms. Price/finance/add-on changes require a new agreement. Customer address and seller VAT registration are checked before taxable invoice issue. Margin VAT on the vehicle is not separately disclosed; add-ons have explicit tax rates.
- Purchase price is revealed on hover/focus/tap only after server-side permission. Custom CRM profiles now include commercial price, cost, purchase and payment permissions. This is not a global permission redesign of marketing/billing.
- Vehicle records include VIN, trim, body, colour, engine capacity, keys, previous owners, logbook, service status/dates, maintenance entries, equipment, condition, NCT and warranty. Changes carry the authenticated actor in the audit.
- New migrations: `040_commercial_workflow.sql`, `041_vehicle_details_payables.sql`. No remote migration or deployment performed.

### Checks

`npm test`, TypeScript and production build passed. Tests apply all 41 migrations and cover atomic rollback, tenant/role/cost restrictions, fixed vehicle, duplicate submissions, overpayment, refunds, negative equity, vendor/lender splits, finance approval, agreement/completion/invoice guards, immutable records and maintenance history. Browser preview verified the locked sale vehicle, explicit price editor, finance/payment panels, vehicle details and document settings. This is not a substitute for authenticated Supabase staging tests.

Full lint now has **7 pre-existing marketing errors and 1 inventory warning**; the changed commercial screens have no reported lint findings. Node's native TypeScript test loader emits a harmless module-type warning.

### Remaining before production

- Connect a staging Supabase project; review historic duplicate/open deals, price/stock mismatches and old payment/trade-allowance entries before rollout. Existing records are retained, not silently reinterpreted or deleted.
- Reviewed trade-in cancellation/reversal and credit-note/refund flows after invoice issue. Closed deals and invoices are deliberately protected; a deal with a trade-in cannot currently be cancelled through the ordinary cancel button.
- Bank reconciliation, actual transfers, lender APIs and dealer floorplan borrowing are not implemented. Finance approval/receipt/settlement are staff-entered records.
- Full permission alignment of remaining legacy modules, remaining audit P0s, file evidence for maintenance/agreements, electronic signatures and advanced tax cases remain separate work. New document terms are configurable text, not automatically approved legal terms.
- Document rendering reference: [Revenue — VAT invoice information](https://www.revenue.ie/en/vat/vat-records-invoices-credit-notes/invoices/information-required-vat-invoice.aspx); [Revenue — margin scheme](https://www.revenue.ie/en/vat/vat-on-goods/schemes/margin-scheme/index.aspx). No claim of comprehensive tax certification.

## Supabase activation — 2026-09-19

- Linked the repository to project `wrpambhxyrcehefxpyli` in the AutoNexus organization.
- Confirmed the remote migration baseline was exactly 001–010, then applied 011–041 in order. A second dry run reports the remote database is up to date.
- Existing records were preserved: 2 authenticated users, 1 dealer, 1 dealer member, 1 vehicle and 2 Storage objects were present before and after migration.
- Post-migration checks found 42 public tables with RLS enabled on all 42. CRM commands, commercial commands, purchase balances and vehicle-detail storage are present.
- The dashboard still displayed the organization/project as Free and showed no scheduled backups immediately after the reported plan upgrade. Recheck billing propagation and the first scheduled backup before onboarding live dealers.

### TODO after activation

#### P0 — finish environment acceptance

- Add only `NEXT_PUBLIC_SUPABASE_URL` and the public publishable/anon key to `.env.local`; never add `service_role` to the browser app or Git.
- Restart the local app without demo mode and test sign-in, dealer selection and RLS-backed pages with the existing owner account.
- Run one authenticated end-to-end acceptance flow: create lead → follow-up → sale → agreement → finance/payment → invoice; also test purchase, trade-in and lender settlement.
- Verify the plan upgrade appears on the AutoNexus organization and that scheduled backups are active. Capture the first successful backup before onboarding live dealers.
- Add a second test user/dealer and rerun tenant isolation, sales cost visibility, price override and custom-role checks against the hosted database.

#### P1 — complete the sales product

- Implement reviewed cancellation/reversal, post-invoice credit notes and trade-in rollback rules.
- Add CRM tasks/appointments, customer timeline, assignment rules, invitations and exports/retention controls.
- Complete bank reconciliation and finance-provider operational states without representing staff-entered events as real bank/provider confirmation.
- Finish permission alignment for legacy marketing, billing and inventory operations; close remaining audit P0 findings and legacy lint failures.

#### P2 — expand the other products

- Build selectable white-label website themes, custom colours/text/domains and shared-stock publishing.
- Add DoneDeal-focused ad creation and promotion planning with configurable terms; integrate a stock/API feed only when provider access is available.
- Add deduplicated lead intake adapters for website, email, DoneDeal and Meta Ads, followed later by Facebook/Instagram/WhatsApp messaging integrations.
- Add configurable AI reply rules, tone, manual/automatic approval, escalation and auditable analytics for sales, marketing and stock.
- Add platform administration for dealers, subscriptions, three-product entitlements, usage, support access and consolidated reporting.

## Sales CRM completion — local delivery 2026-09-19

- Added reviewed pre-invoice cancellation in migration `042`, with mandatory reason, version/replay protection, immutable history, stock release checks and explicit linked-lead handling.
- Added post-invoice corrections in migration `043`. Partial credit notes never move money or stock. A refund can now occur only inside a confirmed physical return of the sold vehicle; the same transaction issues the full remaining credit note, records customer/finance refunds, marks the deal reversed and puts the vehicle into preparation.
- Full-return automation is deliberately blocked for sales containing a trade-in until the return-of-trade-in and already-paid-lender policy is approved.
- Added guided cancellation/correction/return controls and printable credit notes based on frozen invoice facts. No issued invoice is overwritten.
- Cleared the legacy lint baseline (7 errors and 1 warning). All repository gates now pass: tests, typecheck, lint and production build.
- Migrations `042` and `043` remain local and have not been applied to the hosted Supabase project. Hosted login/E2E, plan/backups, two-dealer hosted isolation and the wider roles redesign remain deferred as agreed.
- Added migration `044` for returned sales whose trade-in is retained. It cancels and links the original deal PO, creates a new standalone approved PO at the dealer-selected value, and carries prior lender/vendor payments forward as non-cash linked entries. Downstream-used trade-ins and replacement values below the lender settlement are blocked for manual resolution. Migration `044` is also local only.
- Added migration `045` and `/inventory/preparation`: an automatic preparation queue with cleaning/photo gates, dealer-added service/maintenance/bodywork tasks, scoped preparation-team membership, assignment, progress, completion history and final release to `ready_for_sale`. A photo checklist cannot be signed off without a real stored vehicle photo. This migration also remains local only.
- Added migrations `046`–`050` for transactional CRM tasks/appointments, a paginated safe customer timeline, audited invitation/member lifecycle, bounded CSV exports and legacy permission alignment. CRM CSV is operational only, capped at 5,000 rows and protected against spreadsheet-formula injection; it is not presented as a GDPR subject-access export.
- Added `/leads/tasks`, linked appointment history, `/business/customers/[id]`, `/settings/team` and server-generated exports for filtered leads, customers, tasks and appointments. Raw invitation tokens are shown only after create/resend; token hashes never leave the database.
- Existing per-vehicle `vehicle_deals`/`vehicle_costs` are now read-only. New commercial writes remain in transactional Deals and Purchase Orders. The documented capability matrix now matches `can`, `crm_allowed`, `commercial_allowed`, `preparation_allowed`, RLS and column grants.
- Data-retention policy, purge scheduling and a complete GDPR subject-access package remain pending and are not claimed by the operational CSV feature.
- Local validation after migrations `042`–`050`: `npm test`, `npm run typecheck`, full `npm run lint` and `npm run build` all pass. The first sandboxed build attempt could not reach Google Fonts; the permitted network build fetched Geist and completed successfully. No migration in this delivery was applied remotely.

## PO-backed inventory and commercial reporting — local delivery 2026-09-20

- Added migration `051`: every new purchase or trade-in now gives the vehicle an immutable originating PO and sends it to preparation. Existing vehicles are linked only where one real, active PO proves provenance; all others remain visibly `legacy_unresolved`.
- Removed the ordinary add-vehicle, mark-sold and delete-stock paths. Authenticated table writes to vehicles are revoked; transactional acquisition, preparation, return and invoice workflows own lifecycle transitions.
- Added one canonical PO payable calculation separating vendor due/paid, lender due/paid, combined `to be paid`, partial/overdue/reversed state and unpaid stock liability. Purchases and reports consume the same database result.
- Added migration `052`: a Deal counts as open only while a non-void agreement matches its current version. Period revenue is derived from issued invoices less issued credit notes; pipeline labels and vehicle status do not create revenue.
- Updated Purchases, Inventory, Sales pipeline and Commercial control screens to expose these rules and retain CSV exports.
- Irish Revenue guidance was used as a boundary: issued invoices/credit notes remain the evidence trail, and Margin Scheme vehicle VAT is not disclosed separately. This is product logic, not tax certification.
- Prior invoice dates remain disabled. The maximum look-back, supply-date rule and closed accounting-period policy require dealer/accountant approval before implementation.
- Migrations `051`–`052` are local only. Hosted login/E2E, plan/backups, hosted two-dealer isolation and full role redesign remain deferred.
- Added migration `053` after business-rule review. Direct purchases now require supplier invoice reference, purchase date, dealership-arrival date and mileage. Purchase price is optional and an unknown value remains visibly pending rather than becoming a false €0; sale price remains optional.
- Owner/admin can delete an unused direct-purchase PO and vehicle through one guarded transaction. PO payments and dependent financial lines are removed first within the same commit; vehicles with Deal/SO/trade-in/replacement history are protected and must use cancellation or reversal. The application also requests deletion of stored vehicle-photo objects after the database transaction succeeds.

## Sales attribution and receipt clearance — local delivery 2026-09-20

- Reviewed the supplied GM-National Motors HTML references as untrusted product evidence and recorded the functional inventory in `docs/specs/reference-system-capability-extraction.md`. No embedded script was executed and no reference data or design was copied.
- Added migration `054`. The Deal creator remains an audit fact; the assigned responsible salesperson is frozen on the invoice and owns the sale in reports.
- The invoice register now exposes buyer, phone, vehicle, invoice number/date, responsible salesperson, gross, credits, net and any receipt awaiting clearance. A separate ranking aggregates invoiced revenue by responsible salesperson.
- Added cheque and bank-draft receipt methods. They settle the Deal balance and permit completion/invoicing, but stay in an audited unpresented-receipts queue until an owner, admin or accountant records bank clearance. Manual refunds remain prohibited; refunds are produced only by the confirmed vehicle-return/reversal workflow.
- Internal messaging is specified as a separate dealer-scoped slice with membership checks, unread/read state, record-context links and automated assignment notifications. It is not represented as implemented yet.
- Local validation passes: all migrations and transaction tests, typecheck, lint and production build. Migration `054` remains local and was not applied to hosted Supabase.

## Internal Message Centre and backlog reconciliation — local delivery 2026-09-21

- Added migration `055` with immutable dealer-scoped conversations, participant-only RLS, idempotent commands, unread/read tracking and automatic responsibility notifications for Deal and CRM-lead assignments.
- Added `/messages` with a studio-style conversation surface, colleague picker, unread badges, automatic eight-second refresh and safe contextual links from Deal, lead, customer and vehicle pages. A message link never grants access to its linked record.
- Direct table writes remain revoked. Active same-dealer membership is revalidated in the command; cross-dealer reads/writes are covered by regression tests.
- Reconciled stale roadmap/handoff lists into `docs/TODO.md`, separating completed local work, remaining product gaps and deliberately deferred hosted/role work.
- Search, archive/mute, attachments, retention and provider-backed realtime/presence are explicitly not claimed in this first messaging slice.
- Migration `055` remains local and was not applied to hosted Supabase.

## Rejected cheque/draft reversal — local delivery 2026-09-21

- Added migration `056`. A pending or previously cleared cheque/bank draft can be marked rejected by an owner, admin or accountant with a mandatory reason and optional bank reference.
- The original receipt remains immutable. A linked `receipt_reversal` movement reopens the customer balance without pretending that a customer refund occurred.
- The invoice register now separates instruments awaiting clearance from actual customer outstanding; cleared instruments remain reviewable for a later bank rejection.
- Return/refund allocation recognises receipt reversals so a physically returned vehicle never refunds money that the dealership did not retain.
- Migration `056` remains local and was not applied to hosted Supabase.

## Bank reconciliation core — local delivery 2026-09-21

- Added migration `057` with dealer-scoped bank accounts, non-overlapping statement periods, signed statement lines and partial/split matches against real sale receipts, refunds, rejected-instrument reversals and PO payments.
- Owners, admins and accountants can use `/business/bank` to prove opening balance plus movements against the bank closing balance, see unmatched amounts and complete a period only when every line is fully matched.
- Completed reconciliations are immutable through the command surface and create an attributable audit event. Cross-direction matching, over-allocation, overlapping periods and replay mutation are rejected in the database.
- This slice deliberately uses manual statement entry. CSV/OFX import, transfers, contra/write-off journals and the general ledger remain separate work and are not represented as complete.
- Local database regression tests, TypeScript and lint pass. Migration `057` remains local and was not applied to hosted Supabase.

## Accounting control core — local delivery 2026-09-21

- Added migration `058` with a dealer-scoped system chart of accounts, source-linked double-entry ledger, trial balance, management P&L, live aged debtors/creditors and accounting periods.
- `/business/accounting` exposes nominal movements back to invoice, credit note, receipt, PO and PO-payment sources. Period close requires a balanced ledger and no declared data-quality exception; closed dates reject later source mutations. Owner-only reopening requires a reason and audit event.
- VAT3 T1–T4 values are deliberately labelled a working draft. Unknown acquisition values, uncleared instruments and margin-scheme sales surface as review exceptions rather than silently producing filing-ready figures.
- Official Revenue guidance was checked for VAT3 boxes, purchase-record requirements, credit-note adjustment and margin-scheme restrictions. EU/import, deductibility, RTD, Intrastat, VIES, VRT and 46G remain outside the current data contract.
- Database tests cover balanced entries, tenant permission, close/reopen and rejection of retroactive source changes. Migration `058` remains local and was not applied to hosted Supabase.

## Controlled invoice effective dates — local delivery 2026-09-21

- Added migration `059`. Every commercial document now has an explicit effective date while retaining the server-controlled creation timestamp as the actual issue/audit event.
- Owner/admin configure a maximum invoice look-back of 0–365 days. Prior dates are limited to owner/admin/accountant, future dates are rejected, and no invoice can be placed into a closed accounting period.
- Deal completion now asks for the final invoice date. The chosen date is frozen into both the structured document field and printable snapshot; reports and ledger continue to use that effective date.
- Regression tests cover future-date denial, salesperson denial, configured backdating, frozen snapshot date and the distinction from issue date. Migration `059` remains local and was not applied to hosted Supabase.

## Bank statement CSV import — local delivery 2026-09-21

- Added migration `060` and CSV import to `/business/bank`. The accepted contract is explicit: `Date`, `Description`, optional `Reference`, and signed `Amount` columns; positive means money in and negative means money out.
- A batch is limited to 1,000 rows and is inserted atomically only into an open reconciliation whose period contains every transaction date. Invalid rows roll back the batch, identical content cannot be imported twice into the same period, and the filename/user/time are audited.
- CSV parsing supports quoted fields and ISO or Irish `DD/MM/YYYY` dates. OFX, bank-specific column mapping and direct bank feeds remain pending.
- Database tests, TypeScript and lint pass. Migration `060` remains local and was not applied to hosted Supabase.

## Hosted Supabase rollout — 2026-09-21

- Confirmed the linked healthy project is `wrpambhxyrcehefxpyli`, with the remote history exactly at `041` and no divergent migration.
- Ran a successful dry-run, then applied migrations `042`–`060` in order. A post-application migration listing matches local and remote through `060`; a second dry-run reports the remote database is up to date.
- The CLI emitted a Docker requirement only while attempting to cache its local pg-delta catalogue after the successful push. This did not affect the remote migrations.
- Hosted authenticated E2E, two-dealer acceptance and dashboard confirmation of paid plan/restorable backups remain separate operational checks because credentials and backup status are not exposed by the migration CLI.

## Reviewed manual journals and hosted follow-up — 2026-09-21

- Added migration `061`, `/business/accounting` journal controls and system nominal accounts for general expenses, bank charges and suspense review.
- Journals are created as balanced drafts. A non-owner creator cannot post their own journal; posting by another authorised finance user provides segregation of duties. The owner may post directly as the accountable principal.
- Posted journals are immutable accounting sources. Corrections create a linked reversing journal with swapped debit/credit lines and a mandatory reason; originals remain in the audit trail.
- Regression tests cover atomic rejection of an unbalanced journal, posting, ledger inclusion and a net-zero reversal pair. Tests, TypeScript and lint pass.
- Migration `061` was dry-run, applied to `wrpambhxyrcehefxpyli`, then verified by a second dry-run reporting the remote database up to date.
- Read-only dashboard verification showed the project healthy, the latest migration as `reviewed_manual_journals`, the organization/project plan as `FREE`, and `LAST BACKUP No backups`. Production onboarding remains blocked until the user upgrades the plan and a scheduled backup is successfully created and restore-tested.

## Sales report date basis and salesperson audit — 2026-09-21

- Added migration `062_sales_report_date_basis.sql`. Completed sales can be attributed either to the Deal opening date (commercial cohort) or the final invoice effective date (recognised-document view).
- Backdated invoices now use `deal_documents.effective_date` in the invoice-date report instead of the server creation timestamp.
- The commercial report exposes both dates and adds an exportable salesperson audit register with invoice, buyer, vehicle, gross sale, credit notes and net commission basis. Commission itself remains uncalculated until a dealer policy defines eligibility and rates.
- Regression tests cover the same completed sale appearing in the correct period under each basis. Tests, TypeScript and lint pass.
- Migration `062` was dry-run, applied to the linked hosted Supabase project, and verified by a second dry-run reporting the remote database up to date.

## Receivables, branch filters and complete receipt audit — 2026-09-21

- Added migrations `063` and `064`. A Deal may record multiple deposits at creation, each with its own method, effective date, reference and bank-confirmation state. Transaction dates default to today and future dates are rejected by the database.
- Bank transfer, EFT, cheque and draft entries remain expected receipts until confirmed. They do not reduce the customer balance or enter bank reconciliation early; later confirmation records its own date, actor and bank reference.
- Completed invoices may retain an outstanding balance and accept partial collections afterwards. Overpayments are highlighted as customer credit, credit notes reduce the receivable, and immutable receipt reversals reopen the amount due.
- A pre-invoice record without a deposit remains a quote unless an authorised user deliberately creates an agreement. The forced transition and agreement document are audited.
- Added dealer branches and Deal location attribution. Reports now accept preset or custom periods, Deal/invoice date basis, status, responsible salesperson and branch filters, and expose a complete receipt movement register suitable for CSV audit.
- Database regression tests, TypeScript and lint pass. Migrations `063`–`064` were dry-run, applied to `wrpambhxyrcehefxpyli`, and verified by both the remote migration list and a final up-to-date dry-run.

## Deal customer intake and payment workspace — 2026-09-21

- Added migration `065`. Continuing beyond the Deal customer step now creates or updates the CRM customer immediately, independently of final Deal creation. The operation is replay-safe and records the authenticated actor, server timestamp and source in the immutable audit log.
- A saved customer ID remains attached to the wizard and is reused when the Deal is created. If the buyer returns for another vehicle, the existing CRM autocomplete can select the same customer rather than creating a duplicate.
- Opening deposits now move the Deal to agreement stage; a Deal without a deposit stays a quote unless an authorised user explicitly forces an agreement.
- The Deal workspace is wider. Payment rows separate effective payment date, type/method, reference/clearance state, actual recorded-at/by audit data and amount. The live balance recalculates from confirmed deposits while unconfirmed bank instruments remain visible without reducing the amount due.
- Database regression tests, TypeScript and lint pass. Migration `065` was dry-run, applied to the hosted project and verified by a final up-to-date dry-run.
