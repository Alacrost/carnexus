---
description: "Spec-driven step 2: turn an approved spec into a technical plan that respects the repo conventions. Writes into the spec's 'Technical plan' section. Writes NO feature code."
name: "plan"
argument-hint: "Path or name of the spec in docs/specs/ to plan"
agent: "agent"
---

You are writing a **technical plan only** — no feature code yet.

Spec to plan: ${input:spec:Which spec? (e.g. docs/specs/my-feature.md)}

## Steps
1. Read the spec, then the binding context: [AGENTS.md](../../AGENTS.md), [docs/DATA_MODEL.md](../../docs/DATA_MODEL.md), [docs/SECURITY.md](../../docs/SECURITY.md), and repo memory `/memories/repo/autonexus.md`. Look at the closest existing feature for patterns before inventing anything.
2. Apply **ponytail**: laziest solution that works, reuse before rewrite, no new dependencies (charts stay pure SVG/CSS; icons come from `src/components/icons.tsx`).
3. Write the plan into the spec's **Technical plan** section, covering only what applies:
   - **Migration**: new SQL file `supabase/migrations/NNN_*.sql` — tables/columns, `dealer_id` + RLS policies in the SAME migration, using `public.user_dealer_ids()` / `public.user_role_in(dealer_id)`.
   - **Server actions**: file, `"use server"`, zod validation, `requireSession()`, capability guard from `src/lib/types.ts` (`can`), demo-mode no-op, `revalidatePath`.
   - **Routes & screens**: where under `src/app/(app)/...`, server vs client split, Next 16 gotchas (`await params`, async `cookies()`, useActionState).
   - **Studio UX**: which primitives to reuse (studio-surface, studio-input, text-gradient, custom icons, animate-rise) — no new card styles.
   - **AI wiring** (if relevant): what context is passed, never customer PII.
   - **Demo mode**: demo data in `src/lib/demo.ts`.

## Rules
- Do NOT write the migration/actions/components or run the build.
- Prefer the smallest change set. Call out anything that should be deferred to the ROADMAP backlog.
- End by listing the files that will be created or edited.
