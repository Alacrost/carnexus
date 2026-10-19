# Procurement → inventory → sale lifecycle — Ponytail plan

Status: slices 1–6 implemented and validated locally · slice 7 policy-blocked · 2026-09-20

## Decisions already supplied

- A vehicle enters inventory only through a PO-backed acquisition: direct customer purchase, external vendor/private seller, or trade-in.
- PO money state is derived from recipient-specific entries, including lender finance, and feeds `to be paid` reporting.
- A Deal is reported as open only after a current agreement exists.
- A Deal is completed only in the same transaction that issues its final invoice.
- Refunds occur only when the sold vehicle is physically returned.
- A retained trade-in after a returned sale receives a replacement standalone PO at the dealer-selected value.

## Conservative implementation assumptions

- Creating the acquisition command means the dealer has taken the vehicle into operational control. It creates PO and stock atomically, places the vehicle in `preparation`, and does not make it sale-ready.
- PO approval authorises payment; it is not used as a substitute for ownership or the payable ledger.
- An unpaid PO is visible as a liability but does not, by itself, block advertising or sale. Existing trade-in completion/settlement guards remain authoritative. A stricter lender/floorplan block needs a separate approved rule.
- Existing stock without one evidenced active PO is labelled `legacy_unresolved`; no supplier, amount or PO is fabricated.
- Invoice backdating remains blocked until an accountant approves the maximum look-back and closed-period policy. `issued_at` will always remain server-controlled.

## Bounded delivery slices

1. **Done — provenance foundation:** immutable originating-PO linkage and truthful `legacy_unresolved` reconciliation state.
2. **Done — close bypasses:** direct authenticated stock writes revoked; manual add/mark-sold/delete controls removed.
3. **Done — acquisition intake:** purchase/trade commands create PO provenance and preparation atomically.
4. **Done — canonical payables:** vendor, lender, combined `to be paid`, due/overdue and stock-liability values are derived in PostgreSQL.
5. **Done — reports and stock visibility:** SQL aggregates power purchase and commercial control screens; inventory shows verified PO or legacy review.
6. **Done — open Deal and revenue reporting:** a current agreement defines an open Deal; invoices less credit notes define net invoiced revenue for the selected period.
7. **Pending policy — completion dates:** atomic invoice completion remains; `invoice_date`, `supply_date` and effective reporting date wait for approved look-back and closed-period rules.

## Gates

- No authenticated path can insert provenance-free stock or manually mark a vehicle sold.
- Every new purchase/trade command produces one vehicle with one current originating PO and enters preparation.
- Existing rows are linked only from actual PO evidence; otherwise they remain visibly unresolved.
- PO totals stay correct for vendor/lender splits, partial payments, carry-forward entries and cancelled/replaced POs.
- Reports aggregate in SQL and do not depend on a client row limit.
- Open Deals require a current agreement; completed Deals require a final invoice.
- Disposable PostgreSQL tests, TypeScript, lint and production build pass; no hosted migration is applied.

## Local implementation record

- Migration `051_procurement_inventory_provenance.sql` owns stock provenance and PO payables.
- Migration `052_sales_lifecycle_reporting.sql` owns current-agreement and invoice/credit reporting.
- The inventory entrypoint now routes to Purchase Orders; unresolved historic rows remain visible and are never assigned invented provenance.
- Purchase and report screens show vendor and lender balances separately, together with combined `to be paid`.
- The sales pipeline distinguishes all active workflow records from the narrower “open agreement” definition.
- Backdated invoice entry has not been implemented.
- Migration `053_purchase_intake_and_deletion.sql` adds required direct-purchase evidence (supplier invoice reference, purchase date, dealership-arrival date and mileage), explicit unknown purchase value, and an owner/admin-only transactional deletion for unused direct purchases. Deletion is blocked as soon as Deal, trade-in or replacement-PO history exists.
