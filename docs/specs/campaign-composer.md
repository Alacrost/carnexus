# Spec — Campaign Composer (Marketing MVP)

> Status: draft · Owner: dealer/owner · Stage: 1–2 (the sellable core)

## Problem
An Irish dealer with a car to sell has to do the whole marketing job by hand: write a
DoneDeal listing, rewrite it for Facebook/Instagram, crop the photo differently for each
platform, and remember to add the price, logo and offer. It's slow, inconsistent, and easy
to skip — so cars sit longer and social pages go quiet.

## Goal
From one car (and an optional promotion), the dealer gets a ready-to-post **campaign** in
one guided flow: per-channel text **and** a correctly-sized branded image for DoneDeal,
Facebook, Instagram, WhatsApp and TikTok — reviewed and editable, saved as a draft.

## In scope
- **Guided composer** (one flow): pick vehicle → optional promotion → AI clarifies &
  suggests → generate → review/edit → save draft. Follows the AI-generation rule (below).
- **Per-channel text**: reuse `adcopy.ts` (DoneDeal, Facebook, Instagram, plus WhatsApp and
  TikTok caption variants) with Brand Kit tone + Business Setup facts + promotion block.
- **Image composition (canvas, free)**: the dealer's real car photo + headline/price
  overlay + logo (Brand Kit), auto-exported at the **right size per platform** (below).
  Reuses the Cover Photo Studio canvas engine — no new deps.
- **Optional AI image (credits)**, opt-in per image, shown with its credit cost:
  - **Quality enhancement / realce** — lighting, sharpness, denoise. **Never alters the
    car itself** (no added/removed features, no condition changes) — docs/SECURITY.md §9.
  - **Background replacement** — optional, clearly labelled as an edited background; the car
    is preserved untouched.
- **Export/download** each channel's text + image; everything editable before saving.
- **Save campaign as `draft`** (bundle of per-channel assets tied to the vehicle).

## Out of scope (later — ROADMAP)
- **Scheduling & publishing** to any platform (post-MVP; Stage 3 Managed Ads).
- **Credit purchase / billing UI** — MVP only tracks & deducts a balance; top-up later.
- Campaign performance analytics.
- Video/reel rendering (TikTok/IG get a sized still image for MVP, not an edited video).

## Platform output sizes
| Channel | Size (px) | Ratio |
|---|---|---|
| DoneDeal listing | 1200 × 900 | 4:3 |
| Facebook feed | 1080 × 1080 | 1:1 |
| Instagram feed | 1080 × 1350 | 4:5 |
| Instagram story | 1080 × 1920 | 9:16 |
| WhatsApp status | 1080 × 1920 | 9:16 |
| TikTok | 1080 × 1920 | 9:16 |

## Data & security
- New table `public.campaigns`: `id`, `dealer_id`, `vehicle_id`, `promotion_id` (nullable),
  `status` (`draft`/`ready`, default `draft`), `assets jsonb` (per-channel: text + image
  path/meta + AI ops used), `created_by`, `created_at`, `updated_at`.
- **Credits**: `dealers.ai_credits int not null default <N>` (simple balance). AI image ops
  deduct **server-side, atomically** via an RPC (`spend_ai_credits(dealer_id, n)` that checks
  balance ≥ n and decrements in one statement); block with a clear message at 0. No client
  ever sets the balance.
- `dealer_id` + **RLS in the same migration** (owner/admin/agency write, members read),
  mirroring `004_marketing.sql`. Campaign images live in the existing brand/vehicle buckets
  under `{dealer_id}/...`.
- **PII**: none. Text-AI receives only vehicle + brand + business + promo text. Image-AI
  receives only the car photo. Never customer data (SECURITY §9).
- **Integrity**: enhancement must not change the car; background swaps are labelled edited.
  Store which AI ops ran in `assets` for the trust trail.
- Demo mode: `demoCampaigns`; AI text falls back to the mock generator; AI image ops are
  disabled/simulated (no credit spend).

## UX & studio design
- Route: `src/app/(app)/marketing/campaigns/` — a **"Campaign Composer"** card in the
  Marketing hub **Create** group (custom icon, one-line "what it does"). Likely the new
  "Start here".
- A guided, few-step flow on studio surfaces (reuse `studio-surface`, `studio-input`,
  `text-gradient`, `animate-rise`, custom icons, and the Cover Photo Studio canvas code).
- Per-channel preview cards show the sized image + its text side by side; each has Copy /
  Download and an "Enhance with AI (n credits)" affordance.
- One objective line: *"One car → ready-to-post text + sized images for every channel."*

## AI interaction (required — AGENTS.md AI-generation rule)
- **Plan/gather:** auto-pull vehicle, Brand Kit tone, Business Setup facts, chosen promotion
  — the dealer retypes nothing.
- **Clarify:** the AI asks a couple of concise questions (target buyer, tone, how hard to
  push the offer) or offers sensible defaults; it never guesses silently.
- **Suggest:** propose 2–3 campaign angles; the dealer picks one before any final copy.
- **Confirm & refine:** all text is editable; images regenerate; AI image ops are opt-in and
  show their credit cost and a preview before spending.
- **Execute:** produce the final per-channel assets; save as `draft`. Never auto-publish.

## Acceptance criteria
- [x] From one vehicle, the dealer gets editable text + a correctly-sized image for all six
      channel formats, saved as a draft campaign.
- [x] Text generation follows clarify→suggest→confirm→execute (not a single Generate button).
- [x] AI image enhancement never alters the car; background swaps are labelled; both cost
      credits, deducted atomically server-side; blocked at zero balance.
- [x] Canvas composition works with **zero** AI credits (free path always available).
- [x] Dealer-isolated (RLS); owner/admin/agency write; no customer PII sent to any AI.
- [x] Works in demo mode (mock text, image AI simulated). Build passes (`npm run build`).

## Technical plan

**Migration — `supabase/migrations/010_campaigns.sql`**
- `create table public.campaigns (id uuid pk, dealer_id uuid fk dealers, vehicle_id uuid fk
  vehicles, promotion_id uuid null fk promotions, status text default 'draft'
  check in ('draft','ready'), assets jsonb not null default '{}', created_by, created_at,
  updated_at)` + `index (dealer_id, status)`.
- RLS (same as `004_marketing.sql`): read = `user_dealer_ids()`; write/update/delete =
  `user_role_in(dealer_id) in ('owner','admin','agency')`.
- `alter table public.dealers add column if not exists ai_credits int not null default 200;`
- **RPC** `public.spend_ai_credits(p_dealer_id uuid, p_amount int) returns int`
  (security definer): verify caller is a member of the dealer, `update dealers set
  ai_credits = ai_credits - p_amount where id = p_dealer_id and ai_credits >= p_amount`;
  if no row updated → `raise exception 'insufficient_credits'`; return new balance.
- Costs: **enhance = 1 credit, background = 2 credits**.
- User runs `npx supabase db push`.

**Text AI — extend `src/lib/ai/adcopy.ts`**
- Add channels `whatsapp` and `tiktok` to `AdChannel`, `channelSpecs`, and the `channels`
  array in `actions.ts` (WhatsApp = short status caption; TikTok = punchy hook + hashtags).
- Reuse `generateAdCopy` per channel; Brand Kit tone + Business Setup + promotion block
  already flow through `businessContext`.

**Image AI — new `src/lib/ai/image.ts`** (mirror adcopy's provider/mock pattern)
- `enhanceCarImage(imageUrl, { mode: 'enhance' | 'background', prompt? })` → returns new
  image bytes. Uses OpenAI images **edit** (`gpt-image-1`) when `OPENAI_API_KEY` set:
  - enhance prompt hard-constrains: *"improve lighting, sharpness and clarity only; do NOT
    change the vehicle — its colour, shape, panels, features, plate or condition."*
  - background prompt: replace only the background, keep the car pixel-faithful.
  - No key / error → mock returns the original image unchanged (free, never blocks).
- SECURITY: original photo is always kept; result stored alongside, `assets` records which
  op ran (trust trail). Background swaps are flagged `edited_background: true`.

**Composition (client canvas, free)** — reuse Cover Photo Studio canvas approach
- `campaign-composer.tsx` (client) draws, per platform size, the base image (cover-fit) +
  bottom gradient scrim + headline/price text + Brand Kit logo, then `canvas.toDataURL` to
  preview and download. Sizes from the table above. `crossOrigin="anonymous"` on images so
  signed-URL sources don't taint the canvas (same fix as overlay studio).

**Server actions — `src/app/(app)/marketing/campaigns/actions.ts`** (or extend marketing)
- `startCampaign(vehicleId)` — load vehicle cover photo (signed url), brand, business,
  active promotions; guard `useMarketing`.
- `draftCampaignIdeas` / generate per-channel copy — clarify→suggest→confirm (angles first,
  then final text), reusing `generateAdCopy`.
- `enhanceCampaignImage(imagePath, mode)` — guard; call `spend_ai_credits` RPC **before**
  the OpenAI call (fail closed on insufficient credits); on success upload result to
  `brand-assets/{dealerId}/campaigns/{uuid}.png`, return signed url + new balance. Demo /
  no-key → simulate, no spend.
- `saveCampaign(state, formData)` — upsert `campaigns` with `assets` jsonb, status `draft`;
  revalidate. Never publishes.

**Routes & hub**
- `src/app/(app)/marketing/campaigns/page.tsx` (server guard) + `campaign-composer.tsx`
  (client guided flow) + list of draft campaigns.
- Add a **`CampaignIcon`** to `src/components/icons.tsx`; add a "Campaign Composer" card to
  the Marketing hub **Create** group and promote it as the new "Start here".
- Surface remaining `ai_credits` in the composer (read from session/dealer).

**Demo + docs**
- `demoCampaigns` in `src/lib/demo.ts`; image AI simulated, no credit spend.
- ROADMAP: mark Campaign Composer as the Stage 1–2 MVP core.
- Update `/memories/repo/autonexus.md` after build passes.

**Verify:** `npm run build` (exit 0); dev server already running — do not start a second.

## Tasks
- [x] 1. `supabase/migrations/010_campaigns.sql` — `campaigns` table + RLS + index;
      `dealers.ai_credits` column; `spend_ai_credits` RPC.
- [x] 2. `src/lib/ai/adcopy.ts` — add `whatsapp` + `tiktok` channels + specs.
- [x] 3. `src/lib/ai/image.ts` — `enhanceCarImage` (OpenAI gpt-image-1 edit + mock fallback).
- [x] 4. `src/components/icons.tsx` — `CampaignIcon`.
- [x] 5. `src/lib/demo.ts` — `demoCampaigns`; expose `ai_credits` on demo dealer.
- [x] 6. `src/app/(app)/marketing/campaigns/actions.ts` — `startCampaign`,
      `draftCampaignIdeas`, per-channel copy, `enhanceCampaignImage` (RPC-gated),
      `saveCampaign`.
- [x] 7. `src/app/(app)/marketing/campaigns/page.tsx` + `campaign-composer.tsx` (guided
      flow, canvas per-platform sizing, credit balance, draft list).
- [x] 8. `src/app/(app)/marketing/page.tsx` — add "Campaign Composer" card (new Start here).
- [x] 9. `npm run build` (exit 0); update ROADMAP + repo memory.

## Resolved decisions
- Starting balance **200 credits** per dealer; **enhance = 1**, **background = 2**.
- Image AI provider = **OpenAI** (`gpt-image-1` edit), provider-abstracted with mock fallback.
- **Background replacement default OFF**, behind an explicit toggle (protects the
  "we never fake the car" promise).
