# Feature Spec — FIX-01 Jornada musical desbloqueada

- **Status:** Aprovada (decisões D1–D4 e P1–P4 do Jota, 2026-10-15, dadas no chat do lead)
- **Bloco:** correção entre B4 e B6 (sem bloco próprio) · Fatias **A** (desbloquear, inclui o modelo de música do Ministério), **B** (confiabilidade e permissões) e **C** (repertório pessoal, importação, tons menores)
- **Autor / data:** Claude Code (planner) · 2026-10-15
- **Decisão associada:** [ADR-062](../adr/ADR-062-repertorio-pessoal.md) (Accepted; revisa o ADR-022) · nota no [ADR-007](../adr/ADR-007-transposition-domain-logic.md) · Base: ADR-051, ADR-052, ADR-057, ADR-059 · Evidência: auditoria do Revisor e do QA em 333cd73 e teste do Jota em produção

## Feature
Corrigir os bloqueios que impedem montar música → repertório → serviço → Palco, e dar ao usuário um **repertório pessoal** que ele pode copiar para a organização.

## Objetivo
O músico consegue cadastrar ou importar músicas, montar repertórios e serviços e chegar ao Palco **sem ID manual, sem erro misterioso e sem perder alterações em silêncio**. Sustenta o Blueprint §26 (itens 1, 3 e 4) e o §62 (itens 1, 7 e 8).

## User Stories
- Como **músico**, quero importar uma cifra sem o tom exato e escolher o tom na revisão, para não ser barrado por formato.
- Como **músico**, quero montar um repertório escolhendo músicas numa lista com busca, para não digitar IDs.
- Como **usuário**, quero criar repertórios **pessoais** que ficam comigo em todos os aparelhos, para preparar antes de ter equipe.
- Como **Líder**, quero importar um repertório pessoal para a organização, para a equipe usá-lo.
- Como **usuário**, quero ver quando minhas alterações não foram enviadas e por quê, para decidir o que fazer.
- Como **convidado novo**, quero criar a conta, verificar o e-mail e entrar na equipe pelo mesmo convite.
- Como **Líder**, quero iniciar o Palco do serviço da minha equipe.
- Como **músico**, quero cadastrar e transpor músicas em tom menor (Am, Em, F#m…).

## Regras de negócio
**Fatia A — desbloquear**
- **RN-A1** Nenhuma ação usa `window.prompt` para dado de domínio: criar equipe, criar repertório, renomear e adicionar música usam formulário acessível (rótulo, validação, erro em texto). Confirmação destrutiva pode manter diálogo, com texto claro.
- **RN-A2** Adicionar música (repertório ou serviço) usa um **seletor com busca** por título e artista sobre as músicas que o usuário pode ver, nunca ID digitado.
- **RN-A3** (P2) Ao adicionar a um repertório ou serviço **da organização** uma música **pessoal**, o sistema cria uma **cópia pertencente à organização** (RPC `copy_song_to_organization`, exige `song.create`; sem a permissão, a ação explica) e adiciona a cópia. Se já existe cópia daquela música na organização, reaproveita. Editar a cópia não altera a pessoal. O seletor, no contexto da organização, mostra as músicas da organização e, à parte, "Da minha biblioteca" (com o aviso "será copiada para o Ministério").
- **RN-A4** **Importação tolerante** (arquivo de cifra): o **rótulo** do cabeçalho é aceito sem diferenciar maiúsculas de minúsculas e com ou sem acento (`Tom:`, `TOM:`, `tom:`, `Key:`; `Título:`, `Titulo:`, `TITULO:`, `Title:`; idem artista, BPM e observações). O **valor** do tom é aceito com tônica em maiúscula ou minúscula e com menores (`Am`, `am`, `F#m`, `f#m`, `Bbm`). Quando o tom falta ou é inválido, a tela de **revisão** obriga a escolher o tom antes de salvar (lista com maiores e menores); nada é barrado por causa do campo de tom.
- **RN-A5** **Codificação:** o importador tenta UTF-8 e, se houver bytes inválidos, usa **windows-1252** como alternativa, sem corromper acentos; mostra a prévia antes de salvar.
- **RN-A6** O cliente **puxa também as músicas das organizações das quais o usuário é membro** (as cópias, `songs.organization_id`), além das próprias, respeitando a RLS, em **uma requisição por Ministério** (não uma por música); a troca de usuário limpa o cache (ADR-048).
- **RN-A7** **Validar música no repertório:** item só referencia música existente e visível ao usuário; o erro diz qual música e por quê. Sem música repetida no repertório (já garantido pelo banco; passa a ser validado no domínio com mensagem).
- **RN-A8** (P3) **Sem música repetida no serviço:** a mesma `song_id` não aparece duas vezes em itens do tipo `song` do mesmo serviço (domínio e `unique` parcial no banco); itens não musicais não contam. O seletor avisa **"já está na ordem"** e não adiciona. Reprise e medley ficam para o B6 (`B6-musica-ensaio-materiais.md`, "organização do repertório").
- **RN-A9** **Convite para conta nova:** o token do convite sobrevive ao cadastro, à verificação de e-mail e ao login; ao aceitar, a tela espera o servidor devolver a organização e a equipe antes de abri-las. A mensagem "Organização não encontrada" só aparece para organização que de fato não existe ou não é acessível, nunca por atraso de sincronização.
- **RN-A10** **Textos claros:** mensagens dizem o que aconteceu e o que fazer, em pt-BR, sem ID técnico nem termo interno; revisão dos textos que hoje confundem ("ID da música", "Organização não encontrada", erros genéricos de sync).
- **RN-A11** (P4) **Nomenclatura da interface:** Organização aparece como **"Ministério"** e Equipe como **"Banda"** (ex.: "Banda de domingo"); no plural, "Ministérios" e "Bandas". Código, banco, rotas técnicas e documentos de domínio continuam `Organization` e `Team` (ADR-011). Os rótulos ficam **centralizados em um único módulo de textos** (por exemplo `src/ui/labels.ts`, nome a critério do ui-engineer); as telas usam esse módulo, e trocar o termo no futuro é editar só ele. Mensagens de erro e de ajuda usam os mesmos rótulos.
- **RN-A12** **Recarga ao vivo não atrapalha a tela:** quando o pull ou o realtime atualiza os dados, formulários abertos **mantêm o que foi digitado** e a tela **não é desmontada nem volta ao estado de carregamento** (hoje `RepertoireListPage` recarrega e reinicia o formulário). Atualiza só a lista, no lugar.
- **RN-A13** **Cópia de música é só online (ADR-057, classe B):** adicionar música pessoal ao Ministério (RN-A3) exige rede. Sem rede, o seletor mostra "Sem conexão: tente de novo quando estiver online." **já ao abrir** a seção "Da minha biblioteca", e nada é copiado nem adicionado. O Palco offline depende das cópias já puxadas para o aparelho (RN-A6): cópia ainda não puxada não toca offline.
- **RN-A14** **Push das cópias:** o cliente atualiza a cópia **por `id`, sem trocar o `user_id` (autor)** e **nunca** faz upsert com `user_id` = usuário atual (isso criaria uma linha própria em vez de editar a cópia). Edição e exclusão por Líder ou Admin que **não é o autor** são aceitas pela RLS e testadas.

**Fatia B — confiabilidade e permissões**
- **RN-B1** A ordem do repertório é gravada **em lote**: o cliente envia todos os itens do repertório num único `POST /sync/:table` (uma transação, `server/src/data.ts`) e `repertoire_items (repertoire_id, position)` passa a `unique … deferrable initially deferred` (mesmo padrão do `service_items`, ADR-052).
- **RN-B2** **Fila de sync:** erro **permanente** (HTTP 4xx exceto 408 e 429, como 403 e 409) **não é repetido para sempre**: o item sai do ciclo de retentativa e fica marcado com o motivo; erro de rede ou 5xx segue com retentativa e recuo. Um **contador** de "alterações não enviadas" aparece na interface (primeiro corte: só o contador e o motivo geral em texto; a lista detalhada por item fica para depois).
- **RN-B3** **Descartar com aviso** (primeiro corte, junto do contador): o usuário pode descartar as alterações recusadas (ex.: 403) depois de um aviso que diz que a alteração local será perdida; o estado volta ao do servidor no próximo pull. Nada é descartado sem confirmação.
- **RN-B4** **Onboarding espera o servidor:** criar organização e equipe só avança de passo quando o servidor confirma (a organização, a equipe e o vínculo `leader` criado no servidor existem); durante a espera mostra progresso, e falha mostra erro com "tentar de novo". Não avança com estado só local.
- **RN-B5** **Líder inicia o Palco** (D4): o Líder **ativo da equipe do serviço** pode iniciar a sessão de Palco, além de Owner e Admin; capacidade `stage.start` (`PERMISSIONS.md` §3.3). Quem executa o Palco (`stage.run`) continua igual; Membro não inicia.

**Fatia C — repertório pessoal, importação e tons**
- **RN-C1** (D1) **Repertório pessoal** (ADR-062): dono = usuário, sem organização, só ele vê e edita, sincroniza em todos os aparelhos dele, funciona offline, usa músicas da **biblioteca dele**. A aba Repertórios cria **pessoal por padrão**; criar da organização continua possível a partir da organização.
- **RN-C2** (D2, P2) **Importar repertório pessoal:** Owner, Admin e Líder ativo (L\*) veem, dentro do Ministério, a lista dos **seus** repertórios pessoais, cada um com subtítulo com alguns nomes de músicas (até 3, mais "+N"). Escolher **copia** o repertório para o Ministério (mesma ordem) e cria, para cada música, uma **cópia pertencente ao Ministério** (reaproveitando a que já existir). Nada fica ligado à música ou ao repertório pessoal: editar de um lado não altera o outro. Só online (ADR-057 classe B).
- **RN-C3** (D3) **Tons menores:** `MusicalKey` aceita `Cm`…`Bm` (e enarmônicos `C#m/Dbm`…); formulário de música e importador oferecem maiores e menores; transposição preserva o modo e a grafia segue a tônica (nota no ADR-007). Dados existentes (sem sufixo `m`) continuam válidos.

## Acceptance Criteria
- [ ] Nenhum `window.prompt` para criar banda, criar ou renomear repertório ou adicionar música (confirmações destrutivas podem permanecer).
- [ ] O seletor de músicas busca por título e artista; adicionar uma música pessoal a repertório/serviço do Ministério cria uma cópia do Ministério, e editar a cópia não muda a música pessoal.
- [ ] A interface diz "Ministério" e "Banda" em todas as telas, vindo de um único módulo de textos; o seletor do serviço avisa "já está na ordem" para música repetida.
- [ ] Importar cifra sem tom, com tom em minúsculas, com tom menor ou em windows-1252 funciona; o tom faltante é escolhido na revisão e os acentos ficam corretos.
- [ ] Um membro vê no aparelho as músicas (cópias) dos seus Ministérios, puxadas numa requisição por Ministério.
- [ ] Um Líder ou Admin que não é o autor edita e exclui a cópia; a música pessoal do autor não muda e nenhuma linha nova de autor aparece.
- [ ] Com a lista atualizando ao vivo, o formulário de repertório aberto não perde o que foi digitado nem a tela é desmontada.
- [ ] `Tom:`, `TOM:`, `Key:`, `Titulo:` e valores `Am`, `am`, `F#m` são aceitos na importação.
- [ ] Sem rede, o seletor mostra "Sem conexão…" ao abrir "Da minha biblioteca" e não adiciona nada.
- [ ] Adicionar música inexistente/invisível a um repertório mostra erro claro; repetir música no repertório ou no serviço é recusado com mensagem.
- [ ] Reordenar um repertório de N músicas sobe numa só operação e não falha por colisão de posição.
- [ ] Alteração recusada pelo servidor (403/409) deixa de ser retentada, conta em "alterações não enviadas" com o motivo geral e pode ser descartada após aviso; erro de rede continua retentando.
- [ ] Conta nova abre o convite, cria a conta, verifica o e-mail, entra na equipe e abre a organização sem "Organização não encontrada".
- [ ] Criar organização e equipe no onboarding só avança com a confirmação do servidor; falha mostra "tentar de novo".
- [ ] O Líder ativo da equipe do serviço inicia o Palco; Membro e Líder de outra equipe não (negado no banco).
- [ ] A aba Repertórios cria repertório pessoal; ele aparece nos outros aparelhos, funciona offline e ninguém mais o vê.
- [ ] Líder, Admin e Owner importam um repertório pessoal: o repertório do Ministério tem as mesmas músicas e ordem, as músicas viram cópias do Ministério, e editar uma cópia não altera a original.
- [ ] Apagar o Ministério apaga seus repertórios e suas cópias de músicas e **não** afeta as bibliotecas e os repertórios pessoais.
- [ ] `Am`, `F#m` e `Bbm` podem ser salvas e transpostas sem perder o modo.

## Requisitos
| ID | Descrição | Origem |
|---|---|---|
| RF-MUS-001 | Biblioteca de músicas (cadastro, importação, cópias do Ministério). | Blueprint §28 |
| RF-MUS-002 | Tom original e tom atual (inclui menores). | Blueprint §28 |
| RF-MUS-003 | Transposição. | Blueprint §28 |
| RF-REP-001 | Criar repertórios (pessoal e da organização). | Blueprint §28 |
| RF-REP-002 | Adicionar e remover músicas. | Blueprint §28 |
| RF-REP-003 | Reordenar músicas. | Blueprint §28 |
| RF-SVC-003 | Ordem do serviço sem música repetida. | Blueprint §28 |
| RF-TEAM-002 | Convidar pessoas (conta nova). | Blueprint §28 |
| RF-STG-001 | Entrar no Modo Palco (Líder inicia). | Blueprint §28 |
| NFR-001 | Funciona offline (repertório pessoal, leitura). | Blueprint §29 |
| NFR-002 | Sincronização: lote, erro permanente, visibilidade. | Blueprint §29 |
| NFR-004 | Acessibilidade dos formulários novos. | Blueprint §29 |
| NFR-005 | Permissão no banco (`stage.start`, importação, pessoal). | Blueprint §29, §49–50 |

Rastreio: RF-MUS-001 → RN-A4, A5, A6, A14; NFR-001 → RN-A13; UX (estabilidade da tela) → RN-A12; RF-MUS-002/003 → RN-C3; RF-REP-001 → RN-A1, C1, C2; RF-REP-002 → RN-A2, A3, A7; UX (nomenclatura) → RN-A11; RF-REP-003 → RN-B1; RF-SVC-003 → RN-A8; RF-TEAM-002 → RN-A9, B4; RF-STG-001 → RN-B5; NFR-002 → RN-B1…B3; NFR-005 → RN-B5, C1, C2; NFR-004 → RN-A1, A2.

## Impacto em domínio, arquitetura e dados

### Domínio
- `MusicalKey` ganha os menores; `transpose.ts` preserva o modo e escolhe a grafia pela tônica (`Bbm`, `Ebm` em bemóis; `F#m`, `Em` em sustenidos). `Repertoire.organizationId` fica opcional (pessoal). Validação pura de item de repertório e de serviço (música existente, sem repetição).

### Arquitetura
- Camadas inalteradas. UI: formulários e seletor de músicas (`src/pages/Repertoire`, `src/pages/Organization`, `src/pages/Song`, componente de seletor reutilizável após 3 usos: repertório, serviço, importação de repertório). Application: `addSongToRepertoire` e `addServiceItem` validam e, para música pessoal em contexto de Ministério, chamam `copyPersonalSongToOrganization`; `importPersonalRepertoire`; `getSyncStatus`/`discardSyncItem`; `createRepertoire` aceita `scope: 'personal' | organizationId`. Sync (`targetSyncEngine`): classificação de erro, contador, lote da ordem, pull das músicas do Ministério. Módulo único de rótulos (RN-A11).
- ADRs: 062 (novo), 022, 021 e 007 (notas), 026/057 (classe A para o pessoal, B para importar), 048, 052.

### Dados
Cada fatia tem a **sua** migration (`db/migrations/NNNN_…sql`, próximo número livre; nada em `supabase/migrations`) e a sua `version()` do Dexie. A migration de músicas (modelo de cópia) é da **Fatia A**.

#### Fatia A — modelo de música do Ministério (ADR-062, P2)
- **Colunas:** `songs.organization_id uuid references organizations(id) on delete cascade` (nulo = pessoal) e `songs.source_song_id uuid` (origem, sem FK). `songs.user_id` continua sendo o **autor**; a chave `(user_id, id)` não muda.
- **Unicidade da cópia:** `unique (organization_id, source_song_id) where organization_id is not null and source_song_id is not null and deleted_at is null` (cópia apagada não bloqueia nova cópia).
- **Políticas de `songs`:** pessoal (`organization_id` nulo) = só o dono lê, edita e exclui; cópia da organização = lê membro ativo da organização; edita `song.edit` (Owner, Admin, L\*) ou o autor (`song.edit_own`); exclui `song.delete` (Owner, Admin) ou o autor (`song.delete_own`). Inserir cópia só por RPC. Trigger de guarda: `organization_id` e `user_id` imutáveis em `update` (princípio do `guard_content_owner` do B2). A atualização por Líder/Admin que não é o autor passa pela política `update` da matriz (testada).
- **Escopo dos itens (trigger):** item de repertório ou de serviço **da organização** só aceita música com `songs.organization_id` igual ao da organização; item de repertório **pessoal** só aceita música **pessoal do dono**.
- **Cascade:** apagar a organização apaga repertórios, serviços e **suas cópias**; não toca em músicas pessoais. As FKs `repertoire_items.song_id` e `service_items.song_id` são `ON DELETE RESTRICT` (checado na hora) e **bloqueariam** o cascade: passam a `NO ACTION` (checado ao fim do comando), mantendo a proteção contra apagar música em uso. Teste obrigatório do cascade.
- **RPC** `copy_song_to_organization(p_song_id uuid, p_organization_id uuid, p_new_id uuid)` (`security definer`, `set search_path = ''`): confere que a música é pessoal e do usuário e `song.create` na organização; devolve a cópia existente (por `source_song_id`) ou cria a nova. Só online; na allowlist de `/rpc`.
- **Conversão de `organization_songs` (plano padrão, transação única):** só há dados de desenvolvimento (ADR-059 §1), mas a conversão é completa e testada.
  1. Para cada organização O, o conjunto S(O) = músicas vinculadas a O em `organization_songs` **∪** músicas referenciadas por `repertoire_items` de repertórios de O **∪** músicas referenciadas por `service_items` de serviços de O. (Cobre os **itens órfãos**: item que aponta para música que nunca foi vinculada.)
  2. Para cada `(O, música)` em S(O), cria uma **cópia** (id novo, `organization_id` = O, `user_id` = dono da original, `source_song_id` = original, conteúdo copiado). A mesma música em duas organizações gera duas cópias.
  3. Reaponta para a cópia: `repertoire_items.song_id`, `service_items.song_id`, `stage_session_states.current_song_id` e `prepared_song_id` (das sessões de serviços de O).
  4. Remove, nesta ordem: as políticas de `songs` do `0004` que dependem de `organization_songs`; as funções `app.can_manage_organization_song` e `app.is_my_song` (e o que mais depender delas); por fim a tabela `organization_songs` (as políticas dela caem junto).
  5. Recria as políticas de `songs` pelo modelo novo. A migration confere contagens antes e depois (itens por organização, cópias criadas) e falha se algum item ficar apontando para música de outro escopo.
  - **Alternativa pendente do Jota (opção B):** *limpar* em vez de converter: apagar os vínculos e os itens de repertório e de serviço das organizações e recomeçar. Mais simples e descartável porque os dados são de teste; perde o conteúdo de teste. O plano padrão acima é o que está especificado; a escolha final é do Jota.
- **Dexie:** nova `this.version(16)`: `songs` com o índice `organizationId` (e o campo `sourceSongId`); sem transformação de dados (as músicas locais existentes são pessoais). Domínio `Song` ganha `organizationId?` e `sourceSongId?`. A biblioteca (Músicas) mostra as pessoais, com filtro para as do Ministério. Teste de upgrade.
- **Sync:**
  - **Pull** de `songs`: pessoais + cópias de cada Ministério do usuário, **uma requisição por Ministério** (filtro por `organization_id`).
  - **Push** de cópias: classe A (LWW) mas **atualiza por `id`** sem alterar `user_id`; nunca upsert com `user_id` = usuário atual. Exclusão (soft delete) por `id`. Criar cópia é só pela RPC (classe B).
  - Música pessoal nova continua como hoje (push do próprio usuário).

#### Fatia B — confiabilidade e permissões
- `repertoire_items_repertoire_id_position_key` → `deferrable initially deferred`.
- `unique (service_id, song_id) where type = 'song'` em `service_items`.
- `create_target_stage_session` passa a checar `app.has_permission(org, team_id, 'stage.start')`; `app.has_permission` ganha `stage.start`.
- **Sync:** `repertoireItems` em lote; fila com `status` de erro (`failed` + `lastError`) e retentativa só para erro transitório; contador e descarte (teste com `src/platform` mockado).

#### Fatia C — repertório pessoal, importação e tons
- `repertoires.organization_id` aceita nulo; políticas de `repertoires` e `repertoire_items` ganham o ramo "pessoal do dono"; `check` e trigger de guarda impedem mover entre pessoal e organização por escrita direta (a importação cria **cópia**).
- `app.has_permission` ganha `repertoire.import_personal`.
- RPC `import_personal_repertoire(p_repertoire_id uuid, p_organization_id uuid, p_new_id uuid)`: confere dono e `repertoire.import_personal`, cria o repertório da organização com os mesmos itens e ordem, usando a lógica de cópia por música da Fatia A (reaproveita cópia existente), e devolve o repertório e as contagens (copiadas, reaproveitadas). Só online; na allowlist de `/rpc`.
- Subtítulo da lista de repertórios pessoais usa só dados do próprio dono, já no cliente (Dexie): sem RPC.
- **Dexie:** nova `this.version(18)` (a 17 removeu `organizationSongs` na Fatia A): `repertoires: 'id, organizationId, createdByUserId, updatedAt'`; sem transformação de dados. Teste de upgrade.
- **Sync:** pull de `repertoires` pessoais (`created_by_user_id` = usuário, `organization_id` nulo).

- **RLS / permissões:** `PERMISSIONS.md` §3.3 (`stage.start`, `repertoire.import_personal`, pessoal, cópia) e §5.3 (F1–F12).
- **Pendência B8:** `songs.user_id` tem `on delete cascade`; apagar a conta do autor apagaria as cópias da organização. A política de saída do B8 deve reatribuir a autoria (a um Owner/Admin) antes de excluir a conta.

## Fora do escopo
- Repertório inteiro dentro do serviço e "preparar para o serviço" (B6).
- Compartilhar repertório pessoal entre usuários; vínculo vivo entre cópias.
- Conversão para tom relativo e armaduras de clave.
- Redesenho do Palco (D6); notificações; mudança de política de LWW.

## Plano de testes
- **Domínio / application:** transposição de menores (ida e volta, grafia), validação de tom no importador, seleção de codificação, validação de item (inexistente, repetido), cópia ao adicionar (idempotente por origem), importação (cópia, ordem, músicas copiadas e reaproveitadas), módulo de rótulos, classificação de erro de sync, descarte.
- **Repositórios (fake-indexeddb):** upgrade v15 → v16; repertório pessoal isolado por usuário (ADR-048); ordem em lote.
- **Sync (`src/platform` mockado):** 403 não retenta; 5xx retenta; contador; descarte com pull restaurando; pull das músicas do Ministério (uma requisição por Ministério); push da cópia por `id` sem trocar o autor; lote único da ordem.
- **UI (papel/label):** recarga ao vivo não reinicia formulário (RepertoireListPage); seletor com "Sem conexão…" ao abrir sem rede; importador com `Tom:`/`TOM:`/`Key:` e `Am`/`am`/`F#m`; formulários sem `prompt`; seletor com busca por teclado; revisão do tom faltante; indicador de não enviados; convite de conta nova ponta a ponta; onboarding com espera e "tentar de novo"; botão de iniciar Palco por papel; aba Repertórios (pessoal) e tela de importação com subtítulos.
- **RLS / SQL (`scripts/db`):** F1–F12; `unique` deferida na ordem; `unique` parcial no serviço; `stage.start` (Líder da equipe × outra equipe × Membro × inativo); RPCs de cópia e importação (dono, não membro, idempotência); **cascade** da organização (apaga cópias, preserva pessoais e bibliotecas); migração de `organization_songs` em cópias **incluindo itens órfãos** (item de repertório/serviço que aponta para música nunca vinculada) e reapontamento de `stage_session_states`; edição e exclusão da cópia por Líder/Admin não autor, sem criar linha nova de autor; escopo dos itens por trigger; edição da cópia não altera a original.
- **Server:** `import_personal_repertoire` na allowlist; lote de itens numa transação.
- **Manual:** celular; offline (criar e reordenar repertório pessoal, ver "não enviadas"); dois aparelhos (o pessoal aparece); importar um arquivo de cifra em windows-1252.

## Riscos
| Risco | Mitigação |
|---|---|
| `organization_id` nulo enfraquece políticas existentes | Ramos separados "pessoal" × "organização" nas políticas; F1, F5, F11 obrigatórios; revisão do diff de RLS |
| Descartar alteração apaga trabalho do usuário | Aviso explícito, lista com motivo, só após erro permanente, nunca automático |
| Copiar música para o Ministério expõe o conteúdo à banda | Aviso na ação ("será copiada para o Ministério"); exige `song.create`; só músicas do próprio usuário |
| Apagar a conta do autor apaga as cópias do Ministério | Pendência do B8: reatribuir autoria antes; registrada em Dados |
| FK `RESTRICT` impede o cascade da organização | Trocar para `NO ACTION` e testar o cascade; migration reescreve as FKs |
| Conversão de `organization_songs` perde dados ou deixa item órfão | Só dev; conversão completa (vínculos ∪ itens), em transação, com contagem antes/depois e falha se sobrar item de outro escopo; testes de migração com órfãos; alternativa "limpar" pendente do Jota |
| Push da cópia cria linha nova do editor (upsert com `user_id` = eu) | RN-A14: atualização por `id` sem trocar o autor; teste com Líder/Admin não autor |
| Recarga ao vivo reinicia o formulário | RN-A12: atualização no lugar; teste de UI |
| Duplicação de músicas entre pessoal e Ministério confunde | Cópia idempotente por origem, rótulo "copiada de" na cópia e filtro Minhas × Ministério |
| `unique` do serviço colide com dados de teste | Só dev (ADR-059 §1); migration lista e remove duplicados em desenvolvimento |
| Onboarding esperando o servidor falha em rede ruim | Estado de espera com tentar de novo; nada é perdido localmente |
| Windows-1252 mal detectado | Prévia obrigatória antes de salvar; o usuário corrige na revisão |
| Seletor de músicas cresce em complexidade | Componente único, três usos reais, busca simples em memória sobre o Dexie |

## Decisões fechadas e pontos abertos
**Fechadas pelo Jota (2026-10-15):** P1 repertório pessoal só com músicas da biblioteca dele; P2 música da organização é cópia (não vínculo); P3 ordem do serviço sem música repetida, com reprise e medley no B6; P4 "Ministério" e "Banda" na interface, num módulo único de textos.

**Para o Jota:**
0. **Conversão de `organization_songs`:** plano padrão = converter tudo em cópias; alternativa = limpar vínculos e itens (dados de teste). Estou especificando a conversão; o lead está perguntando ao Jota.
1. **Autoria das cópias ao excluir a conta:** reatribuir a um Owner/Admin no B8. Recomendo.
2. **Nome do módulo de rótulos** (`src/ui/labels.ts`): a critério do ui-engineer, sem decisão de produto.

## Issues
- [ ] FIX-01 / A — `fix/music-unblock` — migration de músicas (cópia, políticas, RPC, FKs, conversão de `organization_songs`), Dexie v16, formulários, seletor, importador, pull por Ministério, push da cópia, convite de conta nova, recarga ao vivo, rótulos e textos (backend-engineer + core-engineer + ui-engineer)
- [ ] FIX-01 / B — `fix/sync-reliability` — migration (`unique` deferida, `unique` parcial, `stage.start`), lote, fila e contador, descarte, onboarding, botão do Líder (backend-engineer + core-engineer + ui-engineer)
- [ ] FIX-01 / C — `feat/personal-repertoire` — migration (pessoal, importação), Dexie v18, sync, UI das abas, tons menores (backend-engineer + core-engineer + ui-engineer)
