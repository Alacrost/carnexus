# Autonexus — Staged Roadmap

> Historical product roadmap. For the current implemented/pending checklist, use [TODO.md](./TODO.md); for delivery evidence, use [DELIVERY.md](./DELIVERY.md).

The product is built in stages. Each stage ships value on its own and the architecture
(multi-tenant, modular monolith) is designed so modules can be added without rewrites.

## Stage 0 — Foundation (current)

**Goal: secure multi-tenant skeleton.**

- [x] Next.js 15 (App Router, TypeScript, Tailwind) scaffold.
- [x] Supabase schema + Row Level Security for full tenant isolation.
- [x] Auth: signup creates dealer + Owner membership; login; role-based access.
- [x] Invitation flow for Admin/Sales users.
- [x] Protected app shell (Dashboard, Inventory, Leads, Settings).
- [x] Marketing landing page (see [LANDING_PAGE.md](./LANDING_PAGE.md)).

**Acceptance:** two dealers cannot see each other's data at the database level; a Sales
user cannot manage members or billing.

## Stage 1 — MVP "Marketing & AI Studio" (the core)

**Goal: the dealer's marketing runs through Autonexus.**

1. Inventory CRUD with photos (Supabase Storage) — the raw material for ads.
2. **Brand Kit**: logo upload, colors, logo placement rules (standard + custom
   fields), standard description blocks (warranty, finance, opening hours).
2b. **Business Setup**: dedicated screen where the dealer describes the business
   (opening hours; warranty types & what's covered; what's included / not charged
   in the deal; extra services & benefits on sale; contact phone / email /
   WhatsApp; social pages; website; finance availability + basic rules &
   requirements). This profile is fed to the AI as context for every generated
   ad/description. [in progress]
3. **AI photo enhancement** — quality only (lighting/sharpness/background cleanup),
   never altering the real condition of the car; automatic logo insertion per Brand Kit.
4. **AI description generator** with standard blocks + per-channel variants
   (DoneDeal, Facebook, Instagram, website).
5. Simple lead CRM + basic dashboard (supporting role).

**Campaign Composer (MVP core, shipped):** one vehicle → guided
clarify→suggest→confirm flow that produces editable per-channel copy (DoneDeal,
Facebook, Instagram post/story, WhatsApp, TikTok) + correctly-sized post images
composed client-side (free canvas). Optional AI photo enhancement / background
replacement via credits (200/dealer, OpenAI `gpt-image-1`, never alters the car).
Saved as a draft — never auto-published.

**Acceptance:** dealer uploads forecourt photos → gets branded, enhanced,
ready-to-publish creatives + descriptions for every channel.

## Marketing Studio v2 — active reorganization program

**Goal: one coherent Marketing Studio built on the Cover Photo Studio design.**
Full plan + module specs: [specs/marketing-studio-v2.md](./specs/marketing-studio-v2.md).

Resolves the tool overlap (Ad Creator ≈ Campaign Composer; Descriptions ≈ Blocks) by
consolidating into **three focused studios + one centralized entry**, all sharing a
reusable **Studio Shell** (toolbar with title inside · left rail · center workspace ·
right properties). Ordered, dependency-aware build — **all phases shipped**:

- **Phase A — Foundation:** M1 Studio Shell ([specs/studio-shell.md](./specs/studio-shell.md)) ·
  M2 Settings Integrations (DoneDeal creds + social links) · M3 Inventory plate + DoneDeal
  sync groundwork (mandatory `registration`).
- **Phase B — Focused studios:** M4 DoneDeal Description Studio (by car type; consolidates
  ads/scripts/blocks) · M5 Photo Background Studio (AI standard backgrounds on external
  photos, car never altered) · M6 Social Media Studio (FB/IG content + weekly planner).
- **Phase C — Orchestration:** M8 Dashboard (content calendar + DoneDeal stock + views
  mini-calendar) · M9 Leads viewings · M7 Promotions & Events v2 (social hand-off + dealer
  logo on public T&C) · centralized Campaign re-scope.
- **Future/backlog:** live DoneDeal API sync, direct social publishing/automation, video
  generation, dashboard as a full sales platform.

## Stage 2 — Social Content + Agency Access

0. **Events & Promotions studio** [shipped early]: create seasonal/holiday
   promotions with AI campaign angles + AI-drafted, editable **terms & conditions**
   (seeded from the brief + Business Setup). Active promotions get a public
   shareable T&C page (`/promo/[id]`) and can be attached to Ad Creator output.
1. **Social Content Generator**: posts/stories/reel scripts per platform, based on
   the dealer's site, page and Brand Kit; content calendar suggestions.
2. **Agency access**: dealer grants our in-office marketing team scoped `agency`
   access (marketing module only — no customer PII, no buy prices; audited,
   revocable). Invitation UI + audit trail.
3. Lead auto-reply + scoring (supporting).

## Stage 3 — Managed Ads (Instagram / Facebook / Google)

1. Meta Ads + Google Ads integration: campaign creation assistance, audiences,
   budgets, reporting (CPL, cost per sale, best campaign/car).
2. Campaign workspace shared between dealer and agency team.
3. Embeddable "Chat with us" widget answering from real inventory.

## Stage 4 — Lead automation + Finance + After Sales

1. Public lead intake endpoint (website form) with rate limiting; auto-reply
   (email, then WhatsApp); Hot/Warm/Cold scoring.
2. Finance pre-qualification form (encrypted PII — PPS, income). See [SECURITY.md](./SECURITY.md).
3. After-sales automation: review requests, service reminders, warranty tracking.

## Stage 5 — Integrations, Billing & Scale

1. DoneDeal / Carzone / CarsIreland publishing integrations.
2. WhatsApp Business API.
3. Stripe billing (Starter/Professional/Dealer Group plans, 14-day trial).
4. Platform super-admin panel (manage dealers, plans, usage).
5. Full BI dashboards; market price comparison.

## Business stage — Sales & Accounting (Deals) [planned, not scheduled]

**Goal: the money side of every car.** Full commercial record per vehicle (purchase, cost
line-items, sale) with computed **revenue, cost, margin, VAT (Irish margin scheme) and
profit**, plus filterable/exportable **reports**; **DoneDeal reconciliation** linking
purchased stock ↔ advertised listings by plate (review/approve + visual link status); and a
**deposit alert** ("sold but still online") offering a **DEPOSIT-PAID cover banner** or a
withdraw reminder. Financials are owner/admin-only (sales/agency never see cost/margin).
Full plan + phases: [specs/sales-accounting.md](./specs/sales-accounting.md). Build slices:
(1) deal records + money math **[shipped]**, (2) reports, (3) DoneDeal reconciliation, (4)
deposit alert + banner **[partly shipped]**.

## Business stage v2 — Deals & Trading (buy · sell · trade-in) [planned, active]

**Goal: the full commercial engine.** Customer-linked **Deals** holding one or more orders
(**Sales Order** / **Purchase Order**), **trade-ins** (allowance, outstanding-finance
settlement, net equity, trade-in stock), **deposit → signed Agreement → Invoice** (VAT-correct
per Irish margin/normal scheme; invoice to customer or **finance company**), **finance**
handling, "who sold it / which lead", and **configurable currency** in Settings. Document/
ficha-style UX. Absorbs & supersedes the Sales & Accounting Phase 1 (`vehicle_deals` → split
into `vehicle_acquisitions` + `deal_orders`). Full plan + 6 phases: [specs/deals-trading.md](./specs/deals-trading.md).

## Engineering principles for scale

- **Modular monolith**: each module in its own folder (`src/modules/*` as it grows);
  extract to services only when load demands it.
- **RLS-first security**: the database enforces isolation, never only the frontend.
- **Every table has `dealer_id`**: new modules follow the same tenancy pattern.
- **Feature flags per plan**: gate modules by `dealers.plan` so pricing tiers map to code.
- **Queues for AI/external work** (later): Supabase Edge Functions / background jobs so
  slow AI calls never block the UI.

## Later / backlog (captured, not scheduled)

- **Micro-animation polish pass**: richer, GPU-friendly hover/enter/exit/drag and
  scroll-reveal motion across the app (respecting `prefers-reduced-motion`, 60fps).
