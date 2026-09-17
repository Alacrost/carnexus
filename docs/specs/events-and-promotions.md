# Spec — Events & Promotions studio

> Status: draft · Owner: dealer/owner · Stage: 2 (Social Content) — brought forward as a Marketing Studio "Create" tool

## Problem
Irish dealers run promotions (bank-holiday sales, finance offers, scrappage/trade-in
boosts, "car of the week") but writing them up is ad-hoc: they improvise the offer
wording and rarely publish clear **terms & conditions**, which looks unprofessional and
risks disputes. Coming up with fresh promo ideas each month is also a blank-page problem.

## Goal
A dealer describes a promotion in a sentence or two and gets, in seconds: a few polished
**campaign ideas/angles** and a ready, editable **terms & conditions** draft — saved as a
reusable promotion the studio can later turn into ads and posts.

## In scope
- Create / list / edit / end promotions (manual, one-click status like inventory).
- Promotion **kinds are seasonal/holiday-led**: Easter, Christmas, back-to-school, summer,
  new-year, bank-holiday, plus a generic `event`/`other` fallback.
- AI **"Generate ideas"**: from a short brief (+ chosen season) → 3 concise campaign angles
  (headline + hook).
- AI **"Draft terms & conditions"**: editable T&C text seeded from the brief + Business
  Setup (finance rules, what's included, hours) + Brand Kit tone.
- Live, editable preview of the promotion (title, offer, dates, T&C) before saving.
- **Ad Creator integration:** a saved promotion is selectable in the Ad Creator; its offer
  + T&C get appended to generated ads as a standard block.
- **Public shareable T&C page:** a minimalist public view per active promotion (no auth) to
  share on socials/website — shows title, exact period (dates), what's included / what's
  allowed, what's excluded / not allowed, and the full terms.

## Out of scope (later — ROADMAP backlog)
- Publishing/scheduling to channels or a content calendar (Stage 2 Social Content).
- Per-channel post/story variants (that's the Social Content Generator).
- Promotion performance analytics (Stage 3 Managed Ads reporting).
- Legal review/validation of T&C (AI draft carries an "edit & verify" disclaimer only).

## Data & security
- New table `public.promotions`:
  - `id uuid pk`, `dealer_id uuid` (FK dealers), `title text`, `kind text`
    (`seasonal`/`holiday`/`sale`/`finance`/`event`/`other`), `brief text`,
    `offer_details text`, `included text`, `excluded text`,
    `starts_on date`, `ends_on date`, `terms text`,
    `status text` (`draft`/`active`/`ended`, default `draft`),
    `created_by uuid`, `created_at timestamptz`, `updated_at timestamptz`.
- `dealer_id` + **RLS in the same migration**, same access model as marketing tables:
  read = `user_dealer_ids()`; write/update/delete = owner/admin/agency
  (`can.useMarketing`). Matches brand_kits/ad_scripts.
- **Public read policy** for the shareable page: `USING (status = 'active')` so anyone can
  read an *active* promotion by id (draft/ended stay private). No dealer data beyond the
  promotion row is exposed; the public page reads only these fields via the anon client.
- PII: none. Only business/offer text is sent to the AI (never customer data — SECURITY §9).
- Demo mode: `demoPromotions` in `src/lib/demo.ts`; server actions no-op and AI falls back
  to the deterministic mock generator (like adcopy).

## UX & studio design
- Route: `src/app/(app)/marketing/promotions/` — add a **"Promotions & Events"** card to
  the Marketing hub **Create** group (custom icon, one-line "what it does").
- Screens: list of promotions (studio-surface cards with status chip + confirm/undo status
  changes, reusing the inventory pattern) and a create/edit form with two AI buttons
  ("Generate ideas", "Draft terms") and an editable preview.
- Reuse studio primitives only: `studio-surface`, `studio-input`, `text-gradient`,
  `animate-rise`, custom icons — no new card styles, no chart libs, no new deps (ponytail).
- User-facing "what it does" line: *"Spin up a sale or event with AI angles and ready-to-edit terms & conditions."*
- AI wiring: extend `src/lib/ai/` with a small `promo.ts` (ideas + T&C) mirroring `adcopy.ts`
  (OpenAI when key present, deterministic mock otherwise); pass Business Setup + Brand Kit as
  context via the existing `businessContextFrom()` helper.

## Acceptance criteria
- [ ] A dealer can create a promotion, generate 3 idea angles from a brief, draft & edit T&C, and save it.
- [ ] Promotions are dealer-isolated (RLS) and only owner/admin/agency can write.
- [ ] Works in demo mode (mock ideas/terms, no DB writes).
- [ ] AI receives only business/offer text — no customer PII.
- [ ] Build passes (`npm run build`).

## Technical plan

**Migration — `supabase/migrations/009_promotions.sql`**
- `create table public.promotions (...)` per Data & security (add `included`, `excluded`).
- `alter table ... enable row level security;`
- Policies (mirror `004_marketing.sql` brand_kits/ad_scripts):
  - `promotions_read` — `for select using (dealer_id in (select public.user_dealer_ids()))`.
  - `promotions_write` — `for all using/with check` dealer_id in user_dealer_ids AND
    `public.user_role_in(dealer_id) in ('owner','admin','agency')`.
  - `promotions_public_read` — `for select to anon using (status = 'active')`.
- `create index promotions_dealer_idx on public.promotions(dealer_id, status);`
- User runs `npx supabase db push` after (CLI is interactive).

**AI — `src/lib/ai/promo.ts`** (mirror `adcopy.ts`)
- `PromoInput { kind, brief, offerDetails, starts, ends, businessContext?, brandTone? }`.
- `generatePromoIdeas(input)` → `{ angles: {headline, hook}[] }` (3 angles).
- `generatePromoTerms(input)` → `{ terms, included, excluded }` string block.
- OpenAI when `OPENAI_API_KEY` set, else deterministic mock (seasonal-aware templates).
  Reuse `businessContextFrom()` from marketing actions for facts.

**Server actions — extend `src/app/(app)/marketing/actions.ts`**
- `savePromotion(state, formData)` — zod validate; guard `can.useMarketing`; demo no-op;
  `upsert` into promotions; `revalidatePath('/marketing/promotions')`.
- `setPromotionStatus(id, status)` — guard + update + revalidate (draft↔active↔ended).
- `draftPromoIdeas` / `draftPromoTerms` — call `promo.ts`, load business_profiles +
  brand_kits (reuse existing loaders); demo returns mock.

**Routes**
- `src/app/(app)/marketing/promotions/page.tsx` — server; guard useMarketing; list
  promotions (studio-surface cards + status chip, confirm/undo like inventory) + link to new.
- `.../promotions/promotions-manager.tsx` — client; create/edit form (kind select seasonal
  options, brief, offer, dates, included/excluded, terms), two AI buttons, live editable
  preview. Reuse `studio-input`, gradient button, `animate-rise`.
- `src/app/promo/[id]/page.tsx` — **public** server component (outside `(app)`); reads active
  promotion via anon client; minimalist studio-surface layout: title, dealer name, period
  (starts_on–ends_on), Included/Allowed, Excluded/Not allowed, full Terms, "review before
  relying on offer" note. 404 if not found/not active. `params` is a Promise → `await params`.

**Ad Creator integration**
- `src/app/(app)/marketing/ads/ad-generator.tsx` — optional promotion `<select>` (active
  promotions passed from its page); on submit, append chosen promo's offer + T&C to the ad
  request. `generateAd` in actions appends the promo block to `businessContext`/brand input.

**Marketing hub + icons**
- Add `PromoIcon` (or reuse `SparkIcon`) card in the **Create** group of
  `src/app/(app)/marketing/page.tsx`, href `/marketing/promotions`,
  "Spin up a seasonal sale or event with AI angles + ready T&C."

**Demo + docs**
- `demoPromotions` in `src/lib/demo.ts` (2–3 seasonal samples, one `active`).
- ROADMAP: move Events & Promotions from backlog → Stage 2 in progress.
- Update `/memories/repo/autonexus.md` after build passes.

**Verify:** `npm run build` (exit 0); dev server already running — do not start a second.

## Tasks
- [x] 1. `supabase/migrations/009_promotions.sql` — table + RLS + 3 policies + index.
- [x] 2. `src/lib/demo.ts` — `demoPromotions` (seasonal samples, one active).
- [x] 3. `src/lib/ai/promo.ts` — `generatePromoIdeas` + `generatePromoTerms` (OpenAI/mock).
- [x] 4. `src/app/(app)/marketing/actions.ts` — `savePromotion`, `setPromotionStatus`,
      `draftPromoIdeas`, `draftPromoTerms`; promo block into `generateAd`.
- [x] 5. `src/components/icons.tsx` — `PromoIcon` (or reuse existing).
- [x] 6. `src/app/(app)/marketing/promotions/page.tsx` + `promotions-manager.tsx`.
- [x] 7. `src/app/promo/[id]/page.tsx` — public T&C page (anon read, 404 if not active).
- [x] 8. `src/app/(app)/marketing/page.tsx` — add card to Create group.
- [x] 9. `src/app/(app)/marketing/ads/ad-generator.tsx` + `ads/page.tsx` — promo select.
- [x] 10. `npm run build` (exit 0); update ROADMAP + repo memory.

## Resolved decisions
- **Kinds** = seasonal/holiday-led (Easter, Christmas, back-to-school, etc.) with
  `event`/`other` fallback.
- Saved promotions **are** selectable in the Ad Creator (offer + T&C appended as a block).
- Ship a **public shareable T&C page** — minimalist, with exact period and clear
  included / allowed vs excluded / not-allowed detail.
