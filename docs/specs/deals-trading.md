# Spec — Deals & Trading (buy · sell · trade-in) — Irish dealership

> Status: planning (no code) · Owner: owner/sales/finance · Stage: "Business"
> This is the **umbrella program** for the commercial engine. It **absorbs and supersedes**
> the shipped `sales-accounting.md` Phase 1 (`vehicle_deals`) — see §11 migration. Designed
> **whole, up front** so we build on the final schema once (ponytail: no repeated rewrites).

---

## 1. Problem
An Irish dealer's real day is **deals**: a customer walks in, we **sell** them a car, often
take their old one in **trade-in** (which may still have finance owing), take a **deposit**,
sometimes arrange **finance** (where the invoice goes to the finance company, not the
customer), and finally **close** with an **invoice** — VAT handled the Irish way (margin vs
normal scheme). The car we sell must feed/clear from **inventory**, and trade-ins arrive as
a second stock. Autonexus has inventory + a thin per-car financial record, but no **deal
process**: no customer-linked buy/sell, no PO/SO, no trade-in, no agreement/invoice, no
"who sold it / which lead" trail.

## 2. Goal
A **complete, document-style deal system**: create a **Deal** with a **customer**, attach
one or more **orders** (a **Sales Order** to sell a car and/or a **Purchase Order** to buy /
trade-in a car), appraise trade-ins (with outstanding-finance settlement and equity), take a
**deposit** and generate a signed **Agreement**, optionally wire **finance**, then **close**
and produce the **Invoice** (VAT-correct per scheme, addressed to customer or finance house).
The deal drives **inventory** (car reserved → sold; trade-in enters trade-in stock) and
records **who sold it and which lead** it came from. Currency is **configurable in Settings**.
Later, cars reconcile with **DoneDeal via API**.

## 3. Glossary & core concepts
- **Customer** — a party we sell to and/or buy from (individual or business).
- **Deal** — the umbrella transaction with one customer. Has a human ref (`D-2026-0001`),
  a status, a salesperson, and the originating **lead**. **A deal can hold one or more
  orders** (SO, PO, or both, or several).
- **Order** (`deal_orders`) — a line under a deal, either:
  - **Sales Order (SO)** — we sell a car from stock to the customer.
  - **Purchase Order (PO)** — we buy a car from the customer; if it's their old car it's a
    **trade-in**. (Standalone stock buys — auction/trade — are POs **without** a customer/deal.)
- **Trade-in** — a PO flagged `is_trade_in`: full appraisal, an **allowance** (the value it
  enters the trade for), optional **outstanding finance** (settlement figure) → **net equity**
  = allowance − settlement. The car lands in **trade-in stock**.
- **Two stocks** — `vehicles.stock_type`: `main` (bought to sell) vs `trade_in` (taken in a
  deal, pending recon → then promoted to `main`).
- **Agreement** — order form the customer signs at deposit stage (reserves the car).
- **Invoice** — the final VAT-correct document at close; may be **addressed to a finance
  company** when the sale is financed.
- **Payments** — deposit, balance, trade-in allowance applied, finance payout, refund.

## 4. The sales process (state machine)
`draft → quoted → agreed(deposit) → [finance] → completed | cancelled`

1. **Draft** — pick/create **customer** + salesperson + **lead source**. Add SO (car from
   stock) and/or PO/trade-in.
2. **Quote** — compute deal totals: sale price (+ add-ons) − trade allowance (± settlement)
   − deposit − finance = **cash balance due**. Show VAT per scheme.
3. **Trade-in appraisal** (if any) — capture the old car in full + allowance + outstanding
   finance/settlement → net equity; produce a **Trade-in Appraisal** doc; on agreement the
   trade-in car is created in **trade-in stock**.
4. **Agreement / deposit** — record **deposit payment**; generate signed **Agreement**; the
   sold car auto-moves to **reserved** and raises the existing "sold but still online" alert.
5. **Finance** (optional) — provider, agreement no, amount financed, customer deposit, term,
   APR; set **invoice_to = finance_company**; status proposed → approved → paid_out.
6. **Complete** — record balance/finance payout, **settle** any trade-in finance, generate
   the **Invoice** (VAT-correct, to customer or finance co), mark the sold car
   **sold/delivered**, promote/insert the trade-in into inventory, stamp **who sold + lead**.
7. **Post** — feeds inventory; later cross-references DoneDeal (withdraw sold, link listings).

Every transition writes to `audit_logs`.

## 5. Data model (target — build on this once)
All tables carry `dealer_id` + RLS. **Financials are sensitive** (owner/admin/accountant);
**customer PII** is owner/admin/sales(+accountant read); **agency sees none of this**.

### 5.1 `customers` (extend the existing table)
Add: `type` (`individual|business`), `business_name`, `vat_number` (business/commercial),
`address_line1/2`, `city`, `county`, `eircode`, `pps_number` (**encrypted** — finance/ID
only), `date_of_birth`, `driving_licence_no` (**encrypted**), `marketing_consent bool`.
(Keep `name/email/phone/notes/gdpr_consent_at/deleted_at`.)

### 5.2 `deals`
| field | notes |
|---|---|
| id, dealer_id | |
| deal_no | human ref `D-YYYY-NNNN` (per-dealer sequence) |
| customer_id | FK customers (nullable for standalone stock POs) |
| status | `draft\|quoted\|agreed\|finance\|completed\|cancelled` |
| salesperson_id | who sold (FK profiles) |
| lead_id | which lead it came from (FK leads, nullable) |
| currency | snapshot from dealer settings (default EUR) |
| notes, created_by, created_at, closed_at |

### 5.3 `deal_orders` (SO + PO in one table)
| field | notes |
|---|---|
| id, dealer_id, deal_id | |
| kind | `sale` (SO) \| `purchase` (PO) |
| vehicle_id | FK vehicles |
| is_trade_in | bool (POs only) |
| price | sale price (SO) or purchase/allowance (PO) |
| vat_scheme | `standard\|margin\|none` (SO) |
| vat_amount | computed & snapshotted |
| discount | SO |
| add_ons | jsonb: [{name, price, vat}] — warranty, GAP, service plan |
| — trade-in specifics (PO is_trade_in) — | |
| settlement_amount | outstanding finance to clear |
| settlement_provider | who to pay off |
| settlement_valid_until | date |
| net_equity | allowance − settlement (computed) |
| condition_notes, keys_count, has_logbook, service_history | appraisal |
| created_at |

### 5.4 `payments`
| field | notes |
|---|---|
| id, dealer_id, deal_id | |
| kind | `deposit\|balance\|trade_allowance\|finance_payout\|refund` |
| method | `cash\|bank\|card\|finance\|part_exchange` |
| amount, currency, paid_on, reference, created_by, created_at |

### 5.5 `deal_finance` (0/1 per deal)
provider, agreement_no, amount_financed, customer_deposit, term_months, apr,
**invoice_to** (`customer\|finance_company`), status (`proposed\|approved\|paid_out`), notes.

### 5.6 `deal_documents`
| field | notes |
|---|---|
| id, dealer_id, deal_id | |
| kind | `agreement\|invoice\|trade_in_appraisal\|purchase_receipt` |
| number | `INV-YYYY-NNNN`, etc. (per-dealer sequence) |
| issued_at | |
| snapshot | jsonb — **frozen** figures/parties at issue (immutable) |
| status | `draft\|issued\|void` |

### 5.7 `vehicle_acquisitions` (how each car entered stock — replaces the *purchase* half of Phase-1 `vehicle_deals`)
vehicle_id (PK), dealer_id, via (`purchase_order\|trade_in\|manual`), deal_order_id?,
purchase_price, purchase_date, supplier, source (`trade\|auction\|private\|part_exchange\|other`),
vat_scheme (qualifying?), notes.
Keep **`vehicle_costs`** (recon line-items) and **`src/lib/finance.ts`** as-is.

### 5.8 `vehicles` (extend)
Add `stock_type` (`main\|trade_in`, default `main`). Reuse existing `status`
(`bought\|preparation\|ready_for_sale\|reserved\|sold`) driven by the deal.

### 5.9 `dealers` (settings)
Add `currency` (default `EUR`) + `currency_symbol` (derive) — set in **Settings → General**.

### 5.10 Sequences
Per-dealer numbering for `deal_no`, invoice/agreement numbers (a `dealer_sequences` table or
an RPC that atomically increments per (dealer, kind, year)).

## 6. Financial & VAT logic (Irish rules)
- **Margin scheme** (most used cars): VAT on the **profit margin** only; the **invoice must
  NOT show a VAT line** and must carry the margin-scheme wording ("Margin scheme — output tax
  not deductible…"). Compute VAT = max(0, margin) × 23/123 (already in `finance.ts`).
- **Normal/standard scheme** (VAT-qualifying, ex-lease, **commercial** vehicles): VAT on the
  full price, **shown on the invoice**; 23%. Compute VAT = price × 23/123 (VAT-inclusive).
- **No VAT** (`none`) — e.g. private-to-private handled outside VAT.
- **Trade-in** doesn't create output VAT for the customer; it reduces the cash balance. The
  trade-in car's own future sale carries its own scheme.
- **Finance**: the **invoice is addressed to the finance company** for the financed amount
  (`invoice_to = finance_company`); the customer's deposit is receipted separately. Net cash
  from customer = deposit; net from finance = amount_financed.
- **Deal profit** = SO sale − car acquisition cost − recon costs − add-on costs − trade-in
  loss (if allowance > eventual resale) − finance commission (if tracked). Extend `finance.ts`
  with a `computeDealTotals()` that folds orders + payments + trade-in + finance.

## 7. UX — a deal is a **document/ficha**, not a studio
- **Deal sheet** (`/business/deals/[id]`): a compact, **A4-ish document-style form** (fixed,
  centered width — like a real deal sheet), sections: **Customer** · **Sale (SO)** · **Trade-in
  (PO)** · **Finance** · **Payments/Deposit** · **Totals** · **Documents**. Not full-bleed.
- **Deals list** (`/business/deals`): pipeline by status (draft/quoted/agreed/finance/
  completed) with customer, car(s), balance, salesperson.
- **Documents**: Agreement / Invoice / Trade-in appraisal render as **printable A4 documents**
  (print CSS now; PDF later), VAT-correct wording per scheme, dealer letterhead (name/logo).
- **Settings → General**: currency selector (default EUR) + business/VAT number for invoices.
- Reuse studio primitives (studio-surface, studio-input) but keep the **document feel**
  (bordered "paper", serif-ish headings optional, print styles). New icons via `icons.tsx`.

## 8. Security & GDPR
- Financials (deals/orders/payments/finance/acquisitions/costs/documents) → **owner/admin/
  accountant** RLS. Customer PII → owner/admin/sales (+accountant read for invoicing).
  **Agency: none.**
- Encrypt `pps_number` + `driving_licence_no` (reuse `src/lib/crypto.ts`); never send to client.
- `deal_documents.snapshot` is immutable once issued (audit-grade); voids create a new doc.
- All money mutations + status transitions → `audit_logs`.

## 9. Currency
`dealers.currency` (EUR default) set in Settings; every deal snapshots its currency so
historical documents never change. `finance.ts`/formatters take the currency symbol.

## 10. Build phases (ponytail — build on the FINAL schema, minimal rewrites)
> The schema above is the target; each phase adds tables/UI **without reshaping** earlier ones.

- **P1 — Customers + Deals + Orders + Deposit (the core process).** **(SHIPPED)** Extend
  `customers`; add `deals`, `deal_orders`, `payments`; `dealers.currency` + Settings currency.
  Deal list + deal sheet (Customer · SO · deposit · totals) + deal detail (status transitions
  + payments). Deposit → reserve car; complete → sold; cancel → back to ready. Records
  salesperson + lead. `manageDeals` = owner/admin/sales/accountant; nav split adds **Deals**.
  *Not yet:* dedicated Customers page; migrate Phase-1 `vehicle_deals` → acquisitions (still
  coexists — retire when the deal sheet owns the sale side).
- **P2 — Trade-in + two stocks.** PO/`is_trade_in` + appraisal fields + settlement/equity;
  `vehicles.stock_type` (main/trade_in); trade-in car auto-created in trade-in stock; net
  equity folds into deal totals.
- **P3 — Finance.** `deal_finance` + `invoice_to = finance_company` + financed-amount handling.
- **P4 — Documents.** `deal_documents` + Agreement & Invoice (print/PDF), VAT-correct wording
  + numbering sequences + dealer letterhead.
- **P5 — Accounting/reports.** Fold deals into the existing `/business` overview: revenue/
  margin/VAT/profit by period/salesperson/make/source + CSV (supersedes sales-accounting P2).
- **P6 — DoneDeal reconciliation via API.** Link stock ↔ listings by plate/ad id, withdraw
  sold, "linked / not linked" badges (was sales-accounting P3; now API-fed).

## 11. Relationship to the shipped Phase 1 (`sales-accounting.md`)
Phase 1 shipped `vehicle_deals` (1:1 purchase+sale on the car) + `vehicle_costs` + `finance.ts`
+ `/business`. This program **generalizes** it to be customer/deal-centric:
- **Keep:** `vehicle_costs`, `finance.ts` (extend), the `/business` overview + KPIs, the
  `accountant` role + financial RLS pattern, the deposit auto-reserve + alert.
- **Supersede:** `vehicle_deals` → split into `vehicle_acquisitions` (purchase side) +
  `deal_orders`/`payments` (sale side). Provide a one-off data migration; drop `vehicle_deals`
  only after the deal sheet reads/writes the new tables. This is the single planned rewrite —
  done deliberately now while Phase 1 is still small.

## 12. Open questions (confirm before P1)
**Decisions (confirmed):**
1. **Stock purchases come from a party** — a person or a company (e.g. an auction house).
   So every **PO has a counterparty** (a `customers`/party record; a business party = the
   auction house/trade). No "party-less" acquisitions.
2. **Numbering** = `YYYYMMDD-<n>` (date + per-dealer daily running number), e.g. `20260909-001`.
3. **Add-ons** (extended warranty, GAP, service plan) → **P3** (deferred).
4. **Currency** = **single, configured by the dealer** in Settings (EUR default).
5. **Invoice** = generated **PDF** with the dealer's **logo + configured header (letterhead)**
   and the dealer's configured **warranty terms** page (with or without warranty).
   → Settings gains: letterhead (logo already in Brand Kit + business/VAT no.) and a
   **warranty terms** editor; documents render them (P4).
