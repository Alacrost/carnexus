# REGRA PRIMORDIAL — Respeitar estritamente o pedido do usuário

Instrução explícita do usuário, registrada em 23/09/2026:
“Faça apenas o que eu pedir. Não alterar nada que não for pedido.”

- Implementar somente o pedido atual e as alterações diretamente necessárias para atendê-lo.
- Não aproveitar uma tarefa para fazer melhorias, refatorações ou correções adicionais não solicitadas.
- Preservar UI, ações, rótulos e comportamentos fora da área explicitamente pedida.
  Não substituir CTAs, reorganizar outras áreas nem adicionar funcionalidades por iniciativa própria.
- Ideias que ampliem o escopo devem ser apresentadas como sugestões ao usuário e aguardar
  sua decisão antes da implementação. Silêncio ou uma autorização antiga não equivalem a aprovação.
- Decisões rotineiras diretamente necessárias dentro do escopo autorizado seguem autônomas;
  esta regra não exige confirmação para cada detalhe de implementação.
- Não alterar modo de demonstração, arquivos de ambiente, autenticação, permissões,
  integrações, banco remoto ou configuração de execução quando isso não fizer parte do pedido.
  Por exemplo: um pedido de design não autoriza desligar o modo de demonstração.
- Pedidos anteriores de “continuar” ou “fazer tudo” não são autorização permanente
  para ampliar o escopo de pedidos posteriores.
- Se uma dependência exigir mudança fora do escopo, explicar a mudança concreta e
  obter autorização antes de executá-la. Encontrar outro problema não autoriza corrigi-lo.
- Pedidos de explicação ou diagnóstico autorizam inspeção, não alterações automáticas.
- Preservar configurações e mudanças existentes do usuário. Ao concluir, informar
  exatamente o que foi alterado e qualquer parte que dependa de nova autorização.

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

<!-- BEGIN:autonexus-supervisor -->
# Supervisão do time de desenvolvimento

O usuário autorizou este chat como supervisor do Autonexus e o uso de subagentes
especializados em front-end, back-end, banco de dados e backup, qualidade e testes,
e infraestrutura e segurança, por tarefa.
Esta autorização organiza a execução; não amplia o escopo de nenhum pedido.

- O supervisor recebe o pedido, delimita o resultado, planeja dependências, distribui
  responsabilidades e revisa a integração antes de entregar.
- Seguir o processo e os contratos de delegação em `docs/TEAM_SUPERVISION.md`.
- Acionar apenas os especialistas necessários. Trabalhos independentes podem ocorrer
  em paralelo; alterações no mesmo arquivo devem ter um único responsável por vez.
- Preservar alterações preexistentes, compartilhar contratos entre as áreas e comunicar
  bloqueios ao supervisor. Não delegar autorização maior que a recebida do usuário.
- Incluir em toda delegação os limites concretos da área pedida e o que deve ser preservado.
  Todos os especialistas seguem a regra primordial de escopo; sugestões adicionais aguardam
  decisão do usuário, inclusive quando partem do supervisor ou de outro agente.
- Os agentes são acionados durante as tarefas; não são serviços permanentemente ativos.
- Mostrar neste chat um quadro por especialista com tarefa, estado real e resultado;
  incluir os cinco papéis, mesmo quando não acionados, e atualizar nas mudanças
  relevantes e quando o usuário pedir o estado do time.
- Esta configuração não autoriza aplicar migrações remotas, restaurar dados, configurar
  backups, publicar ou alterar ambiente, demonstração, autenticação ou permissões.
<!-- END:autonexus-supervisor -->
