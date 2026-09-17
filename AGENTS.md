<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# PRIMORDIAL RULE — Studio-grade design

The visual design is a first-class product feature, not decoration. Every screen must
feel like it lives inside a **premium, professional marketing & photo-editing studio** —
deliberately away from generic SaaS/admin-template looks. The visual is a primary reason
a dealer signs up.

Binding principles:
- **Studio aesthetic, not dashboard-template.** Cinematic dark canvas, depth, tactile
  surfaces, confident typographic hierarchy, purposeful negative space. Avoid the default
  "bootstrap admin" grid-of-cards feel.
- **Own visual language.** Prefer custom icons and our own motifs over stock icon sets
  where it matters. Craft tasteful transition/micro animations (hover, enter/exit, drag)
  — subtle, fast, meaningful; never gratuitous.
- **Performance is non-negotiable.** Animations must stay 60fps and use GPU-friendly
  props (transform/opacity). No layout thrash. Respect `prefers-reduced-motion`. Lazy-load
  heavy visuals. Great looks must never cost responsiveness.
- **Dashboard = visual.** Charts, stats and glanceable KPIs over plain tables.
- **Marketing hub = guided, not overwhelming.** The module has many features; present them
  so a new user instantly knows where to start and what each does. Organize, prioritize,
  and label each capability with a short, objective "what it does" line. Reduce choice
  paralysis.
- **Consistency.** Reuse shared studio primitives (surfaces, buttons, motion tokens) so the
  whole app feels like one coherent studio, not stitched pages.

Treat this rule as overriding default styling instincts. When in doubt, choose the more
crafted, studio-like option that still ships and performs.

# PRIMORDIAL RULE — AI generation is a conversation, never one-shot

Every AI-powered feature must follow the **same methodology as our spec kit**: plan first,
the AI asks and clears up doubts and suggests, then — only after the user confirms —
executes. This applies to **anything** the AI produces: campaign images, ad copy, vehicle
descriptions, terms & conditions, social posts, promotion ideas — whatever it is.

Binding flow for any AI feature (never skip straight to a final artifact):
1. **Plan / gather.** Understand the intent. Pull known context automatically (Brand Kit,
   Business Setup, vehicle/promotion data) so the user never retypes what we already know.
2. **Clarify.** If anything material is missing or ambiguous, the AI asks concise
   questions or offers sensible defaults — it does not guess silently.
3. **Suggest.** Propose options/angles/drafts for the user to pick from, not a single
   take-it-or-leave-it output. Make suggestions glanceable and selectable.
4. **Confirm & refine.** The user edits, regenerates, or accepts. Everything the AI writes
   is editable before it's saved or published.
5. **Execute.** Produce the final artifact only once the user is happy.

Rules that make this real:
- **Never auto-publish AI output.** Draft → review → user action. Default to `draft`.
- **Always show a "why/what it used" trail** where it helps trust (which facts, which
  channel, AI vs template engine).
- **Never invent facts** (features, guarantees, condition claims) beyond the provided data
  — consistent with docs/SECURITY.md §9.
- Bake this into every spec: `/specify` and `/plan` must describe the clarify→suggest→
  confirm→execute interaction, not just the final generator.

Treat this as overriding any instinct to build a single "Generate" button that dumps a
finished result. If in doubt, make the AI ask and suggest before it commits.

