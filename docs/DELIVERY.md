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
| 2 | Transactional sales/purchases/payments, financial consistency, document numbers, role alignment across all legacy modules; remaining P0 audit findings | Planned |
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

Local implementation uses `feat/crm-foundation`. Remote Supabase project/deployment not provided. Production remains unverified until migrations and two-tenant/role checks run in a configured staging project. Existing audit remains the baseline for unresolved security and commercial issues.

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
