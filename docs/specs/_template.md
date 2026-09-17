# Spec — <Feature name>

> Status: draft · Owner: <you> · Stage: <Roadmap stage>

## Problem
<The concrete pain for an Irish dealer. One short paragraph. Why now.>

## Goal
<The outcome, in one sentence. What "done" looks like for the business.>

## In scope
- <bullet>

## Out of scope (later)
- <bullet — push to docs/ROADMAP.md backlog if it's a real idea>

## Data & security
- New/changed tables and columns:
- `dealer_id` + RLS policies (owner/admin/sales/agency)? <yes/how>
- PII involved? <no / which — see docs/SECURITY.md>
- Demo mode behaviour: <no-op / demo data>

## UX & studio design
- Where it lives (route / nav / marketing hub group):
- Studio primitives to reuse (studio-surface, studio-input, text-gradient, custom icons):
- One objective "what it does" line for the user:

## AI interaction (required if the feature generates anything with AI)
- Follows the clarify→suggest→confirm→execute flow (AGENTS.md AI-generation rule):
- Context auto-pulled (Brand Kit / Business Setup / vehicle / promotion data):
- What the AI asks / suggests before producing (options, angles, drafts):
- How the user reviews/edits before save; default status (draft, never auto-publish):

## Acceptance criteria
- [ ] <verifiable outcome>
- [ ] Build passes (`npm run build`).

## Technical plan
<Filled by /plan>

## Tasks
<Filled by /tasks>

## Open questions
- <question>
