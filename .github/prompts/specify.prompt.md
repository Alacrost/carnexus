---
description: "Spec-driven step 1: turn a feature idea into a short spec in docs/specs/. Reads AGENTS.md, docs/ and repo memory. Writes NO code."
name: "specify"
argument-hint: "Describe the feature idea to specify"
agent: "agent"
---

You are writing a **specification only** — no implementation, no code, no migrations.

Feature idea: ${input:feature:What do you want to build?}

## Steps
1. Read the project context first: [AGENTS.md](../../AGENTS.md), [docs/VISION.md](../../docs/VISION.md), [docs/ROADMAP.md](../../docs/ROADMAP.md), [docs/DATA_MODEL.md](../../docs/DATA_MODEL.md), [docs/SECURITY.md](../../docs/SECURITY.md), and the repo memory at `/memories/repo/autonexus.md`.
2. Apply the **ponytail** skill: question whether the feature needs to exist, keep scope minimal, reuse what's already there. Push nice-to-haves to the ROADMAP backlog instead of the spec.
3. Copy [docs/specs/_template.md](../../docs/specs/_template.md) into a new file `docs/specs/<kebab-slug>.md` (slug from the feature name) and fill every section EXCEPT "Technical plan" and "Tasks" (leave those placeholders for later steps).
4. Be concrete about **Data & security**: name tables/columns, confirm `dealer_id` + RLS, flag any PII, and state demo-mode behaviour. Honour the studio design rule in AGENTS.md for the UX section.

## Rules
- Do NOT create migrations, actions, components, or run the build.
- Keep it short and objective — a dealer-value spec, not a essay.
- End by printing the path to the new spec and 2-3 open questions worth confirming before planning.
