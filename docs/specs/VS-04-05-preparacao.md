# Feature Spec — VS-04/05 Música no serviço, Ensaio e Materiais

- **Status:** Aprovada (decisões D1–D9 do Jota, 2026-10-18; D10, provedor de storage, adiada e bloqueia só a fatia 8)
- **Bloco:** B6 (`docs/blocks/B6-musica-ensaio-materiais.md`)
- **Fatia vertical:** VS-04 (música no serviço) e VS-05 (preparação, ensaio, materiais)
- **Autor / data:** Claude Code (planner) · 2026-10-18
- **Decisão associada:** [ADR-064](../adr/ADR-064-materiais-e-storage.md) (Proposed; o bloco reservava o 056). Base: ADR-007, 026, 048, 049, 051, 052, 053, 057, 059, 060, 062, 063; FIX-01 (RN-A8, RN-C4)

## Feature
O serviço concentra o que o músico precisa para se preparar (Blueprint §56): músicas na ordem, tom de cada uma, ensaio, materiais, observações e se ele já se preparou. O Líder monta a ordem a partir de um repertório sem perder o reuso.

## Objetivo
Responder, numa tela, "qual serviço, horário, função, músicas, tons, materiais, observações e ensaio" (§56) sem o músico procurar em outra ferramenta. Sustenta o critério de sucesso 3 e 4 do §26 e RF-REP-004, RF-SVC-005, RF-MUS-005, RF-REH-001…003. Teste de fronteira (§40): tudo organiza/prepara um serviço; nada vira chat, feed, calendário ou gestão de igreja (seção "Fora do escopo").

## User Stories
- Como **Líder**, quero aplicar um repertório ao serviço e marcar a sequência, para montar a ordem sem digitar música por música.
- Como **Líder**, quero duplicar um repertório, para ajustar uma variação sem mexer no original.
- Como **Líder**, quero definir o tom de uma música naquele serviço sem alterar a música da biblioteca.
- Como **Líder**, quero registrar reprise e medley apontando para a música já na ordem, sem duplicá-la.
- Como **músico escalado**, quero abrir o serviço e ver horário, minha função, músicas, tons, ensaio, materiais e observações numa tela.
- Como **músico**, quero marcar "preparado" para o serviço, e como **Líder**, ver quem já se preparou.
- Como **Líder**, quero marcar um ensaio do serviço, com horário, local, músicas em foco e observações.
- Como **Líder**, quero anexar links (YouTube, Drive) ao serviço, ao ensaio ou à música.

## Regras de negócio

**Aplicar repertório (slice 1) — RF-REP-004**
- **RN-01** "Aplicar repertório" cria itens `type = 'song'` no serviço a partir de um repertório visível ao usuário e do **mesmo escopo** do serviço (repertório da organização do serviço). O repertório original **não muda** e continua reutilizável; o item não fica ligado ao repertório (editar um não altera o outro).
- **RN-02** (marca a sequência, P3) Antes de aplicar, o Líder vê as músicas do repertório na ordem, todas marcadas. Pode **desmarcar** e **reordenar**. Músicas que já estão na ordem do serviço aparecem desabilitadas com "já está na ordem" e não são adicionadas (RN-A8 da FIX-01, `unique (service_id, song_id)` parcial da 0008).
- **RN-03** Posição de inserção: **no fim** (padrão) ou **depois de um item escolhido**; as posições seguintes são renumeradas numa única operação em lote (`unique (service_id, position)` é deferida, ADR-052).
- **RN-04** Aplicar exige `service.edit` na equipe do serviço e serviço fora de `completed`/`cancelled`. Classe A (ADR-057): funciona offline, sobe pela fila; rejeição (403/409) segue a RN-B2 da FIX-01.
- **RN-05** **Duplicar repertório:** cria um novo repertório (nome "Cópia de …", mesmas músicas e ordem, mesmo escopo e organização), com o usuário como autor. Exige `repertoire.create`. Classe A, sem RPC. Pessoal duplica pessoal; da organização duplica da organização.

**Tom por serviço (slice 2) — ADR-007**
- **RN-06** `service_items.key` (texto, nulo) guarda o tom de execução **daquela música naquele serviço**. Nulo = herda o tom atual da música. A cifra base, `original_key` e `current_key` da música **nunca** mudam por causa do tom do serviço.
- **RN-07** O tom do serviço é um `MusicalKey` válido e do **mesmo modo** (maior/menor) do `original_key` da música; `C` → `Am` é recusado. Só em itens `song`; item não musical com `key` é recusado (`check`).
- **RN-08** (convivência com RN-C4 da FIX-01) O **tom efetivo** do item é `service_items.key` se existir, senão `songs.current_key`. O Palco do serviço (online e offline) abre cada música no tom efetivo; a transposição rápida do operador no Palco continua sendo derivada de exibição, efêmera, e não grava no item. A RN-C4 permanece verdadeira para itens sem tom de serviço (o caso padrão); a única mudança é a prioridade do tom do serviço sobre o atual. `get_service_stage_songs` passa a devolver `coalesce(si.key, s.current_key)` como `current_key` (migration 0017). Exige o ok do Jota (decisão D1), pois estende uma decisão do Jota (RN-C4).
- **RN-09** Quem edita a ordem (`service.edit`) define o tom. O membro vê o tom na visão do músico, não edita.

**Reprise e medley (slice 3) — P3**
- **RN-10** Dois tipos novos de `service_items.type`: `reprise` e `medley`. São **não musicais** (`song_id` nulo, `title` preenchido, auto-gerado "Reprise: <música>"), apontam para um item `song` do **mesmo serviço** por `ref_item_id` (FK composta `(service_id, ref_item_id) → service_items(service_id, id)`). `ref_item_id` é obrigatório nesses tipos e proibido nos demais; o alvo precisa ser `type = 'song'` (trigger).
- **RN-11** Excluir o item musical referenciado exclui as reprises/medleys que apontam para ele (`on delete cascade`), com confirmação que diz quantas. O Palco continua lendo só itens `song` (D6): reprise/medley **não** aparecem no Palco no B6; aparecem na Ordem e na visão do músico, com "volta da posição N".

**Visão do músico (slice 4) — §56**
- **RN-12** Uma tela do serviço (`/services/:id/prepare`, nome a critério do ui-engineer) mostra: nome e horário; **minha função** (da atribuição ativa do usuário, ADR-053) ou "sem escala"; músicas na ordem com tom efetivo, BPM e observações do item, abrindo a música/Palco; ensaio(s); materiais; observações do serviço; botão "Preparado". Seções sem conteúdo ficam ocultas ou dizem "nada ainda". Funciona offline com o que já foi puxado (NFR-001).
- **RN-13** "Qual arranjo?" (§56): o Arrangement é conceito reservado (D7, `AI_CONTEXT.md` §6); no B6 a resposta é a observação do item. Nenhuma tabela de arranjo.
- **RN-14** Leitura: membro **ativo** da organização (mesma regra da escala, RN-13 da VS-03). Nada novo de permissão: a tela só agrega.

**Preparação (slice 5) — VS-05**
- **RN-15** `service_preparations (service_id, user_id, prepared_at)` registra "preparado". Desmarcar apaga a linha. Dado operacional persistido, **distinto** da presença/readiness efêmera do Stage (classe C do ADR-057): não reaproveita aquele canal.
- **RN-16** Só o próprio usuário marca/desmarca, e só se for **membro ativo da equipe do serviço** e o serviço não estiver `completed`/`cancelled`. Classe A (LWW por usuário/serviço, escrita própria; funciona offline).
- **RN-17** Quem lê: o próprio usuário; Owner, Admin e Líder ativo da equipe do serviço (contagem "n de m preparados" e lista). Membro comum **não** vê o estado dos outros (sem pressão social; decisão D4).
- **RN-18** Sem lembrete, sem notificação e sem cobrança automática no B6 (ADR-054 trata só da escala).

**Ensaio (slice 6) — RF-REH-001…003**
- **RN-19** `Rehearsal`: pertence a **um serviço** (1:N), com `starts_at`, `location` (≤120) e `notes`. Músicas em foco: `rehearsal_songs (rehearsal_id, service_item_id)`, só itens `song` do mesmo serviço, sem repetição. Sem recorrência, convite, confirmação de presença nem lembrete (não é calendário, §24).
- **RN-20** Criar, editar e excluir ensaio: capacidade `rehearsal.manage` (Owner, Admin, Líder ativo da equipe do serviço; negado em serviço final). Leitura: membro ativo da organização. Classe A.
- **RN-21** Excluir o serviço ou a música/item exclui o ensaio/linha em foco em cascata. `starts_at` pode ser anterior ao do serviço; não pode ser editado em serviço final.

**Materiais — só links no primeiro corte (slice 7) — RF-MUS-005, RF-REH-002, RF-SVC-005**
- **RN-22** `materials` guarda metadados de um **link externo**: `kind = 'link'`, `title` (≤120), `url` (`https://`, ≤2048), `notes` opcional. Pertence a exatamente **um** de: `service_id`, `rehearsal_id`, `song_id` (`check num_nonnulls = 1`, FKs reais, cascata). `song_id` só de música **da organização** (cópia, ADR-062); música pessoal não recebe material no B6.
- **RN-23** O link **não é buscado, incorporado nem pré-visualizado** pelo CANTUM: abre em nova aba com `rel="noopener noreferrer"`, mostrando o domínio ao lado do título (não confiar só no título). Só `https:`; `javascript:`, `data:` e `http:` são recusados no domínio e no banco.
- **RN-24** Quem anexa/edita/remove: `material.manage` (Owner, Admin, Líder ativo da equipe do serviço; para `song_id`, `song.edit`). Leitura: membro ativo da organização. Classe A. Offline: o **link** (metadado) fica no Dexie; o **conteúdo** externo não é cacheado (limitação declarada na tela: "abre online").
- **RN-25** (Upload, slice 8) fica **bloqueado** até o ADR-064 `Accepted` e a decisão D5; não é implementado nesta spec além do desenho do ADR.

## Acceptance Criteria
- [ ] Aplicar um repertório de N músicas a um serviço vazio cria N itens `song` na ordem; o repertório continua igual e utilizável.
- [ ] Aplicar com músicas já na ordem as ignora e avisa "já está na ordem"; desmarcar e reordenar na marcação é respeitado.
- [ ] Aplicar depois do item K renumera os seguintes sem colisão de posição, numa só operação.
- [ ] Duplicar um repertório gera cópia independente (mesmas músicas/ordem); editar a cópia não altera o original.
- [ ] Definir o tom `D` num item cuja música é `C` mostra `D` no serviço e **não** altera `original_key`/`current_key` da música na biblioteca.
- [ ] Tom de outro modo (`Am` em música `C`) é recusado no domínio e no banco; item não musical com `key` é recusado.
- [ ] O Palco do serviço, online e offline, abre a música no tom do serviço; sem tom de serviço, abre no tom atual da música (RN-C4 preservada).
- [ ] Reprise/medley aponta para um item `song` do mesmo serviço, não duplica `song_id`, não aparece no Palco e some junto com o item referenciado (com confirmação).
- [ ] A tela do músico mostra, sem sair dela: horário, minha função, músicas com tom, ensaio, materiais e observações; funciona offline com dados já puxados.
- [ ] "Preparado" persiste e aparece em outro aparelho do mesmo usuário; o Líder vê "n de m"; membro comum não vê os outros.
- [ ] Líder cria ensaio com horário, local, músicas em foco e observação; membro vê e não edita.
- [ ] Link `https` é salvo em serviço, ensaio ou música da organização; `http:`/`javascript:` é recusado; abre em nova aba com `noopener`.
- [ ] Todos os casos negativos de permissão da seção "Plano de testes" passam no harness de RLS.

## Requisitos
| ID | Descrição | Origem |
|---|---|---|
| RF-REP-004 | Reutilizar repertórios em serviços (aplicar, duplicar). | Blueprint §8.5, §28 |
| RF-SVC-005 | Associar repertório e materiais ao serviço. | Blueprint §28 |
| RF-SVC-006 | Tom por serviço sem alterar a música. *(id proposto)* | Blueprint §8.7, ADR-007 |
| RF-SVC-007 | Visão do músico do serviço. *(id proposto)* | Blueprint §56 |
| RF-SVC-008 | Marcar "preparado" por serviço. *(id proposto)* | Blueprint §8.8, §56 |
| RF-MUS-005 | Materiais e observações da música. | Blueprint §28 |
| RF-REH-001 | Relacionar ensaio a serviço. | Blueprint §28 |
| RF-REH-002 | Centralizar materiais de preparação. | Blueprint §28 |
| RF-REH-003 | Observações de ensaio. | Blueprint §28 |
| NFR-001 | Offline: ordem, tons, ensaio, links e "preparado" funcionam sem rede. | Blueprint §29 |
| NFR-004 | Acessibilidade dos formulários e da marcação de sequência (teclado, rótulos). | Blueprint §29 |
| NFR-005 | Permissão no banco (RLS/RPC); a UI não é segurança. | Blueprint §29, §49–50 |
| NFR-007 | Dado de terceiro: links e arquivos respeitam LGPD e copyright (§31). | Blueprint §31 |

Rastreio: RF-REP-004 → RN-01…05; RF-SVC-006 → RN-06…09; RN-10, RN-11 → P3 do Jota; RF-SVC-007 → RN-12…14; RF-SVC-008 → RN-15…18; RF-REH-001/003 → RN-19…21; RF-MUS-005/RF-REH-002/RF-SVC-005 → RN-22…25; NFR-005 → RN-04, 16, 17, 20, 24.

## Impacto em domínio, arquitetura e dados

### Domínio
- `ServiceItem` ganha `key?: MusicalKey`, `refItemId?` e os tipos `reprise`/`medley`. Funções puras: `applyRepertoireToService(serviceItems, repertoireItems, {selection, afterPosition})` (ignora repetidas, renumera), `effectiveKey(item, song)`, `validateServiceItemKey(song, key)` (mesmo modo), `duplicateRepertoire`. Novos: `Rehearsal`, `RehearsalSong`, `Material` (link), `ServicePreparation`. Respeita `AI_CONTEXT.md` §6 (Repertoire ≠ Service; Arrangement não criado; transposição derivada, ADR-007).

### Arquitetura
- Camadas inalteradas. Application: `applyRepertoireToService`, `duplicateRepertoire`, `setServiceItemKey`, `addReprise`, `setPreparation`, `createRehearsal`…, `addMaterialLink`, `getMemberPreparationView` (agregado de leitura local). UI nunca toca Dexie/remoto. Stage: só ajuste mínimo de leitura do tom (D6, RN-08).
- ADR novo: [ADR-064](../adr/ADR-064-materiais-e-storage.md) (storage). Sem ADR para o resto: segue ADR-052/053/057. **Sem dependência nova** nas slices 1–7; a 8 (upload) justifica a sua no PR.

### Dados
Migrations em `db/migrations/` (aditivas, RLS na mesma migration, `security definer` + `set search_path = ''`, `app.current_user_id()`), numeração prevista a partir da 0017 (confirmar no PR); passam no job `db`.
- **0017 `service_item_key.sql`:** `service_items.key text` com `check` de valor válido (lista dos 24 tons) e `check (key is null or type = 'song')`; trigger de modo (maior/menor igual ao da música); `create or replace get_service_stage_songs` com `coalesce(si.key, s.current_key)`. RLS existente cobre.
- **0018 `service_item_reprise.sql`:** amplia o `check` de `type` com `reprise`/`medley`; `ref_item_id`; `unique (service_id, id)` em `service_items` + FK composta com cascade; trigger "alvo é `song`"; `check` de `ref_item_id` por tipo. Os filtros `type = 'song'` do Stage já excluem os novos tipos.
- **0020 `service_preparations.sql`:** `(service_id → services cascade, user_id → users cascade, prepared_at, updated_at, pk (service_id, user_id))`; RLS: `insert/update/delete` só com `user_id = app.current_user_id()`, membro ativo da equipe do serviço, serviço não final; `select`: o próprio ou `preparation.read_team` (Owner, Admin, Líder ativo da equipe); trigger de guarda para `user_id` imutável. Anonimização (ADR-063): a linha é do titular e some com a conta (cascade).
- **0021 `rehearsals.sql`:** `rehearsals (id, organization_id, service_id → services cascade, starts_at timestamptz, location, notes, created_at, updated_at)` e `rehearsal_songs (rehearsal_id → cascade, service_item_id → service_items cascade, pk (rehearsal_id, service_item_id))` com trigger "item do mesmo serviço e `type = 'song'`"; `app.has_permission` ganha `rehearsal.manage`; RLS leitura membro ativo, escrita pela capacidade, final bloqueia.
- **0022 `materials_links.sql`:** `materials (id, organization_id, service_id, rehearsal_id, song_id, kind check ('link'), title, url, notes, created_by, created_at, updated_at)`; `check (num_nonnulls(service_id, rehearsal_id, song_id) = 1)`; `check (url ~ '^https://')`; trigger de coerência da organização (e `song_id` = cópia da organização); `app.has_permission` ganha `material.manage`. Ampliar `kind` para `file` e `storage_key`/`mime`/`size` fica para a migration do upload (0023, depois do ADR-064).
- **Exportação/exclusão (ADR-063):** `export_my_data` inclui as preparações do usuário; materiais/ensaios são da organização (autoria anonimizada, `created_by` nulo ao excluir a conta) — atualizar a RPC no PR da slice 5 e 7.
- **Dexie:** `service_items` ganha campos não indexados (`key`, `refItemId`: sem `version()` só por isso, mas o teste de upgrade garante que itens antigos seguem lendo). Nova `this.version(19)` (`servicePreparations`), `version(20)` (`rehearsals`, `rehearsalSongs`), `version(21)` (`materials`); a v18 é a atual, confirmar a numeração no PR. Teste de upgrade a cada uma.
- **Sync:** tudo classe A (ADR-057): `serviceItems` (campos novos no payload, lote já existente), `servicePreparations`, `rehearsals`, `rehearsalSongs`, `materials` entram na fila `targetSyncQueue`/`TargetSyncEngine` (ADR-026) e no pull por organização. `materials` por link não exige storage. Realtime: sem canal novo (atualiza no pull/realtime existente de tabelas do serviço; confirmar em `REALTIME_CONTRACT.md` se o serviço já notifica `service_items`; se não, fica por pull no foco da tela).
- **RLS / permissões:** capacidades novas em `docs/PERMISSIONS.md` §3 (no PR de cada slice): `rehearsal.manage`, `material.manage`, `preparation.set_own` (P), `preparation.read_team`. Aplicar repertório e tom usam `service.edit`; duplicar usa `repertoire.create`. A UI só espelha.

## Fora do escopo
- Upload de arquivos, áudio, vídeo, preview/embed de links, cache offline de conteúdo externo (slice 8, após ADR-064 e D5).
- Arrangement como entidade (D7), editor de PDF, catálogos/licenças de cifra (§31).
- Convite/confirmação de presença no ensaio, recorrência, lembretes, calendário (§24), chat/comentários nos materiais, feed de atividade.
- Reprise/medley no Palco (D6: Stage congelado); histórico de execução (B7); repertório "vivo" ligado ao serviço (sem vínculo após aplicar).
- Membro comum anexando material ou vendo a preparação de outros.

## Plano de testes
- **Domínio / application:** `applyRepertoireToService` (vazio, com repetidas, posição intermediária, desmarcadas, reordenadas, serviço final); `effectiveKey` e `validateServiceItemKey` (modo, tons menores); duplicar repertório (independência, escopo); reprise (alvo `song`, cascata); `setPreparation`; validação de URL (`https` apenas); `getMemberPreparationView` (com/sem escala, offline).
- **Repositórios (fake-indexeddb):** upgrades v18→v19/20/21 preservando dados; itens antigos sem `key`; fila de sync dos novos tipos; rejeição 403/409 não retenta (RN-B2 FIX-01).
- **RLS / SQL (harness `scripts/db`):** CRUD por papel; **negativos obrigatórios**: (N-B1) Líder da equipe A em serviço da equipe B (aplicar, tom, ensaio, material); (N-B2) usuário de **outra organização** lê/escreve qualquer tabela nova; (N-B3) **anônimo** sem `app.current_user_id()`; (N-B4) membro/Líder `inactive` (equipe e organização) tenta marcar preparado, criar ensaio ou anexar link; (N-B5) Membro comum cria ensaio/material, define tom ou aplica repertório; (N-B6) marcar "preparado" por outra pessoa, ou ler preparação de outros como Membro; (N-B7) serviço `completed`/`cancelled` bloqueia tudo; (N-B8) tom de outro modo, `key` em item não musical, reprise apontando para item de outro serviço ou não `song`; (N-B9) `material` com `http://`/`javascript:`, com 0 ou 2 donos, `song_id` pessoal; (N-B10) `organization_id` incoerente com o serviço; (N-B11) Stage online devolve o tom do serviço e ignora reprise/medley.
- **UI (papel/label):** diálogo de aplicar (marcar, reordenar, "já está na ordem"); campo de tom; reprise com confirmação de exclusão; tela do músico por papel (Líder, membro escalado, membro sem escala); botão "Preparado" (`aria-pressed`); formulário de ensaio; formulário de link (erro de URL em texto).
- **Manual:** celular e tablet; offline (aplicar, tom, preparado, abrir tela do músico, Palco com tom do serviço); dois usuários (Líder aplica, membro vê o tom); regressão da jornada musical (biblioteca → importação → repertório → serviço → Palco, FIX-01).

## Fatias propostas (um PR cada, ~1 engenheiro; ordem = menor risco primeiro)

| # | Branch | Dono | Migration | Dependência |
|---|---|---|---|---|
| 0 | `docs/b6-spec` | planner/lead | — | — (spec + ADR-064) |
| 1 | `feat/apply-repertoire-to-service` (aplicar, marca a sequência, duplicar) | core → ui | nenhuma | spec aprovada |
| 2 | `feat/service-item-key` (domínio, 0017, Stage lê tom efetivo, UI do tom) | backend → core → ui | 0016 | 1 não obrigatório; D1 |
| 3 | `feat/service-item-reprise` (tipos, `ref_item_id`, UI na Ordem) | backend → core → ui | 0018 | 1 |
| 4 | `feat/member-preparation-view` (tela do músico, agregado de leitura) | core → ui | nenhuma | 2 (tom), demais seções entram nas slices 5–7 |
| 5 | `feat/service-preparation` (persistir "preparado", contagem do Líder) | backend → core → ui | 0020 (+ `export_my_data`) | 4 |
| 6 | `feat/rehearsals` | backend → core → ui | 0021 | 4 |
| 7 | `feat/materials-links` | backend → core → ui | 0022 | 6 |
| 8 | `feat/materials-upload` | backend → core → ui | 0023 | ADR-064 `Accepted`, B8, D5; fora do primeiro corte |

Cada slice com SQL: o `backend-engineer` entrega migration + harness + `PERMISSIONS.md` antes do core. `database.ts` e `docs/adr/README.md` são do lead/core (um dono por PR).

## Riscos
| Risco | Mitigação |
|---|---|
| Tom do serviço estende a RN-C4 (decisão do Jota) | D1; coalesce explícito e teste de regressão do Palco online/offline |
| Mexer em `get_service_stage_songs` e no `check` de `type` afeta o Palco (D6) | Mudança mínima, teste de Stage online e offline na slice 2 e 3; reprise fora do Palco |
| Aplicar em lote com renumeração e `unique` parcial gera conflito no sync | Lote único (RN-B1 da FIX-01), ignorar repetidas no domínio, teste de reordenação |
| Link malicioso (phishing, esquema perigoso) | Só `https`, domínio visível, `noopener`, sem fetch/embed (RN-23) |
| Copyright/LGPD de conteúdo de terceiros (§31) | Links não hospedam; upload só após ADR-064 e B8 |
| Preparação vira pressão social | Visível só a si e à liderança (D4) |
| Renumeração de ADR (056 reservado, 064 usado) | Lead atualiza o índice e remove a linha 056 reservada |
| Escopo grande (4–6 sem) | Fatias independentes; 8 (upload) fica de fora do primeiro corte |

## Decisões do Jota
Aprovadas em 2026-10-18, como recomendado: **D1 a D9**. **D10** (provedor e limites do storage de arquivos) fica para depois e bloqueia só a fatia de upload (8). Texto original, com as recomendações, abaixo.

- **D1** Tom do serviço prevalece sobre o tom atual no Palco do serviço (estende a RN-C4)? Recomendo **sim**; item sem tom segue o tom atual.
- **D2** Aplicar repertório insere no fim por padrão, com opção "depois de…"? Recomendo **sim**.
- **D3** Reprise/medley ficam fora do Palco no B6 (D6 congelado)? Recomendo **sim**; entram na Ordem e na tela do músico.
- **D4** Membro comum vê só o próprio "preparado" (Líder/Admin/Owner veem todos)? Recomendo **sim**.
- **D5** Materiais no primeiro corte só como link, sem upload, até o ADR-064 aceito e o B8? Recomendo **sim**.
- **D6** Só o Líder (e Admin/Owner) anexa links; Membro não? Recomendo **sim** no primeiro corte.
- **D7** Material em música pessoal: fora do B6 (só música da organização)? Recomendo **sim**.
- **D8** Vários ensaios por serviço, sem convite nem lembrete? Recomendo **sim**.
- **D9** Ids de requisito novos (RF-SVC-006/007/008) a registrar no Blueprint §28? Recomendo **sim**.
- **D10** Provedor de storage (R2, Backblaze B2 ou outro) e limites do ADR-064: decidir antes da slice 8.

## Issues
- [ ] #<n> — épico B6 e uma issue por fatia 1–8 (lead cria).
