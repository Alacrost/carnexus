# Spec — Sales & Accounting (Deals) + DoneDeal reconciliation

> Status: Phase 1 **shipped** · Phases 2–4 planned · Owner: owner/finance · Stage: "Business"
> This is a **large program**; §"Build phases" breaks it into shippable slices. Each slice
> runs through the spec kit (`/plan` → `/tasks` → `/implement`) when scheduled.

## Decisions (confirmed)
- **VAT:** per-car `vat_scheme` — **`standard` (normal, 23% on price)** default for cars;
  **`margin`** (23% on profit) and **`none`** as overrides; commercial vehicles use 23%.
- **Role:** a dedicated **`accountant`** role was added (reads financials + manages deals).
- **Deposit:** recording a deposit **auto-moves** the inventory status (deposit/reserved →
  `reserved`; sold/delivered → `sold`) and keeps it listed until withdrawn.

## Problem
Autonexus tracks the *operational* side of a car (inventory, marketing, viewings) but not
the **money**. An Irish dealer needs the full commercial record for each car — what it cost
to buy and prepare, what it sold for, the **margin, VAT and profit** — and to pull
**business/accounting reports** from it. They also can't tell which purchased cars are
actually **linked to their DoneDeal listings**, and when a car takes a **deposit** it often
stays **live online** by mistake (double bookings, wasted leads).

## Goal
A **complete, structured Sales & Accounting module**: every car carries a purchase record,
cost line-items and (when sold) a sale record; the system computes **revenue, cost, gross &
net margin, VAT (Irish margin scheme), and profit**, and produces **filterable, exportable
reports**. Purchased stock is **reconciled with DoneDeal listings** (matched by
registration/plate, reviewed and approved by the dealer) with clear **visual link status**
on both sides. A **deposit** flags the car as *sold-but-online* and offers a **"Deposit
Paid" cover banner** or a **withdraw reminder**.

## In scope
- **Purchase record** per car: purchase price, date, supplier/source, VAT scheme, notes.
- **Cost line-items** per car: prep, NCT, valet, parts, transport, advertising, other.
- **Sale record** per car: sale price, **deposit** (amount + date), balance, buyer, payment
  method, finance provider, part-exchange value, salesperson, sold/delivered dates, status
  (`reserved | deposit_paid | sold | delivered`).
- **Financial computation** (per car + aggregated): revenue, total cost, gross margin, VAT
  on the margin (Irish used-car **margin scheme**), net profit.
- **Reports** (VISUAL — charts/KPIs per the design rule): by period, make/model, source,
  salesperson; totals for revenue / cost / margin / VAT / profit; **CSV export**.
- **DoneDeal reconciliation**: match purchased stock ↔ advertised listings by **plate**;
  dealer **reviews & approves** each link; **visual link badges** (linked / not linked) on
  both the purchased-stock view and the DoneDeal-inventory view.
- **Deposit alert**: recording a deposit → the car is *sold pending*; a prominent alert
  "**sold but still online**" with two actions: (a) apply a **"DEPOSIT PAID" banner** to the
  cover photo (reuse the Cover Photo Studio overlay) or (b) **remind to withdraw** on DoneDeal.

## Out of scope (later — ROADMAP)
- Double-entry bookkeeping / Xero/Sage/accounting-software export beyond CSV.
- **Automatic** DoneDeal withdraw or price update (needs the live DoneDeal API — stubbed).
- Payment processing / bank reconciliation.
- Multi-currency (EUR only for MVP).
- AI report narratives (nice-to-have later).

## Data & security
All tables carry `dealer_id` + RLS. **Financial data is sensitive**: `sales` and `agency`
roles must **never** see cost/margin/VAT/profit (extends the existing "sales never sees
buy_price/margin" rule). Buyer PII (name/phone) is GDPR data — store minimal, consider
pgcrypto for contact fields (docs/SECURITY.md).

New tables (proposed):
- `vehicle_purchases` — dealer_id, vehicle_id (unique), purchase_price numeric,
  purchase_date date, supplier text, source (`trade|auction|private|part_exchange|other`),
  vat_scheme (`margin|standard|none`) default `margin`, notes, created_by.
- `vehicle_costs` — id, dealer_id, vehicle_id, kind (`prep|nct|valet|parts|transport|advertising|other`),
  amount numeric, cost_date date, notes, created_by.
- `vehicle_sales` — dealer_id, vehicle_id (unique), sale_price numeric, deposit_amount
  numeric, deposit_date date, balance numeric (computed/stored), buyer_name, buyer_phone,
  payment_method (`cash|bank|finance|card|mixed`), finance_provider, part_exchange_value
  numeric, salesperson text, status (`reserved|deposit_paid|sold|delivered`), sold_date,
  delivered_date, vat_amount numeric, notes, created_by.
- `donedeal_links` — id, dealer_id, vehicle_id, donedeal_ad_id/url, matched_by
  (`plate|manual`), status (`suggested|approved|rejected`), linked_by, linked_at.
  (May reuse `vehicles.donedeal_ad_id` from migration 014 + a link-status column.)

Capabilities (`src/lib/types.ts`): add `can.viewFinancials`/`can.manageDeals` = owner/admin
(+ a future `accountant` role). Reuse `can.viewBuyPrices` where it fits.

Derived money (not stored raw where avoidable):
- total_cost = purchase_price + Σ vehicle_costs.
- gross_margin = sale_price − total_cost.
- VAT (margin scheme) = max(0, gross_margin) × rate/(1+rate)  (IE standard rate 23%).
- net_profit = gross_margin − vat_amount − (allocated overheads, later).

Demo mode: `src/lib/demo.ts` sample purchases/costs/sales + a couple of DoneDeal links
(one linked, one unlinked) so the reconciliation + reports render.

## UX & studio design
- New top-level area (nav) — e.g. **"Business"** (or **Sales**) — owner/admin only.
- **Deal editor** per car (purchase, costs, sale) — reachable from the vehicle detail and
  from the Business area.
- **Reports** = VISUAL dashboards (KPI cards + pure SVG/CSS charts, no chart lib) with
  period/make/source/salesperson filters + **Export CSV**.
- **Reconciliation** screen: two columns — *Purchased stock* ↔ *DoneDeal listings* — with
  **link badges** (green "Linked" / grey "Not linked"), plate match highlight, and
  **Review & approve** per suggested link. Both the inventory list and the purchased-stock
  list show a small link indicator.
- **Deposit alert**: a prominent banner on the vehicle + a toast/modal offering
  "Add **DEPOSIT PAID** banner to cover" (opens the Cover Photo Studio pre-loaded with the
  banner overlay) or "Remind me to withdraw on DoneDeal" (marks a reminder).
- Reuse studio primitives (studio-surface, studio-input, custom icons, StudioShell where a
  full editor fits). Charts glanceable per the primordial design rule.

## AI interaction
- None for the MVP (financial accuracy > generation). A later add: AI monthly report
  summary — would follow clarify→suggest→confirm and never invent numbers.

## Acceptance criteria
- [ ] Record purchase + cost line-items + sale per car; system computes total cost, gross
      margin, VAT (margin scheme), and net profit correctly (unit-checked).
- [ ] Reports filter by period / make / source / salesperson with correct totals + CSV export.
- [ ] Reconciliation matches stock ↔ DoneDeal by plate, supports review/approve/reject, and
      shows link status visually on both sides.
- [ ] A deposit sets status `deposit_paid`, raises the "sold but online" alert, and offers
      the DEPOSIT-PAID cover banner (Cover Photo Studio) or a withdraw reminder.
- [ ] `sales` and `agency` roles never see cost/margin/VAT/profit.
- [ ] Build passes (`npm run build`).

## Build phases (each a spec-kit slice)
1. **Deal records + money math** **(SHIPPED)** — `vehicle_deals` (1:1) + `vehicle_costs`
   tables (migration 024) + `member_role` gains `accountant` (023) + RLS owner/admin/
   accountant. Pure `src/lib/finance.ts` (VAT by scheme, self-check). `/business` overview
   (KPIs revenue/cost/VAT/profit + per-car table + deposit-pending alert) and
   `/business/[vehicleId]` deal editor (purchase/costs/sale, live financial summary,
   "sold but online" alert with DEPOSIT-PAID-banner link + withdraw reminder, deposit
   auto-reserve). Side nav split into **Sales & Stock** vs **Marketing** groups; Sales &
   Accounts nav gated to `can.viewFinancials`. demo.ts demoDeals/demoCosts.
2. **Reports** *(partly done: overview KPIs + table)* — remaining: period/make/source/
   salesperson filters + **CSV export** + visual charts.
3. **DoneDeal reconciliation** *(pending)* — `donedeal_links` + plate match + review/approve
   + link badges on inventory & purchased stock.
4. **Deposit alert + DEPOSIT-PAID banner** *(partly done: alert + auto-reserve + link)* —
   remaining: actually render/apply the DEPOSIT-PAID banner overlay via the Cover Photo
   Studio (preload the banner) + a persisted withdraw reminder.

## Open questions (confirm before Phase 1)
1. **VAT scheme default** — is the **margin scheme** (VAT on profit) the right default for
   your used-car stock, with `standard`/`none` as overrides? Confirm the rate (23%?).
2. **Roles** — should a dedicated **`accountant`** role be added (read financials only), or
   is owner/admin enough for now?
3. **Deposit → status** — when a deposit is taken, should the car's **inventory** status also
   move to `reserved` automatically (it already has that status), and stay listed until
   withdrawn?
