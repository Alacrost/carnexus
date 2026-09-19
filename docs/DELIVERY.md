# Product direction and delivery log

Updated 2026-09-17. This supersedes older marketing-first priorities in VISION/ROADMAP.

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
| 3 | Complete CRM operations: tasks/appointments linked to contacts/deals, team invitations, assignment rules, customer history, exports/retention | Planned |
| 4 | Website themes/domains/stock photos/intake; focused DoneDeal and promotions UX | Planned |
| 5 | Email/DoneDeal/Meta Ads lead adapters, deduplication, inbox; AI review then explicitly configurable automation | Planned; provider credentials/access required |
| 6 | Platform management, billing/provisioning, cross-product analytics and rollout | Planned |

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
