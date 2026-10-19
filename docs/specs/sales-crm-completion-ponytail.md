# Spec / plan — Commercial reversals and CRM operations

> Status: in progress — Slices 0, 1, 2, 3 and 9 implemented locally · Owner: AutoNexus · Stage: Sales CRM completion · Planned: 2026-09-19

## Problem

The transactional sales foundation protects closed deals and issued documents, but a dealer still cannot safely unwind a sale, issue a credit note, refund a customer after invoicing, or roll back a trade-in. CRM follow-up is split between a single `next_action`, loosely linked viewings, and manual activity notes. Team invitations have a secure backend but no operating UI. Legacy modules also use inconsistent permission checks and contain known lint failures.

## Goal

Complete the local Sales CRM operating workflow in bounded, testable slices while preserving financial history, tenant boundaries and the existing Next.js/Supabase architecture.

## Explicitly deferred

The following work is intentionally outside this programme and remains for a later hosted-acceptance phase:

- Real hosted Supabase sign-in and full authenticated end-to-end acceptance.
- Billing-plan propagation and scheduled-backup verification.
- Hosted two-dealer/two-user isolation acceptance.
- A redesign of base roles, custom-role architecture or a new permissions product.
- Production migration rollout, real dealer onboarding and provider/bank integrations.
- GDPR retention/purge automation. CRM export in this programme is an operational export, not the complete data-subject export.

Existing base roles and CRM profiles remain the contract. Permission work in this plan only makes legacy modules consistently enforce that existing contract at the UI, Server Action/RPC and RLS/data-exposure boundaries.

## Non-negotiable domain rules

1. Financial history is append-only. Never delete or overwrite an issued invoice, credit note, receipt, refund, settlement or their frozen snapshots.
2. Cancellation and reversal are different operations:
   - **Cancellation:** an open, non-invoiced deal is stopped.
   - **Reversal:** a completed/invoiced deal is corrected through explicit compensating records.
3. A credit note documents a reduction of the invoiced amount. A refund records money returned. Neither silently implies the other.
4. Every money command is atomic, idempotent, version checked where state can become stale, attributed to `auth.uid()` and scoped to one dealer.
5. A reversal reason is mandatory. The system records before/after state and links every compensating record to its source.
6. Trade-in rollback cannot erase the acquired vehicle or purchase order. It reverses/voids obligations explicitly and refuses unsafe rollback after the trade-in has been sold, further encumbered or otherwise consumed.
7. Staff-entered finance/payment states are operational records, never presented as bank or lender confirmation.
8. CRM tasks and appointments use the existing lead/customer/deal graph. Do not create a second lead pipeline or a second appointment system.
9. Agency never receives customer PII, costs or commercial access. Cost/margin data remains server-filtered for unauthorised users.
10. Demo mode must be visibly non-persistent and must never claim that a payment, reversal, invitation or export was executed.

## Recommended delivery order

Each slice must be independently reviewable. Do not start the next money slice until the current migration and regression tests pass on the disposable local database.

### Slice 0 — Freeze contracts and baseline

**Purpose:** remove ambiguity before changing money or CRM state.

- Record the current commercial state machine, balance formula, document statuses, purchase liabilities and vehicle states in tests.
- Add fixtures for: unpaid open sale, paid open sale, completed/invoiced sale, sale with positive-equity trade-in, negative-equity trade-in, partially settled lender/vendor liability and sold trade-in stock.
- Define command vocabulary and stable error codes before UI work.
- Keep migration numbering sequential from `042`.
- Capture the known lint baseline: 7 errors and 1 warning. New/changed files must be lint-clean even before the final cleanup slice.

**Gate:** existing tests, typecheck and production build pass; fixtures fail if immutable documents or money history can be edited directly.

### Slice 1 — Reviewed cancellation for open deals

**Purpose:** safely cancel a deal before a final invoice exists.

**Data/command design**

- Extend the commercial command rather than adding direct table mutations.
- Add an explicit `cancel_deal` command with `expectedVersion`, mandatory reason and idempotency key.
- Permit cancellation only when no live final invoice exists.
- If receipts exist, require explicit refund movements first; never delete receipts.
- If a trade-in exists, route to the trade-in rollback slice instead of partially cancelling.
- Release the sale vehicle only when no other active reservation exists.
- Preserve quotes, agreements and events; mark superseded documents/statuses without changing snapshots.
- Restore a linked lead to a deliberate non-terminal stage only when the user selects that option. Do not silently reopen it.

**UX**

- A review drawer/modal shows the reason, receipts, documents, trade-in, stock effect and linked-lead effect before confirmation.
- Destructive styling is restrained but unmistakable. The confirm action states exactly what will and will not change.

**Tests**

- Open unpaid cancellation succeeds atomically and releases stock.
- Paid, invoiced or trade-in deals are rejected with the correct next action.
- Duplicate command returns the original result.
- Stale version and cross-tenant IDs fail without partial writes.

### Slice 2 — Post-invoice credit notes and refunds

**Purpose:** correct an invoiced sale without mutating the original invoice.

**Data/command design**

- Reuse `deal_documents.kind='credit_note'`; add explicit linkage to the original invoice and, where useful, a prior credit note.
- Allocate `CN-########` with the existing transactional number allocator.
- Store an immutable credit-note snapshot: original invoice number/date, reason, affected line(s), gross reduction, tax treatment copied from the original snapshot, recipient and cumulative credited amount.
- Add `credit_note` and `refund` commands or one reviewed orchestration command with separate durable records.
- A partial credit cannot exceed the remaining uncredited invoice amount. A full credit changes the deal to a distinct reversed state; partial credit does not pretend the whole sale was reversed.
- Refunds remain `payments.kind='refund'`, link to the credit note/reason, and cannot exceed the refundable received amount.
- Do not recalculate historic tax from current vehicle/customer/settings data; derive the correction from the frozen invoice snapshot.
- Require owner/admin/accountant-level commercial authority under the current permission model. Sales may see the customer-facing outcome but cannot execute a post-invoice financial reversal by default.

**UX**

- Start with a review step: choose full or partial correction, select original lines/amount, enter reason, review calculated result, then explicitly issue.
- After issue, show invoice → credit note → refund links in one financial timeline.
- Printing/downloading uses the existing document route and clearly labels the artifact as a credit note.

**Tests**

- Full and partial credits, multiple partial credits, over-credit rejection and duplicate submission.
- Refund before/after credit according to the chosen rule, over-refund rejection and correct customer balance.
- Original invoice snapshot/hash-equivalent JSON remains unchanged.
- Standard and margin-scheme snapshots keep their original treatment; tests assert software consistency, not legal certification.

### Slice 3 — Trade-in rollback and purchase-liability reversal

**Purpose:** unwind the connected sale, trade-in acquisition and liabilities as one reviewed transaction.

**Data/command design**

- Add a `reverse_trade_in` command that locks the deal, trade order, purchase order, acquired vehicle and relevant payments.
- Preserve the purchase order, trade order and vehicle; add reversal status/reason/linkage instead of deletion.
- Calculate vendor/lender amounts from the canonical payable view and recorded payments.
- Refuse automatic rollback if the trade-in vehicle has an active downstream deal, is sold, or has unresolvable vendor/lender payments. Surface a manual-resolution checklist instead.
- Where money has moved, require compensating vendor/lender refund/recovery records. Never negate or delete original payments.
- Remove the original trade equity from the customer deal only inside the same transaction and recompute the customer balance.
- Release or quarantine the trade-in vehicle according to the reviewed outcome; never silently return it to ordinary sellable stock.

**UX**

- A dependency map shows customer deal, trade vehicle, PO, vendor balance, lender settlement and downstream usage.
- The confirm screen distinguishes automatic steps from blockers requiring manual resolution.

**Tests**

- Positive and negative equity, no settlement, partial lender payment and fully settled lender.
- Atomic rollback on any failure.
- Sold/downstream-reserved trade-in is blocked.
- Original documents/events remain readable; balances and stock states are consistent after reversal.

### Slice 4 — CRM tasks and linked appointments

**Purpose:** turn follow-up into assignable work without replacing the lead pipeline.

**Data/command design**

- Add `crm_tasks` with `dealer_id`, title, type, status, priority, due time, assignee, creator/completer timestamps and nullable links to customer, lead and deal.
- Every task must link to at least one valid same-dealer CRM entity.
- Evolve existing `viewings`; do not add a second appointments table. Add nullable `lead_id`, `customer_id`, `deal_id`, `assigned_to`, version and audit fields while retaining legacy display fields for migration compatibility.
- Replace direct viewing insert/update/delete with transactional CRM commands. Cancellation replaces hard delete for persisted appointments.
- Use `timestamptz`; UI converts explicitly with the Europe/Dublin business timezone and preserves the chosen instant across DST.
- Task/appointment changes append attributable timeline entries.

**UX**

- Add a focused work queue: overdue, today, upcoming, completed.
- Lead/customer/deal pages show contextual create/edit controls and next activity.
- Use the studio visual language: timeline rail, compact status glyphs, clear urgency, no generic card grid.

**Tests**

- Same-dealer links and active assignees only; stale update protection.
- Complete, reschedule, cancel and reopen rules.
- DST/timezone cases, agency denial and append-only history.

### Slice 5 — Customer timeline

**Purpose:** provide one trustworthy chronological view without copying events into another table.

- Build a permission-aware SQL/RPC read model that unions existing lead activities, task/appointment events, deal events, documents and payment summaries.
- Return a minimal typed DTO; never return purchase cost, margin or private document internals to unauthorised roles.
- Paginate by `(occurred_at, source_id)` to avoid the Supabase 1,000-row ceiling and unstable pagination.
- Include source labels and links so a user can distinguish staff notes from payments/documents and externally confirmed events.
- Add filters for activity, tasks, appointments, deals and documents.

**Gate:** a customer with multiple leads/deals has one correctly ordered, paginated timeline with no duplicated events or cost leakage.

### Slice 6 — Invitation manager using existing roles

**Purpose:** expose the already-secured invitation flow without redesigning roles.

- Add a Team section under Settings listing active/suspended members and pending/expired invitations.
- Reuse `create_invitation`/`accept_invitation`; add controlled revoke/resend commands only if missing.
- Owner can invite supported base roles. Admin cannot invite/promote an owner or change owner-protected membership.
- CRM profile assignment stays an owner-only follow-up using the existing `crm_role_id` contract.
- Never expose token hashes. Show the raw token/link only at creation/resend time if the current backend contract requires manual delivery.
- Audit invitation created, resent, revoked, accepted, membership suspended/restored and allowed role changes.

**Deferred within this slice:** email delivery, new role definitions, hosted acceptance and a multi-dealer selector.

### Slice 7 — CRM operational exports

**Purpose:** provide useful dealer exports without leaking data or pretending to satisfy all GDPR subject-access requirements.

- Server-generated CSV exports for filtered leads, customers, tasks and appointments.
- Export uses the same filters and permission predicates as the screen; never export a client-fetched hidden superset.
- Apply an explicit column allowlist, UTF-8 CSV escaping and spreadsheet-formula injection protection.
- Large exports use pagination/streaming or a bounded asynchronous job only when real volume requires it; start with a documented safe row cap and clear error.
- Record exporter, filters, row count and export type in `audit_logs`; do not log exported PII values.
- Agency is denied. Cost/margin/commercial finance fields are excluded from CRM exports.

### Slice 8 — Legacy permission alignment

**Purpose:** make existing modules consistently enforce the current role contract without expanding it.

- Inventory every route, Server Action, RPC and table policy in inventory, marketing, website, billing/settings and legacy business screens.
- Define a single capability-to-boundary matrix in `docs/SECURITY.md`; keep `can`, `crm_allowed`, `commercial_allowed`, RLS and column grants consistent with it.
- UI checks are presentation only. Every mutation re-authorises server-side; every RPC denies anonymous, missing, suspended and wrong-dealer membership.
- Replace broad row reads where sensitive columns exist with safe projections/RPCs. Verify agency/customer-PII and sales/cost boundaries locally.
- Remove or close legacy direct-write paths that bypass transactional commands.
- Do not add new roles or claim hosted multi-tenant acceptance in this slice.

**Tests**

- Disposable database matrix for anonymous, outsider, suspended, owner, admin, sales, agency and accountant.
- For each capability: allowed action succeeds; adjacent disallowed role fails; no sensitive fields are returned.

### Slice 9 — Lint and maintainability close-out

**Purpose:** return the repository to a clean engineering gate after functional work stabilises.

- Fix the known `prefer-const` issue.
- Refactor synchronous state mirroring inside effects in Campaign Composer, Overlay Studio and Promotions Manager into derived state, event-driven updates or keyed component resets.
- Stabilise the inventory `flush` callback/dependency without causing repeated writes.
- Do not suppress rules globally or add blanket disable comments.
- Run focused lint after each touched component, then the full suite.

**Gate:** `npm run lint`, `npm test`, `npm run typecheck` and `npm run build` all pass.

## Cross-slice data and security requirements

- Every new tenant table includes `dealer_id`, RLS and same-dealer relationship enforcement in the same migration.
- Use composite tenant validation or command-level locked validation for all customer/lead/deal/vehicle/member links.
- Revoke direct authenticated writes to ledgers, documents, task history and timeline sources when commands own their mutation.
- No `service_role` in browser/server-action paths.
- Validate all Server Action inputs with Zod and re-authorise inside the action/RPC; page visibility is not authorisation.
- Return narrow DTOs from server modules. Never pass raw financial/customer rows to Client Components.
- All issued financial artifacts store server-owned actor/time and immutable snapshots.
- New commands participate in `commercial_requests`-style replay protection or an equivalent scoped idempotency table.

## UX and studio design

- Commercial reversal screens use a guided review flow: **inspect dependencies → explain consequences → confirm → execute → show receipt/result**.
- Never use a one-click destructive control for cancellation, credit or rollback.
- Timelines use a continuous visual rail and event glyphs; queues prioritise overdue/today rather than a dashboard-template card grid.
- Motion is limited to transform/opacity, respects `prefers-reduced-motion`, and must not delay confirmation of financial operations.
- Every screen has explicit empty, loading, permission-denied, stale-state and partial-blocker states.

## Overall acceptance criteria

- [x] Open deals can be cancelled safely without deleting history.
- [x] Invoiced deals can be fully or partially credited; refunds occur only with a confirmed physical vehicle return and use immutable linked records.
- [x] Trade-in rollback/retention either completes atomically or reports exact blockers without partial state.
- [x] Tasks and existing appointments link safely to customer/lead/deal and appear in one customer timeline.
- [x] Owners/admins can operate invitations under the existing role hierarchy.
- [x] CRM exports are permission-filtered, injection-safe and audited.
- [x] Legacy module boundaries match the documented current role contract locally.
- [x] No migration was applied to hosted Supabase during this local delivery.
- [x] Full tests, typecheck, lint and production build pass locally.

## Delivery evidence required per slice

- Migration number(s) and rollback/forward-fix notes.
- Exact commands run and results.
- New regression scenarios and which monetary/security invariant each protects.
- Screens/routes reviewed in the browser.
- Shipped versus deferred notes appended to `docs/DELIVERY.md`.

## Product decisions resolved during implementation

1. A credit note may exist without moving money; a refund is created only as part of a confirmed physical return of the sold vehicle.
2. When the dealer keeps a returned-sale trade-in, the deal-linked PO is cancelled and a new standalone PO is created at the chosen value. The chosen value cannot be below the carried lender settlement.
3. Returned stock enters preparation and must clear its configured checklist before returning to sale-ready stock.

Approved Irish invoice/credit-note wording and any future line-level tax treatment still require accountant/legal review. The implementation preserves immutable data but does not claim tax certification.

## First implementation slice when authorised

Start with **Slice 0 + Slice 1 only**. Do not combine credit notes, trade-in rollback and CRM work into the same migration or review. The first pull-sized delivery should establish cancellation invariants, tests and the reviewed UI while leaving completed/invoiced and trade-in deals deliberately protected.

## Slice 0 + Slice 1 delivery — 2026-09-19

- Added migration `042_reviewed_deal_cancellation.sql` without applying it to hosted Supabase.
- Kept the stable `commercial_command` API and made the v041 implementation private behind a wrapper. Old clients can no longer cancel through a bare status change.
- Added `cancel_deal` with dealer lock, idempotency, optimistic version check, mandatory reason, server actor/time, immutable event/audit evidence and atomic rollback.
- Net receipts must be explicitly refunded first. Final invoices and trade-ins remain blocked for their dedicated reversal slices.
- Quotes and agreements are marked void without changing/deleting their snapshots. The sale vehicle is released only when no other active reservation exists.
- A linked lead changes only when the user explicitly selects a new non-terminal stage.
- Replaced the one-click Cancel button with a studio review panel showing exact effects and blockers before confirmation.
- Disposable PostgreSQL tests cover success, replay, stale state, legacy-command rejection, private v041 RPC, wrong tenant, refund prerequisite, trade-in/completed blockers, immutable documents/history and forced atomic rollback.

Validation: `npm test`, `npm run typecheck`, focused ESLint and production build passed. Demo browser review covered cancellable and payment-blocked deals. Full lint remains at the recorded legacy baseline of 7 errors and 1 warning; no new finding is in the changed files.

## Slice 2 + Slice 9 delivery — 2026-09-19

- Added migration `043_credit_notes_vehicle_returns.sql` locally; it has not been applied to hosted Supabase.
- A partial credit note is line-based, versioned, replay-safe, linked to the immutable original invoice and limited by prior credits. It does not move money or stock.
- Confirmed product rule: a post-invoice refund happens only when the sold vehicle is physically returned. `return_sale` atomically issues the full remaining credit, refunds recorded customer/finance receipts, changes the deal to `reversed` and moves the vehicle to `preparation`.
- A sale with a trade-in remains blocked until the dedicated trade-in rollback decision and command are complete.
- The deal UI now separates invoice correction from physical return, previews every effect and prints a dedicated credit-note document.
- Fixed all seven legacy lint errors and the inventory hook warning without blanket rule suppression.

Validation: `npm test`, `npm run typecheck`, `npm run lint` and `npm run build` pass. The production build required network access only to fetch the configured Geist fonts.

## Slice 3 delivery — 2026-09-19

- Confirmed product rule: when a completed sale is returned, the dealer may retain the trade-in at a newly agreed value.
- Added migration `044_trade_in_retained_purchase.sql` locally. The deal-linked PO is cancelled with reason/actor/time and linked to a new approved PO for the same vehicle. The replacement PO has no `deal_id` and no trade credit, so vendor and lender balances stand on their own.
- Existing lender/vendor payments remain on the cancelled PO for audit and are represented on the replacement PO only as linked, non-cash carry-forward entries. They reduce the new outstanding balance without pretending money moved twice.
- The retained vehicle stays acquired stock in `bought`. The returned sale vehicle moves to `preparation`; the sale receives its full remaining credit note/refunds and becomes `reversed` atomically.
- Only owner/admin can execute the combined reversal and replacement purchase. An active downstream deal on the trade-in blocks the operation.
- Automatic conversion rejects a new purchase value below the existing lender settlement because the current PO ledger cannot safely represent a customer negative-equity receivable.

Tests cover partial settlement carry-forward, changed trade value, standalone replacement PO, replay, role denial, below-settlement rejection, downstream-deal blocking, payable balances and both vehicle states.
