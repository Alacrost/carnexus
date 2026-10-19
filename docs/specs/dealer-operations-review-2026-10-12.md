# Revisão operacional do dealer — 12/10/2026

Estado em 13/10/2026: AutoNexus Test criado no plano Free, 97 migrações aplicadas e app local
conectado com demo desativado. Testes hospedados de Auth/PO/Deal/pagamento/Storage passaram
com duas contas fictícias. Acesso pessoal, confirmação por e-mail e aceite de termos no
navegador continuam pendentes. Comissão, serviços, unificação de lucro e UI/UX continuam
planejados, não implementados.
Não é uma certificação de produção.

## Pedido e decisões confirmadas

Revisar compra, estoque, venda, pagamentos, cancelamentos, reembolsos, auditoria,
relatórios, comissão e serviços relacionados à venda; planejar antes de implementar
e consultar o usuário sobre decisões materiais.

- Criar um **novo projeto Supabase de testes**, separado do projeto existente e de dados reais.
- Comissão configurável **por vendedor**, sem percentual padrão inventado.
- Serviços abrangem **antes da entrega e pós-venda/garantia**.
- Regime padrão solicitado anteriormente: Margin. Sem PO, não inferir Standard VAT
  pela categoria do carro/van. PO válido determina os impostos da venda.
- VRT de importados destacado na venda, já incluído no preço. Documentos emitidos
  preservam seus dados históricos.

## Evidências e limites

Foram cruzados README, SECURITY, DATA_MODEL, DELIVERY, TODO, VISION, ROADMAP,
TEAM_SUPERVISION e as especificações de compras, contabilidade, CRM, preparação,
Deal/autosave e persistência local com código, migrações e testes.

Documentação antiga não é prova do comportamento atual: VISION ainda prioriza marketing;
README/DELIVERY priorizam CRM. A antiga especificação sales-accounting descreve Standard
automático; migrações 094/095 e a decisão atual o substituem. Regras antigas de refund
somente após devolução física não descrevem a obrigação de reembolso de depósito de
uma negociação cancelada implementada em 093. Referências anteriores a migrações
hospedadas ou backups não comprovam seu estado em 12/10/2026.

| Área | O que existe | Limite encontrado / próximo trabalho |
|---|---|---|
| PO e aquisição | Comando transacional cria fornecedor/PO/veículo e vínculos; saldo separa fornecedor e financeira | No demo, gravação persistia mas lista/detalhe usavam fixtures: PO novo abria 404. Correção nesta etapa |
| Estoque | Origem PO, duas matrículas, histórico, preparação | Partes do demo ainda usam fixtures; não afirmar que todo o app é persistente |
| Venda | Deal compartilhado, acordo, pagamentos, trade-ins, finalização com invoice | Aceitação autenticada hospedada ainda pendente |
| Pagamentos | Confirmação, pendência, correção compensatória e auditoria | Remover lançamento não significa transferir dinheiro ao cliente |
| Cancelamento | Obrigação de reembolso separada do efetivamente devolvido; reembolsos parciais | Financeira e trade-in têm restrições específicas; não simular liquidação bancária |
| Exclusão de PO | Exclusão de aquisição sem histórico de Deal, registrada em audit_logs | Regra antiga apaga po_payments; histórico completo dos pagamentos não fica no evento de exclusão. Decisão de bloqueio solicitada |
| Documentos | Checklist gravável e documentos emitidos preservados | Checklist ignorava erro e aparentava sucesso. Correção nesta etapa; checklist não equivale a upload da evidência |
| Receita e vendedores | Invoice, créditos, responsável, período e filial | Receita faturada não equivale a dinheiro recebido nem a lucro |
| CSV financeiro | Exportação das tabelas | Arredondamento removia centavos e textos não tinham proteção de fórmula. Correção nesta etapa |
| Lucro | Overview legado e P&L contábil | Fontes diferentes; composição do P&L não incorpora automaticamente todos os custos de preparação/VRT. Não usar como base única de comissão sem reconciliação |
| Comissão | Base por vendedor, sem cálculo de comissão | Falta contrato de cálculo, elegibilidade, revisão, ajustes e registro de pagamento |
| Serviços | Histórico de manutenção, preparação, garantia e fase after_sales | Falta fluxo próprio de ordem de serviço/claim, promessa de entrega, custo e encerramento |
| Segurança | RPCs transacionais, RLS, papéis, isolamento e logs | Testes descartáveis não substituem Auth, grants, Storage e isolamento entre dealers no Supabase |

Referências principais: `src/lib/commercial-server.ts`, `src/lib/sales-client.ts`,
`src/app/(app)/business/purchases/`, `src/app/(app)/business/reports/`,
`src/app/(app)/business/page.tsx`, `src/app/(app)/business/deals/[id]/required-docs.tsx`,
`src/lib/csv.ts`, migrações 041, 045, 053, 058, 088, 091–095.

Revisão adicional pendente: o detalhe de PO ainda converte total desconhecido/null para zero
na apresentação; a lista já distingue `amount_pending`. Unificar a apresentação de valores
desconhecidos antes de considerar completos os testes financeiros do produto.

## Plano de execução e critérios de aceite

### 1. Persistência e correções comprovadas

- PO: gravar, listar, abrir e recarregar consultando a mesma fonte; preservar UUID do
  veículo existente; repetição não duplica PO; erros de saldo não viram zero.
- Documentos: erro de gravação desfaz a marcação e informa falha; evitar envio duplicado.
- Exportações: preservar centavos e negativos; texto externo não vira fórmula de planilha.
- Atualizar fixtures de testes que contradizem regras atuais, mantendo as verificações
  de rejeição e sem afrouxar permissões da aplicação.

### 2. Ambiente de testes real

Destino criado e confirmado: **AutoNexus Test** (`inxplclbpofmqufdcskd`), organização AutoNexus
(`ekhuzyylerrzoiobawnr`), Irlanda (`eu-west-1`), PostgreSQL 17.11, `ACTIVE_HEALTHY`.
Dashboard: https://supabase.com/dashboard/project/inxplclbpofmqufdcskd.
Usuário autorizou somente US$ 0/mês; plano Free confirmado antes e depois da criação.

Atualização de 12/10: o chat “Configure Supabase Auth” concluiu ajustes locais de autenticação
e reativou o projeto antigo por autorização do usuário naquele chat, preservando o demo.
Consulta somente leitura confirmou `ACTIVE_HEALTHY` e histórico de migrações 001–084;
o repositório possui 001–095. As versões 085–095 não constam nesse histórico remoto.
Isso não certifica equivalência do conteúdo das versões antigas nem ausência de schema drift.
Usuário reconfirmou a criação do projeto separado. O projeto antigo não recebeu migrações
ou dados desta etapa. O vínculo CLI principal continua apontando para ele; NÃO usar db push
sem conferir o destino. A operação do projeto novo usa workspace isolado, descrito abaixo.

A consulta `get_cost` e a confirmação de custo do plugin retornaram UNAVAILABLE. Após
confirmação explícita do usuário, a CLI oficial criou o projeto no plano Free existente,
sem seleção de máquina paga ou upgrade. O projeto novo estava vazio antes das migrações.

As 97 migrações foram aplicadas após pré-validação local e dry-run, usando a CLI no workspace
ignorado `.env.autonexus-test-workspace`; o project-ref desse workspace é conferido antes de
cada aplicação. Sem seeds ou cópia do demo. A CLI reportou falha apenas no cache local de
catálogo por ausência de Docker; consultas remotas confirmaram as 97 versões aplicadas.

`.env.local` agora usa a URL/chaves públicas do projeto novo e `NEXT_PUBLIC_DEMO_MODE=false`.
A configuração anterior foi preservada em `.env.before-autonexus-test-20261013`, ignorado
pelo Git. Chaves administrativas antigas foram retiradas do ambiente do app; nenhuma chave
privilegiada é usada por páginas ou requisições de usuário. Arquivos operacionais e credenciais
QA ficam em `.env.autonexus-test*`, ignorados pelo Git. O servidor existente recarregou o
ambiente; uma tentativa adicional de iniciar servidor recusou a duplicidade, sem interromper
o processo existente. Navegador confirmou redirecionamento das rotas protegidas para /login.

Pré-validação adicional na retomada: as 95 migrações aplicaram em PGlite descartável sem
privilégios legados automáticos e deixaram zero dealers/clientes/POs/usuários. Quatro consultas
como authenticated: leitura de id/registration de vehicles passou por grants de colunas;
leitura de vehicle_photos, atualização de customers e leitura de brand_kits falharam por falta
de privilégio. Os testes existentes concedem privilégios padrão que podem mascarar essa
diferença. Corrigir por migração nova com grants específicos e RLS preservada; não usar
GRANT ALL genérico. No projeto antigo, consulta somente leitura confirmou esses três grants
presentes; esse achado não deve ser tratado como falha comprovada daquele projeto.

Outro cenário descartável reproduziu falha de create_invitation quando pgcrypto está no
schema extensions: a migração 048 usa search_path=public e funções criptográficas sem schema.
O projeto antigo tem pgcrypto em extensions, confirmado por consulta somente leitura; não
foram criados convites nele para testar. Conferir o destino e corrigir a resolução das funções
por migração nova, preservando 001–095. Não copiar dados do adapter demo nem incluir seed:
config.toml referencia seed.sql, mas esse arquivo não existe no repositório.

Correção aplicada no projeto de testes: `20261012225929_explicit_api_grants_and_invitation_crypto.sql`
explicita apenas os grants usados pelas operações existentes, mantendo RLS e comandos
financeiros. A sonda UPDATE customers não justificou liberar UPDATE direto: a edição real
usa RPC; a migração libera apenas INSERT necessário ao cadastro. As três funções de convite
resolvem pgcrypto no namespace instalado, sem substituir seus corpos ou regras. A migração
rejeita schemas de resolução onde anon/authenticated possam criar objetos.

O teste permanente `tests/staging-readiness.mjs`, incluído em `npm test`, aplica as 97
migrações em quatro cenários: pgcrypto public/extensions e grants EXECUTE opt-in/explícitos.
Cobertura: onboarding, PO/estoque, Deal/pagamento/remoção auditada, ciclo de convite,
limites por loja/papel, bloqueio anônimo e de escritas financeiras diretas. Suíte integrada
PASS e revisão independente de segurança sem bloqueadores novos. A inspeção hospedada
mostrou defaults com grants explícitos; `20261013221733_internal_request_rls_and_payment_acl.sql`
acrescentou RLS às sete tabelas internas já sem acesso direto e revogou EXECUTE anônimo
desnecessário em remove_deal_payment, mantendo a guarda financeira e o acesso autenticado.
Verificação remota: 86 tabelas públicas, zero sem RLS; execução anônima da remoção negada.

`tests/hosted-staging-smoke.mjs` passou no destino fixo, usando Auth/REST/Storage reais:
login por senha e validação de sessão, onboarding de duas lojas QA, PO gravado/reaberto,
Margin scheme preservado, vínculo com estoque, Deal e pagamento, remoção com saldo corrigido,
original preservado e evento atribuído. A segunda loja não leu nem alterou os dados da
primeira. Upload/leitura de PNG privado passou; outra loja e acesso público foram negados.
O script usa service_role somente para criar dois usuários fictícios confirmados sem envio
de e-mail; operações comerciais usam sessões comuns. Não é incluído em npm test e exige
`--project-ref=inxplclbpofmqufdcskd --allow-test-writes`. Deixa registros identificados como
QA e checkpoints protegidos para reexecução, sem apagar auditoria ou copiar contas antigas.

Advisors remotos: sem alerta de tabela sem RLS; avisos remanescentes incluem tabelas internas
sem policies por desenho, funções RPC/trigger SECURITY DEFINER, duas triggers SECURITY INVOKER
com search_path não fixado e proteção contra senhas vazadas desativada. Não foram ampliadas
permissões para eliminar avisos. Referências de revisão:
https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable
e https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.

Limite: os usuários QA são confirmados administrativamente; envio/retorno de e-mail e acesso
pessoal ainda precisam ser configurados/verificados. Nenhum aceite de Service Agreement foi
feito ou simulado. Não houve publicação Vercel, backup remoto configurado ou certificação de produção.

Achado preexistente separado: vehicle_photos não tem política UPDATE; a ação de escolher
capa tenta desmarcar is_cover e pode não atualizar nenhuma linha. Grant de coluna sozinho
não resolve essa política. Não modificada nesta preparação; revisar em etapa própria.

### 3. Central de relatórios reconciliada

Proposta: uma entrada com vendas/receita, lucro/custos, caixa/pendências, compras/estoque,
vendedores/comissões e serviços. Cada indicador deve mostrar período, base, filtros e
origem do valor, permitindo abrir Deal/PO/pagamento/documento correspondente.

Antes de implementar lucro: decidir quais custos diretos entram, tratamento de custo
desconhecido, ajustes após venda e diferença entre margem comercial e resultado contábil.
Custos e VRT não podem ser contados duas vezes. Dados desconhecidos aparecem como
incompletos, nunca como lucro artificialmente alto. Conciliação inclui notas de crédito,
reembolsos e pagamentos pendentes. Relatórios fiscais oficiais dependem de validação própria;
não declarar VAT3/RTD/VRT/TAN/G46 prontos a partir das telas existentes.

### 4. Comissão por vendedor

Decisão confirmada: configuração individual, sem taxa padrão. Proposta a detalhar com usuário:
regra com vigência, base fixa ou percentual configurado, atribuição congelada da venda,
valor calculado rastreável, aprovação e registro do pagamento separados, ajustes de crédito/
cancelamento sem apagar histórico. Ainda precisam de decisão: quando nasce o direito,
quais custos afetam a base, divisão entre vendedores e ajuste de comissão já paga.

### 5. Serviço antes da entrega e pós-venda

Decisão confirmada: ambos os momentos. Proposta: ordem vinculada a carro, cliente e Deal,
tipo de trabalho, responsável, prazo prometido, oficina/fornecedor, orçamento/aprovação,
custo real, evidência e histórico de alterações. Separar promessa antes da entrega,
retorno em garantia e serviço cobrado. Não presumir cobertura de garantia nem executar
reembolso automático. Precisam de decisão: pendências que bloqueiam entrega, aprovação de
custo e quem paga cada tipo. Reutilizar preparação e histórico existentes onde o contrato servir.

### 6. Revisão de completude antes de operação real

Cobrir compra particular/fornecedor, PO de carro existente, importação/VRT, valor desconhecido,
liquidação de financeira, trade-in/negative equity, venda com/sem financiamento, depósito
pendente/rejeitado, entrada duplicada, correção, cancelamento, refund parcial, nota de crédito,
devolução de veículo, período contábil fechado, alterações concorrentes e recuperação de erro.
Reconciliar centavos e totais entre tela, banco, documentos e exportações. Validar isolamento
entre dois dealers, papéis, sessões expiradas, arquivos privados e restauração de backup.
Produção continua distinta do novo ambiente de testes e exige evidência de recuperação.

### 7. UI/UX de CRM — pedido adicional confirmado

Depois da etapa de banco e validação operacional, aprimorar a UI/UX com referências reais
de CRMs de mercado. O usuário considera a aparência atual genérica e pouco reconhecível
como CRM. Pesquisar padrões de navegação, pipeline, contatos, histórico, ações e densidade
de informação; apresentar uma direção visual concreta antes de espalhar mudanças pelo app.
Preservar os fluxos e dados já aprovados de Deal/PO, auditoria e pagamentos. A pesquisa não
foi realizada nesta retomada e nenhuma tela foi alterada por esse pedido ainda.

## Verificações desta revisão

- Na retomada após conexão dos plugins: `node tests/auth-security.mjs` PASS, cobrindo
  rotas, cookies, redirecionamentos e confirmação com respostas simuladas. Login real,
  onboarding e isolamento no destino hospedado continuam pendentes.
- PASS: remoção de pagamento, cancelamento/reembolso, sem-PO VAT e compra VAT/VRT,
  em bancos descartáveis.
- PASS: novo teste de persistência de PO em banco temporário, incluindo fechar/reabrir,
  replay, aquisição de veículo existente e saldo do fornecedor separado de VRT.
- Navegador: compra fictícia `QA-PO-121026`, fornecedor `QA PO Audit Test`, PO-00000002
  gravada por 10.000 EUR. Antes da correção abriu 404; após a correção abriu com valor,
  fornecedor e matrícula preservados. Listagem mostrou PO-00000001 e PO-00000002; reabertura
  pelo link da lista confirmada. Nenhum pagamento ou aprovação de compra executado.
- `npm test` final PASS (exit 0). As fixtures comerciais foram alinhadas à atribuição
  permitida, Agreement, autoridade de preço e estágio do autosave. Preservadas rejeições
  de atribuição indevida e auditoria de mudança de vendedor. Nenhuma permissão relaxada.
- Cobertura permanente CSV em `tests/crm.mjs`: centavos, negativos e fórmulas textuais.
- Evidência visual local: `.artifacts/review-2026-10-12/po-persisted.jpg`.
- Lint e typecheck das correções iniciais passaram; verificação específica de CSV e retorno
  de erro do checklist passou. Não equivale a aceite hospedado ou liberação de produção.
