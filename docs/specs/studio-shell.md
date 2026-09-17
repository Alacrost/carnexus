# Spec — Studio Shell (reusable editor chrome)

> Status: **shipped** · Owner: product/owner · Stage: 1 (foundation for Marketing Studio v2)
> Parent plan: [marketing-studio-v2.md](./marketing-studio-v2.md) · Module **M1**

## Problem
The Cover Photo Studio's full-bleed "editing app" chrome (toolbar with the title inside ·
left tool rail · center workspace · right properties panel) is the design language we want
for **every** Marketing Studio tool. Right now that chrome is hard-coded inside
`overlay-studio.tsx`. If each new tool copy-pastes it, they will drift and we'll rewrite
markup repeatedly.

## Goal
Extract the chrome into **one reusable `StudioShell` client component** so every marketing
tool gets the identical studio look by composing it — no copy-paste, no visual drift.

## In scope
- A `StudioShell` component that renders exactly today's Cover Photo Studio layout.
- Refactor `overlay-studio.tsx` to consume `StudioShell` with **no visual change**
  (proves the shell and pays the extraction cost once).
- Props/slots general enough for the other studios (Description, Photo, Social).

## Out of scope (later)
- Building the other studios themselves (M4–M6) — they consume this shell in their specs.
- Any data, migration, or AI logic.

## Data & security
- New/changed tables and columns: **none**.
- `dealer_id` + RLS: n/a (pure UI).
- PII involved: no.
- Demo mode behaviour: no-op (pure presentational component).

## UX & studio design
- Where it lives: `src/components/studio-shell.tsx` (shared, like `icons.tsx`).
- Reuses the exact classes already in `overlay-studio.tsx`:
  full-bleed `flex min-h-[calc(100vh-1px)] flex-col border-y border-white/10 bg-[#0b0f17]`,
  toolbar (`border-b bg-white/[0.02] px-4 py-3 lg:px-6`), workspace grid
  `grid flex-1 grid-cols-1 lg:grid-cols-[76px_1fr_360px]`, rail, and the properties aside.
- One objective line for the user: n/a (it's infrastructure, not a tool).

### Proposed API (for the plan step to finalize)
```ts
type StudioTool = { key: string; label: string; icon: (p:{size?:number})=>JSX.Element };

interface StudioShellProps {
  title: string;
  subtitle?: string;            // shown in the toolbar under the title
  backHref: string;            // back-arrow link target (e.g. "/marketing")
  icon: (p:{size?:number})=>JSX.Element;   // toolbar icon-tile glyph
  tools: StudioTool[];
  activeTool: string;
  onToolChange: (key: string) => void;
  rightActions?: React.ReactNode;   // e.g. credits pill + Export button
  properties: React.ReactNode;       // right panel content for the active tool
  children: React.ReactNode;         // center workspace (canvas / form / grid)
}
```

## AI interaction
- n/a — this feature generates nothing.

## Acceptance criteria
- [x] `StudioShell` renders the same toolbar (back · icon · title · subtitle · right
      actions), left rail, center workspace and right properties as today.
- [x] `overlay-studio.tsx` uses `StudioShell`; the Cover Photo Studio looks unchanged.
- [x] No new dependencies; icons come from `src/components/icons.tsx`.
- [x] Build passes (`npm run build`).

## Technical plan
Done. `src/components/studio-shell.tsx` exports `StudioShell` (full-bleed container +
toolbar with title inside + left tool rail + `grid lg:grid-cols-[76px_1fr_360px]`) and a
`StudioProperties` helper for the shared right-panel chrome. Tools pass their center
workspace and a `<StudioProperties>` panel as the two grid children after the rail.
`overlay-studio.tsx` was refactored onto it with no visual change (verified in browser).

## Tasks
- [x] Create `src/components/studio-shell.tsx` (`StudioShell` + `StudioProperties`).
- [x] Refactor `src/app/(app)/marketing/photos/overlay-studio.tsx` to consume it.
- [x] Remove now-unused `Link`/`ArrowLeftIcon` imports from the overlay.
- [x] Run `npm run build` and verify the studio looks unchanged.

## Open questions
- Should the tool rail stay fixed at 76px, or become a prop for tools that want a wider
  rail with longer labels?
- Do any tools need a **second** right panel width (e.g. 420px) — make `360px` a prop?
