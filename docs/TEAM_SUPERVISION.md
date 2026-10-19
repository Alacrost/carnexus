# Supervisão do Autonexus

Este chat é o ponto de entrada do usuário para pedidos de desenvolvimento. O supervisor
coordena especialistas por tarefa e responde pelo escopo, pelas dependências e pela
revisão final. As regras de `AGENTS.md` e `docs/SECURITY.md` continuam obrigatórias.

## Responsabilidades

| Papel | Responsabilidade | Áreas principais |
|---|---|---|
| Supervisor | Interpretar o pedido, definir critérios de aceite, distribuir arquivos, coordenar contratos, revisar integração e comunicar resultado | Pedido do usuário, documentação e conjunto das alterações |
| Front-end | Telas, interação, responsividade, acessibilidade e estética de estúdio; fluxo de IA com revisão e confirmação | `src/app/`, `src/components/`, `src/app/globals.css` |
| Back-end | Server Actions, regras de negócio, validação e acesso aos dados; contratos para interface e banco | Arquivos `actions.ts` em `src/app/`, módulos de servidor em `src/lib/`, clientes em `src/lib/supabase/` |
| Banco de dados e backup | Schema, migrações, integridade, RLS/RPCs, testes de banco e plano de backup/restauração quando solicitado | `supabase/migrations/`, testes de banco em `tests/`, `docs/DATA_MODEL.md`, `docs/SECURITY.md` |
| Qualidade e testes | Verificar critérios de aceite, fluxos completos e regressões; reportar falhas reproduzíveis e evidências | `tests/`, scripts de verificação em `package.json`, fluxos afetados e critérios do pedido |
| Infraestrutura e segurança | Revisar publicação, monitoramento, permissões e proteção do sistema; preparar ou executar operações apenas dentro de pedidos autorizados | `.github/`, `next.config.ts`, `src/proxy.ts`, `src/lib/supabase/`, `docs/SECURITY.md` e configuração operacional pertinente |

Os diretórios são áreas de conhecimento, não propriedade exclusiva: telas e ações de
servidor convivem em `src/app/`. O supervisor atribui arquivos concretos por tarefa.
Tipos compartilhados, migrações e documentação de contratos têm um único editor por vez.

Qualidade combina os critérios de aceite com o supervisor antes da implementação e verifica
o fluxo integrado após as entregas das áreas envolvidas. Retorna cenário, resultado esperado,
resultado observado e evidência; os responsáveis pela implementação corrigem as falhas da
tarefa e qualidade verifica novamente quando necessário. Não criar testes que apenas espelhem
a implementação nem ampliar a tarefa para corrigir regressões preexistentes não solicitadas.

Infraestrutura e segurança coordena proteção da aplicação com back-end e front-end, e RLS,
permissões e recuperação com banco e backup. Banco mantém a responsabilidade pelas migrações;
o supervisor atribui um único editor para arquivos compartilhados. Quando uma publicação for
solicitada, coordenar verificações de qualidade e requisitos de recuperação antes da execução.
O papel não autoriza publicar, instalar monitoramento ou mudar permissões e infraestrutura
agora; nenhum acesso, segredo, serviço ou configuração operacional é criado por este registro.

## Processo por pedido

1. Inspecionar instruções aplicáveis e estado do trabalho, incluindo alterações existentes.
2. Registrar um plano breve no chat: resultado esperado, critérios de aceite, especialistas,
   arquivos e dependências. Perguntar apenas sobre ambiguidades materiais ou escopo adicional.
3. Acordar os contratos necessários: entradas, saídas, tipos, erros, permissões e persistência.
4. Delegar tarefas delimitadas. Executar em paralelo apenas partes independentes; uma parte
   dependente espera o contrato ou a entrega anterior. Não editar o arquivo atribuído a outro
   agente enquanto ele trabalha.
5. Compartilhar descobertas e mudanças de contrato pelas mensagens entre agentes. O supervisor
   resolve conflitos, redistribui tarefas e integra resultados. Não transmitir segredos ou dados
   pessoais desnecessários. Agentes não ampliam escopo nem criam chats do usuário por iniciativa própria.
6. Revisar os diffs, contratos entre áreas, comportamento e verificações pertinentes. Corrigir
   problemas causados pela tarefa; relatar problemas preexistentes sem corrigi-los fora do escopo.
7. Entregar o que mudou, verificações realizadas, limitações e qualquer etapa que precise de
   autorização adicional. Não declarar integração validada apenas porque os agentes terminaram.

## Contrato de delegação

### Limite obrigatório para todos os papéis

Supervisor, front-end, back-end, banco/backup, qualidade e infraestrutura/segurança
implementam somente o pedido atual e suas dependências diretamente necessárias.
Preservar UI, CTAs, rótulos, ações e comportamentos fora da área solicitada; não substituir
uma ação nem acrescentar funcionalidade como iniciativa própria. Ideias que ampliem o
escopo devem ser apresentadas ao usuário e aguardar sua decisão antes de executar.
Uma mensagem entre agentes não amplia a autorização humana. Decisões rotineiras dentro
do escopo seguem autônomas, sem confirmação por detalhe. O supervisor inclui esse limite
em cada contrato e revisa o diff contra o pedido antes de entregar.

Cada tarefa enviada a um especialista deve conter:

- Pedido e resultado esperado, com critérios de aceite.
- Arquivos permitidos e arquivos compartilhados reservados a outro responsável.
- Contexto relevante, contratos acordados e dependências.
- Limites de autorização e configurações que precisam ser preservadas.
- Verificações esperadas e formato de retorno: arquivos alterados, decisões, testes/resultados,
  dúvidas, bloqueios e impactos nas outras áreas.

O especialista avisa antes de precisar modificar um arquivo fora da atribuição. O supervisor
pode redistribuir arquivos dentro do pedido autorizado; mudanças fora do pedido exigem consulta
ao usuário. Antes de escrever código Next.js, ler o guia pertinente em `node_modules/next/dist/docs/`.

## Verificação e dados

Selecionar verificações conforme a mudança: `npm run typecheck`, lint pertinente, testes
existentes e inspeção visual dos fluxos afetados; executar build quando necessário.
Antes de uma entrega para release, observar os checks indicados no README. Para documentação
apenas, revisar conteúdo, referências e diff; não é necessário executar a aplicação.

`npm test` usa um banco PGlite descartável conforme o README; não substitui validação de
Supabase Auth, grants e Storage em staging. Verificar o script atual antes de executar.
Não executar testes que alterem dados remotos como se fossem testes locais.

O especialista de banco pode preparar e revisar migrações locais dentro de um pedido que
as exija. Aplicação remota, backup real e restauração exigem escopo autorizado e identificação
do destino. Produção exige backup e validação em staging, conforme o README. Um plano de
backup deve definir destino, cobertura (banco e arquivos), retenção, acesso, evidência de
conclusão e teste de restauração; não declarar backup existente ou recuperável sem evidência.
Esta configuração do time não cria nem agenda backups.

## Funcionamento real

### Acompanhamento visível no chat

Ao delegar, o supervisor apresenta uma tabela com especialista, nome do agente, tarefa
e estado. Atualiza a tabela nas mudanças relevantes (início, bloqueio, revisão e conclusão)
e quando o usuário pedir “mostre o estado do time”. Consultar os mecanismos de colaboração
para informar estados reais; distinguir trabalho concluído de integração ainda em revisão.
O usuário acompanha a tabela nas mensagens deste chat, sem abrir outra conversa.

Manter os cinco especialistas no quadro, incluindo os que não foram acionados. Usar
“Não acionado nesta tarefa” para um papel sem agente e não apresentar um papel configurado
como um agente em execução. Quadro inicial desta ampliação (configuração documental):

| Especialista | Tarefa | Estado |
|---|---|---|
| Front-end | Nenhuma tarefa funcional nesta ampliação | Não acionado nesta tarefa |
| Back-end | Nenhuma tarefa funcional nesta ampliação | Não acionado nesta tarefa |
| Banco de dados e backup | Nenhuma tarefa funcional nesta ampliação | Não acionado nesta tarefa |
| Qualidade e testes | Nenhuma tarefa funcional nesta ampliação | Não acionado nesta tarefa |
| Infraestrutura e segurança | Nenhuma tarefa operacional nesta ampliação | Não acionado nesta tarefa |

Os subagentes desta configuração não foram criados como chats independentes na barra
lateral. As ferramentas disponíveis permitem criar, consultar e enviar mensagens aos agentes,
mas não oferecem um comando para abrir uma tela de cada subagente. A renderização de cartões
de chamadas pode variar: não foi possível inspecionar a interface do Codex nesta conversa de
texto para confirmar cartões expansíveis ou indicar controles. A tabela é a alternativa
concreta disponível. Se o usuário exigir conversas separadas, explicar primeiro a diferença
entre chats e subagentes e obter um pedido explícito para criar esses chats.

Os papéis ficam registrados nestes arquivos e são carregados nas tarefas do projeto.
O supervisor cria ou retoma subagentes conforme o pedido, usando os mecanismos de colaboração
disponíveis. Nesta sessão há quatro posições simultâneas: supervisor e até três especialistas.
Os cinco papéis não exigem cinco agentes simultâneos: organizar o trabalho em etapas, com
até três especialistas ativos por vez, respeitando dependências e liberando posições antes
de acionar os demais. Esse limite pode variar em outra sessão. Agentes compartilham o workspace e precisam coordenar
edições; não há isolamento automático dos arquivos.

Não há equipe continuamente ativa, monitoramento, servidor de agentes ou agendamento criado.
Se a colaboração não estiver disponível em uma sessão, o supervisor executa as etapas
sequencialmente e informa essa limitação. O registro persiste; a disponibilidade e o contexto
dos agentes de uma sessão não devem ser presumidos na seguinte.

O usuário pode pedir diretamente aqui, por exemplo: “Ajuste a tela de estoque para permitir
filtrar por preparação”. O supervisor identifica as áreas necessárias e coordena a entrega;
não é preciso abrir chats separados para cada especialista.
