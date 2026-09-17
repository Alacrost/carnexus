# Autonexus

**AI Sales & Marketing Assistant for car dealers in Ireland.**
Multi-tenant SaaS — Next.js (App Router) + Supabase (Auth, Postgres + RLS, Storage).

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
2. Run the migrations in order in the Supabase SQL editor (or `supabase db push`):
   - `supabase/migrations/001_init.sql` — schema + RLS
   - `supabase/migrations/002_rpc.sql` — signup/invite RPCs
   - `supabase/migrations/003_storage.sql` — photo storage policies
3. Copy `.env.example` to `.env.local` and fill in your project keys.
4. Install & run:

```bash
npm install
npm run dev
```

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
