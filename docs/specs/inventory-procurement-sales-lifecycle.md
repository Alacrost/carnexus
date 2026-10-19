# Business rules — Procurement, inventory and sales lifecycle

> Status: requirements planned; provenance/payables/open-agreement reporting implemented locally · invoice-date policy pending · Owner: AutoNexus · Updated: 2026-09-20

## Position in the roadmap

This programme starts only after the planned commercial-reversal and CRM-operation work is stable. It is recorded now so future implementation does not reinforce the current ability to create stock without a commercial origin.

Hosted acceptance, role redesign and production migration rollout remain separate decisions.

## Core business invariant

**A vehicle may appear in dealer inventory only because the dealer acquired it through a Purchase Order (PO).**

There is no independent “add vehicle to inventory” business operation. The vehicle record is the stock representation created by an approved acquisition command.

Allowed acquisition origins:

1. Purchase from an existing CRM customer.
2. Purchase from a supplier/private seller recorded during the acquisition flow.
3. Trade-in attached to a customer sale.

Every inventory vehicle must therefore be traceable to exactly one originating acquisition/PO. Imported historic data will need an explicit migration/reconciliation state rather than a fabricated supplier or silent PO.

## Purchase Order rules

### PO owns the acquisition

- The acquisition flow creates or selects the seller/customer, records the vehicle, allocates the PO number and establishes liabilities atomically.
- A failed PO command creates neither partial stock nor partial liabilities.
- Registration/VIN duplication checks happen inside the command and respect the dealer boundary.
- Editing descriptive vehicle data later does not change the originating PO or its financial history.
- An owner/admin may permanently delete a mistaken direct acquisition only while the vehicle has no Deal, SO, invoice, trade-in or replacement-PO history. The database transaction removes its PO payments and dependent PO data together with the vehicle. Once downstream commercial history exists, cancellation/reversal is mandatory instead.
- Direct purchase intake requires the supplier invoice reference, purchase date, dealership-arrival date and vehicle mileage. Purchase and advertised sale prices may initially be unknown; unknown is represented explicitly and never reported as a known zero.

### Seller types

- **CRM customer:** reuse the same customer identity and show the acquisition in that customer's timeline.
- **External/private seller or supplier:** record a proper party/supplier identity; do not store only an unexplained free-text name when money is owed.
- **Trade-in:** the PO is linked to the sales Deal, trade-in order and acquired inventory vehicle.

Whether customers and suppliers should share one `parties` model or remain separate linked tables is a design decision for the detailed planning stage. Do not duplicate the same person silently.

### PO liabilities and payments

PO status alone must not be used as the money ledger. The system derives payment state from immutable payment/liability records.

At minimum, each PO must expose:

- Gross acquisition amount.
- Amount/credit applied from a trade-in relationship, where relevant.
- Amount owed directly to the seller/vendor.
- Amount financed or payable to a lender/finance company.
- Amount paid to each recipient.
- Vendor balance outstanding.
- Finance/lender balance outstanding.
- Total **to be paid**.
- Due date(s), settlement reference and settlement validity where relevant.
- Operational state such as unpaid, partially paid, paid, overdue or reversed, derived from balances and dates.

Payments must identify recipient (`vendor` or `finance/lender`), method, date, reference, actor and idempotency key. A staff entry records an operational payment; it must not claim bank or lender confirmation.

### Inventory availability

- Draft/unapproved acquisitions do not create ordinary sellable stock.
- An approved PO may create inventory in an acquisition/preparation state.
- A vehicle cannot become ready for sale while mandatory acquisition checks or explicitly blocking liabilities are unresolved. The exact blocking policy is a product decision; the UI must distinguish “money still owed” from “cannot sell”.
- A trade-in cannot be resold until the originating customer sale reaches the required completion point and any mandatory settlement rules are satisfied.

## Purchase and stock reports

Reports must use the canonical PO liability calculation, not client-side totals or a status label.

Required views:

- Total acquisition value by period and source.
- Paid to vendors.
- Paid to finance/lenders.
- Vendor outstanding.
- Finance/lender outstanding.
- Combined **to be paid**.
- Due soon and overdue payables.
- Per-vehicle acquisition/payable position.
- Trade-in liabilities, including negative equity and partial settlements.
- Stock value with a visible distinction between acquired cost and unpaid acquisition liability.

Totals must remain correct for partial payments, refunds/recoveries, reversed purchases and dates outside the current report page. Database aggregation and pagination are required; do not depend on the Supabase client row limit.

## Sales Order and Deal rules

### Relationship

- The Deal is the customer-facing commercial negotiation and agreement context.
- The Sales Order (SO) fixes the vehicle, agreed commercial lines and customer within that Deal.
- A vehicle cannot belong to two active SOs.
- Quotes are proposals and remain immutable snapshots once issued.
- An **open Deal** means the transaction has reached the agreement phase: a current agreement exists for the current deal version and the Deal has not been cancelled, reversed or completed.
- Earlier enquiry/quotation work may exist, but must not be reported as an open agreed Deal.

The detailed plan must decide whether the current `draft/quoted/agreed/finance` statuses are retained as workflow states with an independently derived `is_open_agreement`, or migrated to a clearer state machine. Reports must not guess from labels.

### Completion

A Deal becomes **completed only when the final invoice is generated successfully**. Completion and invoice creation are one atomic command:

1. Validate current agreement and deal version.
2. Validate vehicle/SO/customer and completion gates.
3. Allocate the sequential invoice number.
4. Freeze the invoice snapshot.
5. Mark the Deal completed and stock sold.
6. Record the event and linked CRM transition.

If invoice generation fails, the Deal remains open and the vehicle is not marked sold.

### Invoice dates and audit trail

The requested business behaviour is that completion may use an invoice/effective date earlier than the moment the command is entered. The data model must never disguise when the document was actually created.

Keep separate immutable fields:

- `issued_at`: server-controlled timestamp when AutoNexus generated the invoice.
- `invoice_date`: approved date shown as the invoice issue/business date, subject to accounting rules.
- `supply_date`: date the vehicle was supplied/delivered when it differs from the invoice date.
- `completed_at`: server-controlled Deal completion timestamp.
- `completed_effective_on`: optional business-effective date used for authorised reporting, if approved.
- Actor, reason and audit event whenever a user selects a prior date.

Rules for a prior date:

- It does not alter `issued_at`, sequence allocation order or earlier audit events.
- It requires explicit permission and a reason.
- It cannot fall before the agreement/supply constraints selected in the detailed accounting policy.
- Closed accounting periods and maximum backdating limits must be defined before implementation.
- Reports must state whether they use issue date, supply date, effective completion date or actual system timestamp.

Irish Revenue guidance requires a VAT invoice to show the date of issue and a unique sequential number, and to show the supply/payment date where it differs. The final labels and permitted backdating policy require approval from the dealer's accountant; AutoNexus must not present this design as tax certification.

## Data integrity direction

The detailed Ponytail plan should prefer these structural guarantees:

- Mandatory same-dealer link from inventory vehicle to originating PO/acquisition.
- One originating acquisition per inventory vehicle.
- No general authenticated insert path for `vehicles`; acquisition commands own creation.
- Append-only PO/SO payments and compensating records for reversals.
- Derived payable and Deal-open views/functions as canonical report sources.
- Immutable issued PO/SO/agreement/invoice snapshots with linked corrections.
- Idempotent, transactional commands for acquisition approval, payment, agreement and completion.
- Reconciliation state for legacy vehicles that predate mandatory PO provenance.

## Migration strategy requirement

Existing inventory must not be assigned invented purchases. Before enforcing the mandatory PO relationship:

1. Classify every existing vehicle as linked, reconcilable or unresolved legacy stock.
2. Link records only where evidence exists.
3. Place unresolved vehicles in a visible reconciliation queue.
4. Prevent new provenance-free stock immediately after the new command is active.
5. Add the database constraint only after existing rows have a truthful, reviewed state.

## Questions for the detailed business-rules session

1. Can stock with an unpaid PO be advertised/sold, or does only a specific finance/lender condition block sale?
2. Is dealer floorplan finance a PO liability, a separate stock-finance product, or both depending on the provider?
3. Does a direct purchase from a CRM customer require the same customer record used for sales, and what identity fields are mandatory?
4. At which exact event does ownership/stock control pass: PO approval, vehicle receipt, supplier invoice or payment?
5. Which date drives sales reports: invoice date, supply date or actual completion timestamp?
6. What prior-date limit and closed-period rule will the accountant approve?
7. May a final invoice be issued with customer balance outstanding, or must completion always require cleared funds/approved finance?
8. Which PO/SO fields and signatures are required on the dealer's printed documents?

## Implementation gate outcome

The dedicated plan is recorded in [procurement-inventory-lifecycle-ponytail.md](procurement-inventory-lifecycle-ponytail.md). Its conservative decisions allowed provenance, payables and agreement/invoice reporting to proceed. Questions 5–6 remain intentionally unresolved, so selectable prior invoice dates and closed-period handling are not implemented.
