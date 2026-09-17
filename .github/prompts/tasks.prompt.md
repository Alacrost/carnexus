---
description: "Spec-driven step 3: break an approved plan into a small, ordered, verifiable task checklist. Writes into the spec's 'Tasks' section. Writes NO feature code."
name: "tasks"
argument-hint: "Path or name of the spec in docs/specs/ to break into tasks"
agent: "agent"
---

You are producing a **task checklist only** — no code.

Spec to break down: ${input:spec:Which spec? (e.g. docs/specs/my-feature.md)}

## Steps
1. Read the spec's Problem, Data & security, and Technical plan sections.
2. Write an ordered checklist into the spec's **Tasks** section. Each task must be:
   - Small enough to finish and verify in one pass.
   - Ordered so the app stays buildable (schema/types → actions → screens → wiring → memory/roadmap).
   - Written as `- [ ] <action>` with the target file in backticks.
3. Sequence the migration first, then server actions, then routes/screens, then AI/demo wiring.
4. Add these as the final tasks every time:
   - `- [ ] Run \`npm run build\` and fix any errors.`
   - `- [ ] Update \`/memories/repo/autonexus.md\` and \`docs/ROADMAP.md\`.`
   - `- [ ] Note the migration needs \`npx supabase db push\` (user runs it).`

## Rules
- Keep tasks lazy and minimal (ponytail) — no gold-plating tasks.
- Do NOT implement anything or run the build.
