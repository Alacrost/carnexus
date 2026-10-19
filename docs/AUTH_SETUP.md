# Supabase Auth setup

The app uses email/password Auth and cookie-based sessions. Public landing pages,
vehicle links, invitations and email confirmation endpoints remain public.
App pages require a verified Supabase user, and dealership pages additionally use
`requireSession()` to load an active membership. Existing database policies remain
the authority for access to dealership data.

## Project configuration

- Use the existing project's URL and a publishable key (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`).
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` remains supported when the publishable key is empty.
- Enable the Email provider in Supabase Auth. Keep email confirmation enabled.
- Set Auth **Site URL** to the trusted app origin for the intended environment.
- Set server-only `AUTH_SITE_URL` to the same trusted origin (`http://localhost:3000`
  for local staging; HTTPS in production). Signup explicitly returns to
  `/auth/callback`; allow that exact URL in Auth **Redirect URLs**. With the default
  confirmation template, open the email in the same browser used to register so
  the PKCE verifier cookie is available. No custom SMTP/template is required for
  this flow. Supabase's default email service has recipient and rate restrictions.
- If custom email templates are available, the alternative **Confirm signup** link is:
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`.
  This verifies the email and establishes a cookie session before opening the dashboard.
- `/auth/callback` also supports the PKCE `code` exchange when an Auth flow is
  configured to return there. Only allow trusted app callback URLs in Supabase.

These dashboard settings are prerequisites; adding the routes does not change
the hosted project's settings. Accounts awaiting confirmation create their
dealership through onboarding after confirmation. Existing login, signup and
logout screens are reused.

On 14 October 2026, local staging uses AutoNexus Test (`inxplclbpofmqufdcskd`).
The default email template is retained. Signup now uses an explicitly configured
callback instead of returning the confirmation code to the home page. Actual
email delivery and personal onboarding still require the user's signup.

## Verification

Run `node tests/auth-security.mjs`, `npm run typecheck`, and lint the changed Auth files.
The local Auth tests use mocked Supabase responses and never create remote users.

In a configured staging environment, verify signup, confirmation, onboarding,
login, logout, expired sessions, and direct unauthenticated access to protected
routes. A logged-out request must reach login with its original path and query;
refreshed session cookies must survive redirects. External login return URLs
must fall back to the dashboard.

`NEXT_PUBLIC_DEMO_MODE=true` bypasses Auth only during local development. It is
ignored in production. Preserve the current demo configuration; testing real
local Auth requires a separately authorized change or isolated test environment.
