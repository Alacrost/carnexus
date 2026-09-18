# Autonexus

**AI Sales & Marketing Assistant for car dealers in Ireland.**
Multi-tenant SaaS — Next.js (App Router) + Supabase (Auth, Postgres + RLS, Storage).

**Current direction:** Sales CRM is the primary product, with separately sold Marketing support
(DoneDeal ads + promotions/terms) and Dealer Websites (selectable themes + brand customisation).
See [delivery plan and stage log](docs/DELIVERY.md) for shipped scope, remaining work and Meta Ads lead intake plans.

> More cars sold, less time wasted, fewer leads lost.

## Documentation

| Doc | Purpose |
|---|---|
| [docs/VISION.md](docs/VISION.md) | Product vision, all 11 modules, pricing |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Staged build plan (Stage 0 → 5) |
| [docs/SECURITY.md](docs/SECURITY.md) | **Binding** security & multi-tenancy rules |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Database schema + ERD |
| [docs/LANDING_PAGE.md](docs/LANDING_PAGE.md) | Sales page copy & playbook |

## Setup

1. Create a Supabase project (**EU region** — GDPR).
2. Apply **all** versioned files in `supabase/migrations/` in numeric order to a staging
   project (or use `supabase db push` after linking the intended project). Do not replay
   already applied files or run migrations on production without a backup and staging check.
   Stage 1 adds `037_crm_foundation.sql`, `038_rpc_authorization.sql` and
   `039_public_data_boundaries.sql`.
   Stage 2 adds `040_commercial_workflow.sql` and `041_vehicle_details_payables.sql`.
   Configure company details under `/business/document-settings` before issuing documents.
   Review the staging prerequisites and known workflow limits in `docs/DELIVERY.md`.
3. Copy `.env.example` to `.env.local` and fill in your project keys.
4. Install & run:

```bash
npm install
npm run dev
```

Use Node.js 24 (the test command uses native TypeScript stripping). `npm test` runs the
migrations and permission/workflow regression checks in a disposable PGlite PostgreSQL
database; it needs no Supabase credentials and does not touch remote data. PGlite is a
development-only dependency because the Windows environment has no local Postgres/Docker.
It does not replace staging tests of Supabase Auth, Data API grants or Storage.

Run `npm run typecheck`, `npm run lint` and `npm run build` before release. Build downloads
Google Fonts and needs network access. Existing lint findings and unresolved audit P0s
are tracked in `docs/DELIVERY.md`; a build alone does not certify production readiness.

For a local UI preview set `NEXT_PUBLIC_DEMO_MODE=true` in `.env.local`; never treat preview
success as a persisted operation. Set it back to false when connecting staging. No service-role
key is needed by the app's user-facing paths.

## Auth model (Stage 0)

- **Signup** (`/signup`) creates the user, the dealership and an `owner` membership.
- **Invites**: owner/admin calls the `create_invitation` RPC → share
  `/invite/{token}` → invitee accepts → `admin`/`sales` membership.
- Every table is protected by Row Level Security — a dealer can never see
  another dealer's data, even if application code has bugs.
- Roles: `owner` (everything + billing) · `admin` (manage stock/team) ·
  `sales` (leads & customers, no buy prices).

## Project structure

```
docs/                  Product & security documentation
supabase/migrations/   SQL schema, RLS policies, RPCs
src/
  app/
    page.tsx           Public landing page
    (auth)/            login, signup, onboarding, invite/[token]
    (app)/             Protected: dashboard, inventory, leads, settings
  lib/
    auth.ts            requireSession() — session + membership loader
    types.ts           Roles, capability matrix
    supabase/          Browser/server clients + session middleware
  proxy.ts             Route protection + session refresh
```
