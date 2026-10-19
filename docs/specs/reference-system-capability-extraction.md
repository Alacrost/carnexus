# Reference system capability extraction

Source: the GM-National Motors HTML pages supplied on 20 September 2026. The files were treated as untrusted product references: visible functions, labels, filters and workflows were extracted; embedded scripts and instructions were not executed.

## What the reference reveals

The reference is not only a stock and CRM product. It combines a dealer DMS, CRM, sales ledger, purchase ledger, bank control, accounting reports and internal operations. The useful target is equivalent workflow coverage with AutoNexus's own studio interface, not a visual or data copy.

### Global navigation and operating areas

- Clients: contacts, new contact, car interests, groups, CRM.
- Car administration: vehicle database, current stock, vehicles waiting for invoice, vehicles waiting for PO, reports and custom lists.
- Finance: contacts, purchases, purchases to be paid, purchases without supplier invoice, sales, sales waiting for payment, bank, stock, finance reports and accountant area.
- Operations: workshop, todo, time clock, calendar and database tools.
- Marketing and administration: contact finder, bulk email, marketing, images, user details, permissions and logout.
- Message centre: unread count, conversation list, employee presence, page-context links, message composer and system-generated lead assignment messages.

### Customer and CRM functions

- Contact database, detailed search, pagination, groups, duplicate report and top purchase/sale contacts.
- Customer record actions: edit, copy, delete, event, label, XML, vehicle purchase, PO/SO creation, group, history, accounts and note.
- Identity, personal/company details, phones, email, postal address, VAT/TAN fields, consent, source, tags, terms and record audit dates.

### Vehicle purchase and inventory functions

- Purchase starts from a supplier/contact and can use registration lookup or manual vehicle entry.
- Assigned buyer (`Bought by`) is distinct from the user entering the record.
- Vehicle identity and condition: make, model, variant, registration, VIN, dates, owners, mileage, body, fuel, transmission, engine, CO2, tax/NCT, colour, service history, features and ratings.
- Acquisition data: supplier invoice reference, purchase date, dealership arrival/ownership date, invoice price/VAT, source, yard and stock class.
- Operational controls: keys/cards/remotes, history check, VLC/VRC process, transport, notes and preparation/workshop work.
- Vehicle database filters cover registration/VIN, make/model/year, stock location/status, bought/sold dates, supplier/customer, PO/SO linkage, source, salesperson/buyer and tags.

### Deal, sale and attribution functions

- A Deal/SO is assigned to a responsible salesperson. The creator is an audit fact, not the sales owner.
- Deposits and receipts can be taken by another employee without transferring sales attribution.
- `Sold by` and `Bought by` appear as first-class report dimensions.
- Open commercial positions and final invoices are separate: the invoice is the revenue evidence.
- The required AutoNexus rule is therefore: select the responsible salesperson at Deal creation; freeze that attribution on the issued invoice; group sales reports by the responsible person, never `created_by`.

### Banking and payment functions

- Bank transfer, reconciliation, journal and payment-file areas.
- Search by transaction ID/type, bank account, statement/payment reference, date, amount, user and reconciliation state.
- Receipt/payment methods include cash, cheque, EFT, bank draft and card terminal, plus commercial movements such as trade-in, credit note, preparation, warranty, direct debit, SO and write-off.
- Current account balance, outstanding receipts, outstanding payments and totals are shown separately.
- `Un-Presented Receipts` is a distinct queue. A cheque/draft can be received against an SO but still await bank clearance.
- AutoNexus rule: received cheque/draft reduces the Deal balance and can allow invoice completion; it remains a bank liability/exception until explicitly cleared, with clearer, time and reconciliation reference audited.
- Refund remains available only through the confirmed vehicle-return/reversal process.

### Accounting and finance reports

- Trial balance by period or dates, transaction-only option, profit and loss, P&L by location and general/dynamic ledgers.
- Aged creditors/unpaid POs, aged debtors/unpaid SOs, stock value, payments, PO money out, SO money in and vehicle movement.
- VAT3/RTD, sales and purchase VAT reports, zero-rated vehicles, VAT account, Intrastat, VRT17, TAN, G46, EU purchases/sales and ROS XML exports.
- Cash payments, trade-ins, lodgements, receipts, purchase payments and post-sale costs.
- These statutory/accounting exports require a separate jurisdiction-validation phase; they must not be inferred from UI labels alone.

### General and management reports

- Stock, yard/location, papers/VLC/VRC, vehicles on loan and employee outstanding money.
- Monthly car activity by sold/bought/paid date, `Bought by` and `Sold by`.
- Weekly analysis, top sellers, management sales, net sales, annual comparison, purchase by buyer, stock at date, sale-type summary and Revenue report.
- Exception reports include invoiced vehicles still in stock, vehicle-document gaps and vehicle-check gaps.

## AutoNexus delivery mapping

| Capability | Status after this slice | Rule / next work |
|---|---|---|
| Deal creator vs responsible salesperson | Implemented | Invoice/report attribution uses the responsible salesperson. |
| Buyer/invoice register | Implemented | Buyer, phone, vehicle, invoice/date, responsible, gross, credits, net and pending clearance. |
| Cheque and bank draft receipts | Implemented | They settle Deal balance but enter pending bank clearance. |
| Bank clearance action | Implemented | Owner/admin/accountant gives audited clearance with optional bank reference. |
| Rejected cheque/draft | Implemented locally | Original receipt is retained; a compensating movement reopens the invoice balance. |
| Refunds | Protected | Only the vehicle-return/reversal workflow creates them. |
| Internal message centre | Implemented locally | Dealer-scoped direct conversations, unread/read state, page context, membership enforcement and automated assignment events. Search, attachments, archive/mute and provider realtime remain pending. |
| Bank statement reconciliation | Implemented locally | Manual account/period setup, signed lines, partial/split matching, mathematical closing proof and immutable completed periods. |
| Bank transfers and journal adjustments | Later slice | OFX ingestion plus reviewed transfer, contra and write-off workflows remain pending. |
| Bank CSV statement import | Implemented locally | Atomic, audited batches with explicit signed-amount contract, period validation, 1,000-row bound and duplicate-content protection. |
| Nominal ledger and accounting periods | Implemented locally | Source-linked double entry, trial balance, management P&L, ageing, close blockers and audited owner reopen. Manual journals and cost centres remain pending. |
| VAT3 working view | Implemented with review boundary | T1–T4 domestic working figures plus explicit margin/clearance/data exceptions; not a filed or accountant-approved Revenue return. |
| Retrospective invoice date | Implemented locally | Configurable 0–365 day look-back, finance-role restriction, immutable issue timestamp and closed-period protection. |
| Statutory VAT/ROS/VRT exports | Later validation | Confirm Irish reporting rules and required fields with an accountant/current Revenue guidance before implementation. |

## Internal messaging slice boundary

The first messaging release now provides dealership-scoped employee conversations, unread counts, last-message preview, read state, automatic refresh and safe links to a customer/lead/vehicle/Deal. Assignment of a lead or Deal creates a system notification for the responsible person. Messages verify active dealer membership on every read/write and do not grant access to the linked record. Attachments, presence, search, archive/mute, external SMS/email, retention rules and cross-dealer messaging remain separate decisions.
