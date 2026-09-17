---
description: "Spec-driven step 4: implement an approved spec's task checklist, one task at a time, following the repo conventions. Checks off tasks and verifies the build."
name: "implement"
argument-hint: "Path or name of the spec in docs/specs/ to implement"
agent: "agent"
---

Implement the tasks in this spec, in order: ${input:spec:Which spec? (e.g. docs/specs/my-feature.md)}

## Steps
1. Read the spec (all sections) plus [AGENTS.md](../../AGENTS.md), [docs/SECURITY.md](../../docs/SECURITY.md) and repo memory `/memories/repo/autonexus.md`.
2. Work through the **Tasks** checklist top to bottom. After each task, tick its box (`- [x]`) in the spec.
3. Follow the binding conventions:
   - Every tenant table: `dealer_id` + RLS + policies in the SAME migration.
   - Server actions: zod validation, `requireSession()`, capability guard (`can` in `src/lib/types.ts`), demo-mode no-op, `revalidatePath`.
   - Reuse studio primitives and custom icons — no new card styles, no new dependencies.
   - UI copy stays in **English**. Apply **ponytail** (smallest change that works).
4. Run `npm run build` after meaningful steps and before finishing; fix any errors. Do NOT start a second dev server (one already runs on port 3000).
5. When done: update `/memories/repo/autonexus.md` and `docs/ROADMAP.md`, and tell the user to run `npx supabase db push` if a migration was added (the CLI is interactive — they run it).

## Rules
- If a task is ambiguous or reveals a design gap, stop and ask before guessing.
- Do not expand scope beyond the spec. New ideas go to the ROADMAP backlog.
- Report which tasks are done and any that were deferred.
