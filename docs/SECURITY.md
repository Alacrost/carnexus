# Autonexus — Security & Multi-Tenancy Rules

This document is **binding** for all future development. Every new table, endpoint and
module MUST follow these rules.

## 1. Tenancy model

- A **dealer** is the tenant. `dealers` is the tenant root table.
- **Every tenant table carries `dealer_id`** (FK → `dealers.id`). No exceptions.
- A user can belong to multiple dealers (dealer groups) via `dealer_members`.

```
auth.users ──< dealer_members >── dealers ──< vehicles / leads / customers / ...
                (role per dealer)
```

## 2. Row Level Security (RLS) — the core rule

**RLS is enabled on every table.** Isolation is enforced by Postgres, not by
application code. Even if the frontend or an API route has a bug, a dealer can never
read or write another dealer's rows.

Standard policy pattern (used by all tenant tables):

```sql
create policy "tenant members read"
  on <table> for select
  using (dealer_id in (select public.user_dealer_ids()));
```

`user_dealer_ids()` is a `security definer` helper returning the dealer ids of the
authenticated user (`auth.uid()`), so policies never recurse into `dealer_members`.

### Rules
1. New table → `dealer_id` column + RLS enabled + policies, in the same migration.
2. Never query with the `service_role` key from user-facing paths. `service_role` is
   only for trusted server jobs (webhooks, cron) and its usage must be logged.
3. Write policies check role where needed (e.g. only owner/admin can delete vehicles).

## 3. Roles & permissions

Role is **per dealer**, stored in `dealer_members.role`.

| Capability | Owner | Admin | Sales | Agency |
|---|:-:|:-:|:-:|:-:|
| Billing & plan | ✅ | ❌ | ❌ | ❌ |
| Invite/remove members | ✅ | ✅ | ❌ | ❌ |
| Dealer settings | ✅ | ✅ | ❌ | ❌ |
| Vehicles: create/edit | ✅ | ✅ | ❌ | ❌ |
| Vehicles: view | ✅ | ✅ | ✅ | ✅ |
| Marketing module (creatives, posts, campaigns) | ✅ | ✅ | ❌ | ✅ |
| Leads & customers: full | ✅ | ✅ | ✅ | ❌ |
| Delete dealer | ✅ | ❌ | ❌ | ❌ |
| Analytics (profit/margins) | ✅ | ✅ | ❌ | ❌ |

- **`agency` role** = our in-office marketing team. Granted explicitly by the dealer
  (one-click, revocable anytime). Scope: marketing module + read-only vehicle data
  needed for ads. **Never** sees customer PII, buy prices, margins or billing.
  Every agency action is written to `audit_logs`.
- Sales users see sale prices but **never buy prices or margins** (enforced via a
  `vehicles_sales_view` or column-level checks in server code — buy_price is stripped
  server-side for sales role).
- **Platform super-admin** (us): flag in `auth.users.app_metadata.platform_admin`.
  Used only by the internal admin panel (Stage 5). Never granted to customers.

## 4. Authentication

- Supabase Auth, email + password (magic link / OAuth can be added later).
- **Signup** creates: auth user → `dealers` row → `dealer_members` row with `role='owner'`
  (single RPC/transaction — see migration `002`).
- **Invites**: Owner/Admin creates an `invitations` row (random token, 7-day expiry,
  role ≤ inviter's role). Invitee signs up / logs in and accepts the token → membership
  created. Tokens are single-use and hashed at rest.
- **Sessions**: `@supabase/ssr` cookie-based sessions, refreshed in `middleware.ts`.
  All `/dashboard`, `/inventory`, `/leads`, `/settings` routes require a session.
- **MFA**: optional TOTP for Owner accounts (recommended in onboarding).
- Password policy: Supabase minimum 8 chars; enable leaked-password protection in
  Supabase dashboard.

## 5. Input validation & API boundaries

- All user input is validated with **zod** at the server boundary (server actions /
  route handlers) — never trust the client.
- Public endpoints (Stage 2: lead intake, chat widget) get:
  - rate limiting (per IP + per dealer),
  - CAPTCHA/honeypot on forms,
  - strict schema validation and size caps.
- No secrets in client code. `NEXT_PUBLIC_*` only for the anon key (safe by design —
  RLS is the guard).

## 6. GDPR (Ireland / EU) — mandatory

- **Hosting**: Supabase project in an EU region.
- **PPS numbers, income and finance data** (Stage 4): encrypted at rest with pgcrypto
  (application-level key from Supabase Vault), never logged, never shown in lists,
  access restricted to owner/admin and audited.
- **Consent**: `customers.gdpr_consent_at` recorded before marketing contact.
- **Right to erasure / export**: customers are soft-deleted (`deleted_at`) and purged by
  a scheduled job; export endpoint returns all data for a subject.
- **Data retention**: leads and customer PII purged after a configurable period of
  inactivity (default 24 months).
- **Processor agreements**: Supabase/OpenAI DPAs referenced in the privacy policy;
  no PII sent to AI models unless strictly needed (ad generation uses vehicle data only).

## 7. Audit logging

- `audit_logs(dealer_id, user_id, action, entity, entity_id, meta, created_at)`.
- Logged: member invited/removed, role changed, vehicle deleted, price changed,
  finance data accessed, data exported, login from new device (later).
- Audit logs are **insert-only** (no update/delete policies) and readable by owner/admin.

## 8. Storage security

- Buckets: `vehicle-photos` (and later `documents`).
- Object paths are prefixed with the dealer id: `{dealer_id}/{vehicle_id}/{filename}`.
- Storage RLS policies allow access only when the first path segment matches one of the
  user's dealer ids. Documents bucket is private; photos served via signed URLs or
  public read for published listings only.

## 9. AI content integrity (marketing core)

- Photo enhancement is **quality-only**: lighting, sharpness, color, background
  cleanup. The AI must never alter the car's condition, bodywork, wheels, mileage
  display or hide damage — the published ad must match the real vehicle
  (consumer-protection requirement).
- `ad_creatives.enhancement_meta` records exactly what was changed for every image
  (audit trail).
- No customer PII is ever sent to AI providers; generation uses vehicle data and
  Brand Kit only.

## 10. General hardening checklist

- [ ] Security headers via `next.config.ts` (CSP, X-Frame-Options, etc.) before launch.
- [ ] Dependabot/`npm audit` in CI.
- [ ] Error messages never leak internals; generic messages for auth failures.
- [ ] All third-party webhook endpoints verify signatures.
- [ ] Backups: Supabase PITR enabled on paid plan before onboarding real dealers.
