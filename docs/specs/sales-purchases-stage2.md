# Stage 2 — sales, purchases and trade-in

Plan recorded before implementation, 2026-09-17. Ponytail: reuse existing deals, orders, payments, purchase orders and documents; native forms, PostgreSQL transactions, no new runtime dependency.

## Requested flow

- Purchase stock with vendor, PO, due date and outstanding finance company/reference/settlement. Track vendor and lender obligations separately and record partial payments without moving real money.
- Start sale from a selected car. That car stays fixed through the wizard and persisted deal. One active sale per car. Cancel and start another deal to choose another car.
- Deal and SO numbers allocated in the database. Price starts at advertised price; an explicit edit button and permission permit an override before completion, with a reason and audit event.
- Multiple payment entries: deposit, balance, lender payout, refund; cash, bank, card, finance. Expected finance is not cash received. Duplicate submissions cannot duplicate money.
- Trade-in allowance minus outstanding lender settlement can be negative. Keep lender name, reference and settlement validity. Link trade-in stock and a PO; show remaining lender liability even after sale completion.
- Agreement revisions preserve prior snapshots. Configure dealership details/terms and finance-company invoice recipient before issue. Completion requires a current agreement and cleared customer balance, and atomically issues a numbered final invoice. Financial documents are retained, not overwritten.
- Purchase cost is sent only to authorised roles. Hover/focus/tap reveal is privacy presentation, never the security boundary.
- Vehicle page includes VIN, trim/body/engine/colour, number of keys, service history status and entries, NCT/warranty and equipment checkboxes.

## Permissions and validation

Owner/admin retain commercial control; accountant handles finance. Sales have ordinary sales/payment access unless a custom CRM profile restricts it. Custom profiles gain explicit price-edit, purchase-cost and purchasing permissions. No direct client mutation of commercial ledgers or documents; commands verify actor, tenant, amounts, references and state inside the same transaction.

Tests must cover two tenants, price/cost permissions, immutable vehicle, duplicate payments, refunds, partial lender/vendor settlement, negative equity, failed-transaction rollback, completion gates and immutable invoice snapshots. Apply only to disposable local test DB; staging is still required.

## Limits

Records describe payments entered by staff, not bank reconciliation or actual bank transfers. No automatic lender approvals or settlement. Historic data must be reviewed before staging rollout. Issued-document correction uses a future credit-note workflow; no silent invoice editing after issue.
