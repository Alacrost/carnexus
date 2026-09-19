# CarNexus / AutoNexus — Codex handoff

Updated: 2026-09-19

This file is the starting point for the next Codex session. Read it together with `docs/DELIVERY.md` and `docs/specs/sales-purchases-stage2.md` before changing code. Continue with the Ponytail method: plan a bounded slice, reuse the current architecture, test money/security changes, and record what shipped versus what remains.

## Repository state

- Repository: `https://github.com/Alacrost/carnexus.git`
- Local working directory: `carnexus-audit`
- Branch: `feat/crm-foundation`
- Latest local commits:
  - `2570942` — CRM lead foundation, scoped roles, pipeline reports and security fixes.
  - `5f37ecc` — transactional sales, purchases, payments, trade-ins, documents and vehicle details.
  - `fbcb0f7` — Supabase activation record and prioritized backlog.
- These commits are local until explicitly pushed. Check `git status` and the remote branch before pushing or opening a PR.
- `sources/` at the ChatGPT project root is read-only reference material and must not be edited.

## Supabase state

- Correct project: **Alacrost's Project** in the **AutoNexus** organization.
- Project ref: `wrpambhxyrcehefxpyli`
- Region: `eu-west-1` (Ireland/West EU)
- The repository is linked with the official Supabase CLI.
- Remote migration history is aligned from `001` through `041`.
- A post-push dry run returned `upToDate: true` with no pending migrations.
- Existing records were preserved across migration: 2 auth users, 1 dealer, 1 dealer member, 1 vehicle and 2 Storage objects.
- Post-migration verification: 42 public tables, all 42 with RLS enabled. CRM, commercial workflow, purchase balances and vehicle-detail functions/tables are present.
- `.env.local` exists locally and contains only the project URL, the public publishable key under the app-compatible `NEXT_PUBLIC_SUPABASE_ANON_KEY` name, and `NEXT_PUBLIC_DEMO_MODE=false`.
- `.env.local` is ignored by Git. Never commit it. Never put a `service_role` key in the browser app.
- The dashboard still showed the organization as **Free** and no scheduled backup immediately after the user reported an upgrade. Recheck billing propagation and scheduled backups before live dealer onboarding.

## Implemented product slices

### Sales CRM foundation

- Lead creation/update with optimistic version control and atomic contact handling.
- Pipeline stages, responsible salesperson, next action/date, loss reason, source and lead scoring.
- Append-only attributable activity/history for workflow changes, notes, calls, emails and WhatsApp logging.
- Search, pagination, lead detail/edit and period reports by stage, source and salesperson.
- Configurable CRM role profiles for read, work, assign and report permissions.
- Tenant isolation and public-data boundary fixes; fake DoneDeal sync success was removed.

### Commercial workflow

- Transactional sale creation, stock reservation and fixed vehicle after `Sell this car` starts.
- Deal, sales-order, purchase-order, agreement, quotation and invoice numbering.
- Permission-controlled sale-price override with explicit reason and version check.
- Purchase price protected server-side and revealed in the UI only to authorized roles.
- Multiple payment types, deposits, balances, refunds and finance payouts with replay/overpayment guards.
- Customer finance tracked separately from received funds.
- Trade-in purchase with vendor and lender liabilities, including negative equity and partial settlements.
- Agreement snapshots and invoice issue guards; final invoice after completion.
- Configurable seller/company, VAT, finance-company recipient and document terms.
- Vehicle details: VIN, trim, body, colour, engine, keys, owners, logbook, service history, equipment, condition, NCT and warranty.
- Purchase/lender outstanding balances and audit attribution.

## Validation already completed

- Local disposable PostgreSQL regression suite applies all 41 migrations.
- Tests cover two tenants, role/cost restrictions, atomic rollback, fixed vehicle, duplicate commands, split settlements, refunds, negative equity, finance approval, agreement/invoice guards and immutable history.
- Previous successful checks: `npm test`, `npm run typecheck` and production build.
- Browser demo previously verified CRM, reports, sale wizard, finance/payment panels, vehicle details and document settings.
- Hosted Supabase migration and structural checks now pass.
- On 2026-09-19, a new build compiled successfully with `.env.local`, then this managed execution environment blocked a child process with `spawn EPERM` during the post-compile TypeScript phase. This is an execution-sandbox limitation, not a reported TypeScript error. Run the normal checks again in the next Codex/local environment.

## Next work — recommended order

### P0: hosted acceptance and operational safety

1. Confirm the AutoNexus plan upgrade is attached to organization `ekhuzyylerrzoiobawnr`, then confirm a scheduled backup appears. Do not onboard live dealers before a restorable backup exists.
2. Start the app on port 3100 with `.env.local`; confirm it is not in demo mode.
3. Test real sign-in and dealer selection with the existing owner account. Do not paste passwords, OTPs or privileged keys into source or task messages.
4. Run an authenticated end-to-end flow against hosted Supabase: lead → follow-up → sale → agreement → finance/payment → completion → invoice.
5. Run purchase/trade-in tests: vendor cost, lender settlement, partial payments, negative equity and outstanding-payables report.
6. Add a second test dealer/user and validate tenant isolation, custom roles, purchase-price visibility and sale-price override permissions.
7. Rerun `npm test`, `npm run typecheck`, `npm run build` and focused lint. Record exact results in `docs/DELIVERY.md`.

### P1: finish the primary Sales CRM product

1. Design and implement reviewed cancellation/reversal, post-invoice credit notes/refunds and trade-in rollback. Preserve issued-document history.
2. Complete CRM tasks and appointments linked to customers, leads and deals.
3. Add customer timeline, assignment rules, invitations, exports and retention controls.
4. Add bank-reconciliation workflow and complete finance-provider operational states. Staff-entered events must not be presented as provider/bank confirmation.
5. Align permissions in legacy marketing, billing and inventory modules and close remaining audit P0 findings.
6. Resolve remaining legacy lint failures after the functional/security work is stable.

### P2: the other two commercial products and platform

1. Website product: selectable premium templates, dealer colours/text/domains and shared-stock publishing.
2. Marketing product: DoneDeal ad creation and promotion planning with configurable terms. Add real feed/API integration only when provider access exists.
3. Lead ingestion: deduplicated website, email, DoneDeal and Meta Ads adapters with source attribution and audit history.
4. Future channels: Facebook, Instagram and WhatsApp integrations.
5. AI messaging: configurable rules, tone, manual/automatic approval, escalation and complete audit trail.
6. Analytics: explainable sales, marketing and stock reports with permission-aware dealer and salesperson views.
7. Platform administration: dealers, subscriptions, three-product entitlements, usage, support access and consolidated reporting.

## Known limits and cautions

- No automatic bank transfer, lender API or dealer floorplan integration exists.
- Finance approval, receipt and settlement currently represent staff-entered operational records.
- Ordinary cancellation is intentionally restricted for closed/invoiced deals and deals containing trade-ins until reversal rules are implemented.
- Document terms are configurable text and are not legal/tax certification.
- Maintenance documents/evidence and electronic signatures remain future work.
- DoneDeal, Meta Ads, email and messaging provider connections are not implemented yet.
- Do not silently reinterpret or delete existing production records during future migrations.
- Before every database change: inspect the remote migration list, create/verify backup protection, dry-run, apply in numeric order and perform a post-migration RLS/data-preservation check.

## Useful commands

Run from the repository root:

```powershell
npm test
npm run typecheck
npm run build
npx supabase migration list --linked
npx supabase db push --linked --dry-run
```

Apply new remote migrations only after the dry run and backup checks are satisfactory. Keep credentials in local environment files or approved secret storage only.
