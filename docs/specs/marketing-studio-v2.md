# Program — Marketing Studio v2 (organized plan)

> Status: draft (planning only — no code) · Owner: product/owner · Stage: 1–2
> This is the **umbrella plan** that reorganizes the whole app around one idea:
> the **Marketing Studio** — one place where a dealer runs all their marketing,
> built on the **Cover Photo Studio** design language (full-bleed shell: toolbar
> with the title inside · left tool rail · center workspace · right properties).
> Each module below becomes its own spec (`/specify` → `/plan` → `/tasks` → `/implement`).

---

## 1. Why this doc (the problem it solves)

Today the marketing hub has overlapping tools that confuse the user:

- **Ad Creator** and **Campaign Composer** feel like the same thing.
- **Descriptions & Blocks** overlaps both, plus **Ad Scripts**.

We also have a bigger vision now: DoneDeal descriptions by car type, an AI photo
editor that puts a **standard background** on external photos (without altering the
car), a **social-media content** studio with a **weekly planner**, and calendars that
tie promotions, posts and car viewings together — so a dealer never has to hire a
content person.

Goal of this doc: **organize the ideas, remove the duplication, and decide the reuse
map + build order once**, so we don't rewrite code as we go.

---

## 2. The consolidation (resolve the overlaps)

| Old tool | Decision | Becomes |
|---|---|---|
| **Ad Creator** (`/marketing/ads`) | **Merge** | Its per-channel copy engine (`adcopy.ts`) is reused by the studios. The standalone page is retired from the "Create" list. |
| **Campaign Composer** (`/marketing/campaigns`) | **Split into two entries** (decided) | No single unified campaign. Two destination-based generators: **DoneDeal** (Description + Photo for a listing) and **Social Media** (FB/IG content). Each adopts the Studio Shell. |
| **Descriptions & Blocks** | **Move** | "Standard blocks" (warranty/finance/hours) become **reusable snippets** managed under **Brand & Business setup**, consumed by all generators — not a separate "Create" tool. |
| **Ad Scripts** | **Fold** | Becomes the template layer of the **DoneDeal Description Studio** (car-type presets). |

**Net result — two destination-based generators** (decided), sharing focused studios + the shell:

- **DoneDeal generator** = **DoneDeal Description Studio** (listing by car type) + **Photo
  Background Studio** (clean listing photo). One flow to produce a DoneDeal-ready ad.
- **Social Media generator** = **Social Media Studio** (FB/IG content + weekly planner).

The three focused studios that power them:
1. **DoneDeal Description Studio** — standard listings by car type (SUV, 7-seater, hatch…).
2. **Photo Background Studio** — AI standard backgrounds applied to external car photos
   (explicit, opt-in per photo — decided).
3. **Social Media Studio** — FB/IG content + a weekly content planner.

Plus supporting modules: **Promotions & Events v2**, **Dashboard calendar + stock**,
**Leads viewings**, **Inventory + DoneDeal sync**, **Settings integrations**.

---

## 3. Shared foundation (build FIRST — avoids rewrites)

### 3.1 `StudioShell` component (design foundation)
Extract the Cover Photo Studio chrome into a reusable client component so every tool
looks identical without copy-paste. Own spec: [studio-shell.md](./studio-shell.md).

- Props: `title`, `subtitle`, `backHref`, `icon`, `tools[]` (`{key,label,icon}`),
  `activeTool`/`onToolChange`, `rightActions` slot, `properties` slot, `children`
  (center workspace).
- Layout = today's overlay-studio return: full-bleed `min-h-[calc(100vh-1px)]`,
  toolbar (back + icon tile + title/subtitle + right actions), grid
  `lg:grid-cols-[76px_1fr_360px]` (rail · workspace · properties).
- `overlay-studio.tsx` refactors to consume it (no visual change) — proves the shell.

### 3.2 Shared data infra introduced here (named once, reused everywhere)
- **Content calendar** → `scheduled_content` table (powers Social Studio **and** Dashboard).
- **Viewings** → `viewings` table (powers Leads **and** Dashboard mini-calendar).
- **DoneDeal integration** → creds in Settings + `vehicles.registration` (plate) +
  sync fields; powers Inventory reconcile + Dashboard stock.

---

## 4. Modules (spec-lets — each becomes its own `docs/specs/*.md`)

> Format per module: **Problem · Scope · Reuse (don't rewrite) · New data · AI flow**.
> All AI flows obey the AGENTS.md rule: clarify → suggest → confirm → execute, draft-first.

### M1 · Studio Shell  → `studio-shell.md` (written — foundation)
Reusable full-bleed shell. No data, no AI. Refactor `overlay-studio.tsx` onto it.

### M2 · Settings — Integrations  → `settings-integrations.md` **(SHIPPED)**
- **Problem:** we need DoneDeal + social links to power sync and posting.
- **Scope:** form for DoneDeal API credentials + Facebook page URL, Instagram URL,
  website URL. (Some already in `business_profiles.social_links` — reuse/extend.)
- **Reuse:** `business_profiles`, existing settings page, `studio-input`.
- **New data:** `dealer_integrations` table (dealer_id PK + facebook_url/instagram_url/
  website_url + `donedeal_api_key` AES-256-GCM ciphertext) + RLS (read = members, write =
  owner/admin). Key encrypted app-side via `src/lib/crypto.ts` (env
  `INTEGRATIONS_ENCRYPTION_KEY`); only a boolean "configured" reaches the client.
- **AI:** none. Migration `013_integrations.sql` — needs `npx supabase db push`.

### M3 · Inventory — plate + DoneDeal sync groundwork  → `inventory-donedeal-sync.md` **(SHIPPED — plate; live sync deferred)**
- **Problem:** to cross-reference with DoneDeal we must know each car's **registration**
  (license plate). Stock should also mirror DoneDeal.
- **Scope:** make **plate mandatory** on create/edit; DoneDeal **sync** action that
  matches by plate/ad id and, for cars not found on DoneDeal, **asks** the dealer to
  *delete* or *mark as sold* (never auto-destructive).
- **Reuse:** `vehicles`, inventory table/actions, the confirm-inline pattern.
- **New data:** `vehicles.registration` (required in-app), `vehicles.donedeal_ad_id`,
  `vehicles.last_synced_at` — migration `014_vehicle_registration.sql` (needs db push).
- **Done now:** plate captured + required (form + zod, uppercased) + shown on the vehicle
  detail; sync columns added. **Deferred (backlog):** the live DoneDeal sync + reconcile
  UI — waits on real API creds.
- **AI:** none.

### M4 · DoneDeal Description Studio  → `donedeal-description-studio.md` **(SHIPPED)**
- **Problem:** writing DoneDeal listings by hand is slow and inconsistent.
- **Scope:** dealer creates **standard descriptions by car type** (SUV, 7-seater,
  hatchback, saloon, estate, EV…). Pick a car → pick type template → AI drafts the
  DoneDeal listing → edit → save. Consolidates Ad Creator + Ad Scripts + blocks.
- **Reuse:** `adcopy.ts`, `ad_scripts`, `description_templates` (standard blocks),
  Business Setup facts, StudioShell.
- **Shipped:** route `/marketing/donedeal` on StudioShell (Setup/Blocks/Templates rail,
  editable listing workspace); `draftDoneDealListing`/`saveDoneDealListing` actions reuse
  `generateAdCopy(…'donedeal')`; car types + angle suggestions in `src/lib/car-types.ts`;
  `ad_scripts.vehicle_type` (migration 015) + type selector in the scripts manager; hub
  card replaces Ad Creator + Descriptions & Blocks. Migration `015` needs db push.
- **AI flow:** clarify (type/blocks) → suggest (3 angles) → edit → draft.

### M5 · Photo Background Studio  → `photo-background-studio.md` **(SHIPPED — as Cover Studio extension)**
- **Problem:** dealers get messy forecourt photos; they want a clean, consistent
  background on every car — without faking the car.
- **Scope:** (a) create/save **standard background templates** (choose a preset **or
  generate one with AI** and save it); (b) upload **external car photos**, AI **inserts
  the standard background** and **improves lighting only** — **never alters the car or
  its details** (SECURITY.md §9). Ships as a **default** capability of the app.
- **Reuse:** Cover Photo Studio (`overlay-studio.tsx`) + `src/lib/ai/image.ts`
  (`enhanceCarImage`, background op already exists), credits + `spend_ai_credits` RPC,
  StudioShell.
- **Shipped (ponytail):** the Cover Photo Studio already did upload + background-swap +
  lighting on external photos with credits/fail-closed — the only new value was **saved
  background templates**, added to its AI tool. Migration `016_background_templates`
  (dealer_id, name, prompt) + `saveBackgroundTemplate`/`deleteBackgroundTemplate` +
  `enhanceCoverImage` now accepts a template prompt (`preset=template` + `bgPrompt`). A
  template is a **named prompt** (no generated background image stored) — add a preview
  image only if needed. Migration needs db push.
- **AI flow:** apply is opt-in per photo (credits), clarify→confirm→execute, original kept.

### M6 · Social Media Studio  → `social-media-studio.md` **(SHIPPED — text+planner; image-from-scratch deferred)**
- **Problem:** dealers don't know what to post; pages go quiet; hiring is expensive.
- **Scope:**
  - **Content generator (FB/IG):** generate an **image from scratch** *or* use a
    **ready image** + generate **caption + hashtags**. Dealer chooses **content type**
    (tips / informative / "car of the week" / promo). AI uses **compliant,
    non-clickbait** digital-marketing technique that follows platform guidelines.
  - **Weekly planner (agenda):** a week/day view to plan what to post each day;
    **promotions & events auto-appear** on their dates.
  - **"Plan my week" button:** dealer shares their events/socials context → AI
    **recommends what to post each day** and can **generate + insert** it into the plan.
  - **Insert into app** (draft); **direct publishing to socials = future**.
- **Reuse:** `adcopy.ts`, `image.ts`, Brand Kit + Business Setup, Promotions data,
  StudioShell, the shared `scheduled_content` calendar.
- **New data:** `scheduled_content` (dealer_id, channel `facebook|instagram`, kind
  `tip|info|car_of_week|promo|custom`, status `draft|scheduled|posted|late|cancelled`,
  scheduled_for date, body, hashtags, image_path, vehicle_id?, promotion_id?, created_by).
- **AI flow:** clarify (goal, type, which car/promo) → suggest (draft posts + a weekly
  plan) → confirm/edit → save as `draft`/`scheduled`. Never auto-publish.
- **Shipped:** route `/marketing/social` on StudioShell (Calendar week view + Create
  generator); `src/lib/ai/social.ts` (compliant non-clickbait posts, 5 kinds, FB/IG mock
  fallback); `scheduled_content` table (migration 017) + `draftSocialPost`/
  `saveScheduledContent`/`setContentStatus`/`deleteScheduledContent`; "Plan my week"
  generates + inserts a tip/car/promo mix as drafts; promotions auto-appear on the
  calendar by date. **Deferred (backlog):** image-from-scratch generation + direct
  publishing to socials. Migration 017 needs db push.

### M7 · Promotions & Events v2  → `promotions-events-v2.md` **(SHIPPED — approval/signature + public page; social hand-off deferred)**
- **Keep the essence** (already shipped): build the promo/event structure + AI-drafted,
  editable **T&C** on a **public page** (`/promo/[id]`) with the **dealer wordmark**, for a
  shareable link.
- **Shipped now:** a **brief summary** shows on the public page; T&C must be **approved &
  signed** by a manager (owner or admin = marketing manager) via `approvePromotion` before
  it goes public — the signature (`approved_by/role/at`, migrations 020) is recorded and
  shown on the public page; non-managers see “Awaiting manager approval”. Public page reads
  the dealer trading name via a scoped public policy (migration 021).
- **Deferred (backlog):** one-click **“generate social content”** for the promo →
  `scheduled_content` drafts on the promo's dates (ties into M6). Migrations 020/021 need db push.

### M8 · Dashboard — content calendar + stock + views  → `content-calendar-dashboard.md` **(SHIPPED)**
- **Problem:** the dealer needs one glanceable command center.
- **Scope (now):**
  - **Big content calendar** with **week/month** toggle; **click a day → create planned
    content** for it; see status (**planned / posted / late / cancelled**).
  - **Stock view** pulled from **DoneDeal** (via M3 sync).
  - **Mini viewings calendar** with a small **"+ new"** button that deep-links to Leads.
- **Reuse:** `scheduled_content` (M6), `viewings` (M9), current dashboard KPIs/charts
  (pure SVG/CSS — no chart lib).
- **Future:** dashboard as a full sales platform.
- **AI:** none (surfaces content created elsewhere).
- **Shipped:** rebuilt `dashboard/page.tsx` as a command center — 4 KPIs (+ Posts planned),
  a `ContentCalendar` client hero (week/month toggle, status overview, day dots, deep-links
  to /marketing/social), kept stock-by-status + readiness donut + lead pipeline, and an
  Upcoming viewings mini-card (“+ New” → /leads, hidden from agency). `viewings` table
  (migration 018, shared with M9) is read here. DoneDeal stock = local `vehicles` (sync
  stubbed). Migration 018 needs db push.

### M9 · Leads — prospects + viewings  → `leads-viewings.md` **(SHIPPED)**
- **Problem:** dealers book car viewings ad-hoc and lose track.
- **Scope:** create an interested prospect + a **viewing appointment** (car, name,
  phone). Car pulled from inventory/DoneDeal, or **entered manually** if not found.
  A **viewings calendar** (week view); the **mini version** shows on the Dashboard.
- **Reuse:** `leads`/`customers` tables + current leads page, `viewings` (shared).
- **New data:** `viewings` (dealer_id, lead_name, phone, vehicle_id?, vehicle_label,
  scheduled_for timestamptz, status `booked|done|no_show|cancelled`, notes, created_by).
- **AI:** none.
- **Shipped:** `leads/actions.ts` (createViewing/setViewingStatus/deleteViewing, guard
  can.viewCustomerData) + `leads/viewings-manager.tsx` (client) — guided 3-step “Book a
  viewing” (who · which car [inventory picker or type manually] · when via datetime-local)
  + week calendar + upcoming list with status actions. `leads/page.tsx` rebuilt (pipeline
  overview + ViewingsManager; agency blocked). `viewings` table shipped in M8 (migration
  018). Dashboard mini viewings calendar (M8) reads the same table.

---

## 5. Build order (dependency-aware — the task program)

> Each step = run `/specify` (if not written) → `/plan` → `/tasks` → `/implement`.
> Ordered so the app stays buildable and nothing gets rewritten.

**Phase A — Foundation**
1. **M1 Studio Shell** (extract + refactor overlay-studio onto it). *No DB.*
2. **M2 Settings Integrations** (DoneDeal creds + social links). *Migration.*
3. **M3 Inventory plate + sync groundwork** (mandatory `registration` + sync fields). *Migration.*

**Phase B — Focused studios (reskin + consolidate on the shell)**
4. **M4 DoneDeal Description Studio** (consolidate ads/scripts/blocks; car-type templates).
5. **M5 Photo Background Studio** (AI background templates + apply to external photos).
6. **M6 Social Media Studio** (content generator + `scheduled_content` calendar).

**Phase C — Orchestration & command center**
7. **M8 Dashboard** (content calendar + DoneDeal stock + views mini-calendar).
8. **M9 Leads viewings** (prospects + viewings calendar).
9. **M7 Promotions & Events v2** (social hand-off + dealer logo on public T&C page).
10. **Two generator entries** (decided): a **DoneDeal** entry (Description + Photo) and a
    **Social Media** entry (Social Studio) — thin flows on top of the studios, on the shell.

**Future / backlog (captured, not scheduled)**
- Live DoneDeal API connection (auth + real sync) once creds are provided.
- Direct publishing to Facebook/Instagram; automated scheduling.
- **Video generation** (same clarify→suggest→confirm idea, sized per platform).
- Dashboard as a full sales platform.

---

## 6. Cross-cutting rules (binding)

- **Design:** every module uses `StudioShell` — one coherent studio, title inside the
  tool, full-bleed. Reuse studio primitives (`studio-surface`, `studio-input`,
  `text-gradient`, custom icons). No new card styles. (AGENTS.md primordial design rule.)
- **AI:** clarify → suggest → confirm → execute; **draft-first, never auto-publish**;
  show a "what it used" trail; **never invent car facts**; photo AI **must not alter the
  car** (lighting/background only) — SECURITY.md §9.
- **Tenancy/security:** every new table has `dealer_id` + RLS in the same migration
  (`user_dealer_ids()` / `user_role_in()`); DoneDeal API key + any tokens **encrypted**;
  `agency` role keeps marketing-only scope; `sales` never sees buy_price/margin.
- **Reuse before rewrite (ponytail):** no new deps; charts stay pure SVG/CSS; icons from
  `src/components/icons.tsx`; extend existing tables before adding new ones.

## Decisions (confirmed — Phase A greenlit)
1. **DoneDeal API:** **stubbed** for now — manual entry + mandatory plate; live connection
   later (backlog).
2. **Entries:** **two destination-based generators** — one for **DoneDeal**, one for
   **Social Media**. No single unified campaign.
3. **Photo backgrounds:** **explicit, opt-in per photo** (credits) — not on by default.
4. **Start:** Phase A, **M1 Studio Shell** first.
