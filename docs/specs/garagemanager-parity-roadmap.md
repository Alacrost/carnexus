# Roadmap — trazer a lógica do GarageManager para o Autonexus

> Instruções + plano faseado para replicar/adaptar o CRM do dealer (ver
> `docs/research/garagemanager-analysis.md`) dentro do Autonexus, **respeitando** o nosso
> stack (Next.js 16 + Supabase RLS), o design studio (AGENTS.md) e a regra "AI é conversa".
> Reaproveitar o que já existe; não reescrever à toa (ponytail).

## 0. Princípios de tradução (GarageManager → Autonexus)

| GarageManager | Autonexus (nosso nome) | Estado atual |
|---|---|---|
| Contact (cliente+fornecedor) | `customers` (party: individual/business) | ✅ existe, já com campos CRM (028) |
| Car / `CAR-{id}` | `vehicles` (+ `registration`) | ✅ existe + busca/filtros (inventory) |
| Deal / Lead (CRM) | `deals` (guarda‑chuva) | ⚠️ parcial (deals+deal_orders+payments) — falta pipeline/agreement/docs |
| PO — Purchase Order | `deal_orders.kind='purchase'` + `vehicle_acquisitions` | ⚠️ colunas existem, sem UI |
| SO — Sales Order / Invoice | `deal_orders.kind='sale'` + documento Invoice | ⚠️ venda existe, falta invoice/nº |
| Payment / Deposit | `payments` | ✅ existe (deposit/balance…) |
| Charge (custo no carro) | `vehicle_costs` | ✅ existe |
| Nominal code + Ledger | (novo) `nominal_codes` + `ledger_entries` | ❌ não existe |
| Stock de peças/serviços | (novo) `parts` | ❌ não existe (workshop futuro) |
| Service Agreement gate | (novo) aceitação de termos | ❌ não existe |

Regras transversais:
- **RLS por `dealer_id`** em toda a tabela nova, na MESMA migração.
- Financeiro sensível (custo/margem/VAT/lucro) → `owner/admin/accountant`. Dados de cliente →
  `owner/admin/sales(+accountant read)`. `agency` nunca vê PII nem financeiro.
- **Nunca auto‑publicar** artefactos de IA; tudo `draft` → rever → confirmar.
- Numeração determinística por dealer (já temos `YYYYMMDD-NNN`); Invoice/Agreement seguem o mesmo padrão.

---

## Arquitetura de produtos — 3 módulos vendidos em separado, mas integrados

O SaaS vende **três produtos independentes** que partilham a mesma base (dealer, contacts,
vehicles) e se integram, mas um cliente pode assinar **só um, dois ou os três**:

| Produto | O que é | Módulos internos |
|---|---|---|
| **Sales CRM** | Gestão comercial de stock e negócios (o foco do GarageManager) | Dashboard, Inventory, Leads, Deals (pipeline/ficha), Customers, PO/SO/Invoice, Contabilidade, Relatórios |
| **Marketing Studio** | Produto de marketing/IA (já construído) — vendido à parte | Cover Photo/Background Studio, DoneDeal Description, Social, Campaigns, Promotions, Brand Kit, Business Setup, Ads |
| **Dealer Website** (futuro) | Template de site para o dealer que **puxa os carros direto da API do DoneDeal** | Site público + sync DoneDeal + páginas de stock/veículo/contacto/promo |

**Entitlements (quem tem o quê):**
- `dealers += modules jsonb` (ou tabela `dealer_modules`) com flags `sales`, `marketing`, `website`.
- Helper `can.useModule(dealer, 'sales'|'marketing'|'website')` — separa **navegação, rotas e ações**.
- **Nav separada por produto**: a sidebar mostra o grupo "Sales" só se `sales` estiver ativo, e
  "Marketing Studio" só se `marketing` estiver ativo. Sem módulo → rota devolve upsell/403 suave.
- **Billing** por módulo (Settings → Billing). Demo: todos ativos.
- Papéis continuam válidos: `agency` faz sentido sobretudo no Marketing; `sales/accountant` no CRM.

> **Ação já:** documentado aqui. Implementação da separação = **Fase de Entitlements** (pode entrar
> logo a seguir ao F1, para a nav já refletir os produtos). O terceiro produto (Website DoneDeal) é
> um projeto próprio, planeado depois, reutilizando `vehicles` + sync por placa/DoneDeal ad id.

---

## Direção de design — "CRM comercial", não "site com campos"

Objetivo: manter o visual moderno/studio, mas com **densidade e disposição de um CRM comercial**
(mais informação por ecrã, tabelas de trabalho, menos "formulário solto de página web").

Princípios (aplicar a partir do F1 e ir propagando):
- **Densidade da informação**: tipografia mais compacta (13–14px base em tabelas), linhas de tabela
  mais baixas, `tabular-nums` em dinheiro, menos padding vertical, mais colunas úteis.
- **Layout de trabalho**: cabeçalho fino com ações à direita + **barra de resumo (KPIs/saldos)**;
  corpo em **grelha de painéis** (ex.: ficha do Deal = coluna principal + coluna lateral de sumário),
  não um cartão central estreito `max-w-3xl`.
- **Listas = tabelas densas** com filtros no topo (já feito no Inventory: busca + chips de estado +
  contadores) — replicar o padrão em Deals/PO/SO/Contacts.
- **Pipeline = board Kanban** compacto (colunas por etapa, contagem + soma por coluna, cartões finos).
- **Fichas = documento/CRM**: blocos rotulados (Contact · Vehicle · Paperwork · Payments · Money ·
  Event Log), com "chips" de estado e ações inline (edit/print/email) — inspirado no GarageManager,
  mas com as nossas primitivas studio (`.studio-surface`, gradientes, ícones próprios).
- Manter performance (60fps, GPU transform/opacity) e `prefers-reduced-motion`.
- Reutilizar primitivas partilhadas para consistência (não inventar novos cartões por página).

> Regra prática: quando uma página parecer "um site com campos", converter para **tabela densa +
> painel de resumo + ações inline**. Ir aplicando incrementalmente por módulo.

---

## FASE 1 — Deal como objeto central (pipeline + ficha) 🎯

Objetivo: o `deal` deixa de ser só "uma venda" e passa a ser o **guarda‑chuva** com etapas,
paperwork, depósitos, viatura, e sumário de dinheiro — como o Deal 1378.

- **Migração**: `deals` += `stage` (enum: `initial_contact|vehicle_interest|test_drive|proposal|negotiation|closing|after_sales|cancelled`),
  `assigned_to` (=vendedor, já temos `salesperson_id`), `retail_price`, `siv_total` (trade‑in),
  `cost_to_change` (gerado), `agreement_printed_at`, `quote_printed_at`, `terms`.
- **`deal_events`** (novo): audit log imutável — `deal_id, dealer_id, kind, detail jsonb, created_by, created_at`.
  Regista: depósito, agreement impresso, etapa mudou, SO criado, doc recebido.
- **UI**: página `/business/deals/[id]` reformulada como **ficha do Deal** (estilo documento):
  blocos Contact · Steps (timeline) · Vehicle · Deal Paperwork · Payments · Money Details
  (Retail / SIV / Cost to Change / Balance) · Terms · Event Log.
- **Pipeline board** `/business/deals`: colunas por `stage` (Kanban) + filtro por vendedor
  (espelha o CRM: Anyone/vendedores). Manter também a vista de lista (open‑only) já feita.
- Reaproveitar: `createDeal`, `payments`, `deal_orders`.

**Aceitação**: criar deal a partir do carro → aparece no board na etapa certa; mudar etapa regista
evento; ficha mostra math correta (Cost to Change = Retail − SIV; Balance = ToChange − depósitos).

---

## FASE 2 — SO / Invoice + Agreement (documentos) 📄

Objetivo: gerar a **fatura (SO)** e o **agreement** a partir do Deal, com numeração e impressão.

- **Migração** `deal_documents` (novo): `id, dealer_id, deal_id, kind (agreement|invoice|quote|purchase_receipt|credit_note),
  number (ex.: INV YYMMDDNN), status (draft|printed|paid|void), snapshot jsonb (imutável), pdf_path, printed_at, created_by`.
- **Invoice (SO)**: número `YYMMDD` + sequência (como 26091202). Campos: Invoice To/Shipping To,
  linhas (stock code `CAR-{id}`, nominal, VAT scheme MS/standard, net/vat/gross), **VAT Liability**,
  Sub Total / Total, depósitos aplicados, Balance Due. Reusa `finance.ts` (`vatOn`, margin scheme).
- **Agreement**: documento pré‑fatura que "congela" Customer Price, SIV Total, Cost to Change
  (como o event "Agreement Printed"). Editável antes de imprimir; imprimir grava snapshot + evento.
- **UI**: no Deal → botões "Print Agreement", "Create/Print Invoice", "Email Invoice".
  Render HTML + `@media print` (PDF depois). Letterhead/logo do dealer + termos de garantia.
- Estados do SO: `draft → waiting_payment → fully_paid` (deriva dos `payments`).

**Aceitação**: fechar um deal gera Invoice numerado com VAT correto (marginal e standard),
depósitos abatidos, Balance Due 0 quando pago; Agreement imprime snapshot e regista evento.

---

## FASE 3 — Compras (PO) + aquisição de stock 🛒

Objetivo: comprar carros/serviços a um **party fornecedor** via **PO** (como PO1880), alimentando o stock.

- Reusar `deal_orders.kind='purchase'` (colunas trade‑in já existem) **ou** tabela dedicada
  `purchase_orders` + `po_lines` se quiseres PO independente de deal (compras a leilão/trade sem cliente).
- Campos PO: `po_no`, `vendor_id` (customer/party), `inv_ref` (fatura do fornecedor), `status`
  (`to_be_paid → approved → paid`), linhas (stock code `CAR-{id}`, nominal, descrição multi‑linha,
  net/vat/gross), VAT type, `make_payment` (vendor payment), credit note.
- **PO approval process** (como no changelog deles): PO tem de ser **aprovado antes de pagar**
  (guard `owner/admin`); regista aprovador+data.
- Ligar ao carro: a ficha do carro mostra **Buying Info** (PO, Bought From, Bought By, Total Costs,
  Bought/Collected date, VAT Type) — já temos o `vehicle_deals`/`vehicle_costs` para o lado do custo.
- Fluxo "Buy Car" a partir do contacto fornecedor → cria PO + cria `vehicle` (CAR‑{id}).

**Aceitação**: criar PO a partir de um fornecedor cria o carro em stock; PO fica "to be paid";
aprovar → pagar (vendor payment) baixa o saldo; custo aparece no `/business` do carro.

---

## FASE 4 — Trade‑in / Part‑exchange + duas stocks 🔁

Objetivo: aceitar viatura de troca dentro do Deal (SIV) e separar **Main Stock** vs **Trade Stock**.

- **Migração**: `vehicles += stock_class (main|trade)`. Deal `deal_orders` de compra com
  `is_trade_in=true` (colunas `settlement_amount`, `net_equity`, `condition_notes`, `keys_count`,
  `has_logbook`, `service_history` já existem em 026).
- Math do Deal: **SIV** entra como abatimento; **Cost to Change = Retail − SIV**; se houver
  settlement (finance por liquidar), `net_equity = allowance − settlement`.
- Avaliação da troca (appraisal) + mover a viatura de troca para **Trade Stock** (novo carro CAR‑{id}).
- Fecha o item pendente do inventário (o "Database Summary: Main 304 / Trade 20" da referência).

**Aceitação**: adicionar trade‑in ao deal reduz o Cost to Change; a viatura de troca aparece em
Trade Stock; separador Main/Trade no inventário com contagens.

---

## FASE 5 — Required Documents (KYC) + Warranty + Supplementary Sales ✅

Objetivo: compliance e receitas extra por deal.

- **`deal_required_docs`** (novo): `deal_id, doc_type (dl_front|dl_back|utility_bill|trade_vrc|…),
  received bool, file_path`. Checklist na ficha do Deal (como o do Deal 1378).
- **Warranty** por deal: `deal_warranties` (`deal_id, plan, months, price, terms`). Entra no Agreement/Invoice.
- **Supplementary Sales**: add‑ons (garantia, GAP, service plan) como linhas/SOs extra no deal, com Profit.
  Alinhar com a regra "AI é conversa" caso sugira add‑ons.

**Aceitação**: não deixa "Deal Finished" sem docs obrigatórios recebidos (aviso, não bloqueio duro);
warranty e add‑ons aparecem no Invoice e no lucro do deal.

---

## FASE 6 — Contabilidade (nominal codes + ledger + relatórios) 📊

Objetivo: base contabilística e relatórios de gestão (o que o `accountant/` deles faz).

- **Migração**: `nominal_codes` (`code, name, type`), `ledger_entries` (`dealer_id, date, nominal_code,
  debit, credit, source_type (po|so|payment|deal), source_id, memo`). Postar automaticamente ao
  criar Invoice/PO/Payment (double‑entry simples).
- **Relatórios** (server + CSV + gráficos studio):
  - **Detailed Sales** (por Sold On) · **Months Cars** (Sold/Bought/Paid) · **Charges Report**
  - **Aged Debtors** (SOs por receber) · **Aged Creditors** (POs por pagar)
  - **Money In / Money Out** · **Vehicle Movement** · **P&L** / Trial Balance (fase avançada)
  - Atalhos: **To Be Invoiced**, **To Be PO'ed**, **SOs Waiting Payment**, **POs To Pay**
- **VAT/ROS**: manter `vatOn` (MS/standard). Exportação ROS‑XML fica para o fim (opcional).

**Aceitação**: cada Invoice/PO/pagamento gera lançamentos; Aged Debtors/Creditors batem com os saldos;
Detailed Sales exporta CSV; KPIs no `/business`.

---

## FASE 7 — Service Agreement (aceitação de termos) 📝

Objetivo: replicar o gate de aceitação que vimos no login deles — para o **onboarding** do dealer
no Autonexus (aceitar os nossos Terms antes de usar).

- **Migração**: `dealers += terms_accepted_at, terms_version` (ou `dealer_agreements` para histórico:
  `dealer_id, version, accepted_by, accepted_at, ip`).
- **UI**: página `/onboarding/agreement` (ou 1º login) com os **nossos** Termos (adaptar a estrutura
  A. General 1–15 + B. Additional 1–6 do GarageManager, mas com o nome/legais do Autonexus e a nossa
  Privacy). Botões **"I Agree"** (grava aceitação + versão) e **"I Don't Agree"** (logout).
- **Gate suave** (não hard‑redirect infinito): se `terms_accepted_at` for null e a versão mudou,
  mostrar o ecrã; permitir ler mas exigir aceitar para ações de escrita. Reusar o design studio.
- Guardar o texto dos termos versionado (ex.: `docs/legal/terms-v1.md`) para renderizar.

**Aceitação**: novo dealer vê os termos, aceita → fica registado (quem/quando/versão); recusar → logout;
mudar de versão volta a pedir.

---

## Ordem sugerida & dependências

```
F1 (Deal pipeline+ficha)  →  F2 (Invoice/Agreement)  →  F3 (PO/compras)
                                   ↘                         ↘
                                    F5 (KYC/Warranty/Add-ons)  F4 (Trade-in/2 stocks)
                                                   ↘
                                                    F6 (Contabilidade/Relatórios)
F7 (Service Agreement) — independente, pode entrar cedo (onboarding).
```

Cada fase segue o kit: `/specify → /plan → /tasks → /implement`, com migração+RLS na mesma PR,
`npm run build` verde e verificação no browser (demo). Atualizar `docs/ROADMAP.md` e a memória do repo.

## Notas de segurança / conformidade
- PII de cliente e documentos KYC: RLS restrita + (fase própria) encriptar identificadores sensíveis
  (PPS/licença) via `crypto.ts`; documentos imutáveis + audit (`deal_events`/`ledger_entries`).
- VAT margem (usados) vs standard 23% já cobertos por `finance.ts`.
- Reconciliação DoneDeal (parear stock ↔ anúncios por placa) continua no backlog de Deals & Trading.
