# Feature Spec — VS-06 Execução & Histórico

- **Status:** Proposed — fatias 1–6 implementadas; D1–D6 adotadas pela recomendação do planner, aguardando confirmação do Jota antes de produção; fatia 7 (refatoração do Palco solo) implementada
- **Bloco:** B7 (`docs/blocks/B7-execucao-historico.md`)
- **Fatia vertical:** VS-06
- **Autor / data:** Claude Code (planner), sob revisão do Jota · 2026-10-22
- **Decisões associadas:** ADR-052 (ciclo do serviço), ADR-057 (classes A/B/C), ADR-063 (exclusão e anonimização), ADR-044/047 (Stage canônico), ADR-011 (nomes do Dexie), D6 (freeze do Stage) · Matriz: [`docs/PERMISSIONS.md`](../PERMISSIONS.md) (§3.6 e §5.4 novos, no PR de schema) · Blueprint §8.9, §9, §40, §52.1, §57, §58.4, NFR-005, NFR-007
- **ADR novo:** nenhum. O registro e o log cabem na classe C do ADR-057 (gerados e lidos no servidor), seguem o ADR-063 para dado pessoal e o ADR-052 para o ciclo. Se a D2 for "(a)", o PR de schema registra a exceção ao guarda do operador no `REALTIME_CONTRACT.md`.

## Feature
Ao concluir um serviço, o servidor grava um **registro imutável** do que foi executado (músicas na ordem, tom efetivo, equipe confirmada, duração). A música passa a mostrar quando foi tocada pela última vez, com que frequência e em quais tons. O Início ganha um bloco **Atividade**, log somente leitura de eventos do sistema (§52.1). O Stage sai do freeze (D6) só para **renomear** o legado "Band" e **refatorar** as páginas, sem feature nova.

## Objetivo
Fechar o ciclo Executar → Registrar (§9): o Líder escolhe repertório e tom sabendo o que a equipe já tocou, sem planilha. Sustenta §26 itens 1 e 4 (montar serviço rápido; menos WhatsApp/planilha). A refatoração do Stage reduz o risco de manutenção da experiência crítica (§57).

## User Stories
- Como **Líder**, quero ver o que foi tocado em cada serviço realizado (músicas, tons, quem tocou), para planejar os próximos.
- Como **Líder**, quero ver na música quando ela foi tocada pela última vez e em quais tons, para não repetir demais e escolher o tom certo.
- Como **Membro**, quero ver o registro dos serviços de que participei, para lembrar o tom e a ordem usados.
- Como **Owner/Admin**, quero o mesmo em qualquer equipe da organização.
- Como **membro ativo**, quero ver no Início o que mudou recentemente (repertório, escala, ensaio, material), para não depender de mensagens.
- Como **músico no Palco**, quero que nada mude no comportamento do Palco com a refatoração.

## Regras de negócio

**Registro do serviço executado**
- **RN-01** O registro nasce **só no servidor**, na mesma transação da transição `in_progress → completed` (`transition_service`). Serviço `cancelled` não gera registro. O cliente nunca escreve nele (RF-HIS-001).
- **RN-02** O registro é um **snapshot imutável**: depois de gravado, nenhum papel o altera por escrita direta ou RPC. Corrigir o que foi tocado é feito **antes** de concluir, editando a ordem em `in_progress` (já permitido por `service.edit`). Sai junto com o serviço (Owner/Admin podem excluir serviço concluído, `PERMISSIONS.md` §3.4) e com a organização.
- **RN-03** Músicas executadas = itens `type = 'song'` da ordem no momento da conclusão, na ordem. Para cada uma copia-se `title`, `artist` e o **tom efetivo** `coalesce(service_items.key, songs.current_key)` (VS-04-05 RN-08), mais `song_id` como referência. Reprise/medley e itens não musicais não entram (D3 do VS-04-05: fora do Palco).
- **RN-04** Equipe executada = atribuições `confirmed` no momento da conclusão: `user_id` + função musical da vaga. `invited`, `declined`, `replacement_needed` e `cancelled` não entram.
- **RN-05** Duração: `stage_started_at` = menor `started_at` e `stage_ended_at` = maior `ended_at` das sessões do Stage do serviço; nulos se o serviço foi concluído sem Palco. `completed_at = now()`; `completed_by_user_id` = quem concluiu.
- **RN-06** O tom registrado é o **planejado/efetivo do serviço**, não a transposição feita ao vivo no Palco (estado efêmero, ADR-057 classe C). Ver D1.

**Histórico por música (derivado, nunca persistido)**
- **RN-07** Por música da organização: última vez tocada (`max(completed_at)`), frequência (quantidade de registros nos últimos 12 meses), tons usados (tom + contagem, do mais usado ao menos) e os últimos 5 serviços (nome, data, tom). Consulta sobre os snapshots; sem tabela agregada (RF-HIS-002).
- **RN-08** "Repertórios relacionados" = repertórios da organização que contêm a música, lidos do Dexie local (já existe); não é histórico e não vai ao servidor.
- **RN-09** Música pessoal (`organization_id` nulo) não tem histórico: serviços usam cópias da organização (ADR-062).

**Atividade (§52.1)**
- **RN-10** `ActivityLog` é **somente leitura**: sem comentários, curtidas, reações, respostas, menções, contador de não lidos, notificação ou publicação por usuário. O evento é gerado por trigger/RPC no servidor, nunca pelo cliente (RF-HIS-003).
- **RN-11** Eventos do primeiro corte (`kind`): `service.ready`, `service.completed`, `service.cancelled` (em `transition_service`); `assignment.confirmed`, `assignment.declined`, `assignment.replacement_needed` (nas RPCs de escala); `rehearsal.created`; `material.added`; `repertoire.updated` (repertório **da organização**, itens ou dados). Repertório pessoal, preparação ("preparado") e disponibilidade **nunca** geram evento (privacidade, VS-04-05 D4; VS-03 RN-11).
- **RN-12** `repertoire.updated` é **agrupado**: não grava se já existe o mesmo `kind` + `entity_id` + `actor` nos últimos 30 minutos.
- **RN-13** O evento guarda só ids (`organization_id`, `team_id`, `service_id`, `entity_id`, `actor_user_id`) e `kind`. Título e nome vêm por junção na leitura; entidade excluída aparece como "item excluído". Sem conteúdo (letra, notas, URL).
- **RN-14** Retenção: o log mostra os últimos 30 dias (máx. 50 eventos por página); eventos com mais de 90 dias são apagados na própria inserção (por organização). Ver D5.
- **RN-15** "Escala publicada" do §52.1 não tem equivalente (o B4 não tem "publicar"); o mais próximo é `service.ready` ("Serviço pronto"). Registrado aqui para não inventar um estado novo.

**Leitura, privacidade e fronteira**
- **RN-16** Ler registro, histórico por música e atividade: membro **ativo** da organização (`PERMISSIONS.md` §4), igual à leitura de serviços e escalas. Outra organização, anônimo e quem está `inactive` em todas as equipes: nada.
- **RN-17** Eventos `assignment.declined` e `assignment.replacement_needed`: ver D4.
- **RN-18** Dado pessoal (ADR-063): `user_id` da equipe executada, `completed_by_user_id` e `actor_user_id` são `references app.users on delete set null`; após a exclusão da conta a UI mostra "Ex-membro". `team_member.remove` não apaga participações passadas. `export_my_data` passa a incluir as participações do titular (serviço, data, função), sem dados de terceiros.
- **RN-19** Fronteira (§40): **não** há estatística por pessoa (presença, ranking, "quantas vezes Fulano tocou"), relatório, gráfico, exportação, CCLI nem visão de frequência de voluntários. Histórico é sobre **música e serviço**; atividade é log, não feed.
- **RN-20** Leitura **só online** (ADR-057 classe C): sem tabela no Dexie e sem fila. Sem rede, as seções mostram "Disponível com conexão." e o resto da tela funciona (NFR-001 cobre biblioteca, repertório e Palco, não o histórico).

**Stage (fim do D6: só renomear e refatorar)**
- **RN-21** Nenhuma mudança de comportamento, contrato de Realtime (`REALTIME_CONTRACT.md`), rota, RPC ou dado. Toda tela do Stage mantém nomes acessíveis equivalentes; os testes existentes passam sem mudar asserções além dos textos renomeados.
- **RN-22** Renomear o legado no Stage canônico: `BandStagePresencePanel` → `StagePresencePanel` (arquivo, CSS, teste); classes `band-stage-*` → `stage-*` e a variável `--band-stage-font-size` → `--stage-font-size`; "MODO BANDA · CONTROLE DO MD" → "MODO PALCO · CONTROLE DO MD"; "Setlist"/"Setlist da sessão" → "Ordem"/"Ordem do serviço" (igual à tela do músico). Textos novos no módulo de rótulos (`src/ui/labels.ts`, §52.1.1). **Não** renomear nada no Dexie (`bandSetlists` etc. em versões antigas de `database.ts`, ADR-011) nem "Banda" como rótulo de Team (§52.1.1, decisão v1.3).
- **RN-23** Refatorar `ServiceStagePage.tsx` (220 linhas, ~17 KB, linhas de JSX com milhares de caracteres, exceção de lint #42) em hooks e componentes: estado da sessão/Realtime/comandos num hook, cabeçalho, lista da ordem, área da letra, controles e editor de anotação como componentes compartilhados com `ServiceStageMusicianPage`. Meta: nenhum arquivo do Stage > ~300 linhas nem linha > 160 colunas; sair da lista de exceção do `react-hooks/set-state-in-effect` (o lead edita `eslint.config.js`).
- **RN-24** `StagePage.tsx` (Palco solo, 581 linhas) recebe a mesma extração em fatia separada e opcional.
- **RN-25** Saída da sessão descarta o estado temporário (§57): já é o comportamento do Stage canônico (ADR-042/047); a fatia de refatoração só acrescenta o teste que o comprova. Fim automático ao concluir o serviço: D2.

## Acceptance Criteria
- [ ] Concluir um serviço `in_progress` cria exatamente um registro com data, músicas na ordem, tom efetivo de cada uma, equipe confirmada com função e, se houve Palco, início e fim.
- [ ] Cancelar não cria registro; tentar concluir de novo é recusado (transição inválida) e não duplica.
- [ ] `insert`, `update` e `delete` diretos nas tabelas do registro e do log são negados para qualquer papel; editar a música ou a ordem depois não muda o registro.
- [ ] A tela do serviço concluído mostra "Registro da execução"; a lista de serviços tem o filtro "Realizados".
- [ ] A música da organização mostra "Última vez tocada em <data>", "Tocada N vezes nos últimos 12 meses" e os tons usados com contagem; sem registro, "Ainda não tocada em um serviço".
- [ ] O Início mostra "Atividade" com no máximo 10 eventos recentes da organização ativa, cada um com texto, autor e hora; nenhum botão, campo ou ícone de interação social existe no bloco (teste por papel/label).
- [ ] Repertório pessoal, preparação e disponibilidade nunca aparecem na atividade.
- [ ] Usuário de outra organização, anônimo e membro `inactive` em todas as equipes não leem registro, histórico nem atividade (negado pelo banco).
- [ ] Após `delete_my_account`, a participação do titular aparece como "Ex-membro" e o registro continua; `export_my_data` inclui as participações do titular.
- [ ] Sem rede, as seções de histórico e atividade mostram "Disponível com conexão." e o resto da tela funciona.
- [ ] Stage: nenhum texto "Band", "MODO BANDA" ou "Setlist" na UI do Stage canônico nem classe `band-stage-*` em `src/`; testes de regressão do Stage e do Realtime passam; nenhum arquivo do Stage passa de ~300 linhas; `ServiceStagePage.tsx` sai da exceção de lint.
- [ ] Teste manual §58.4 do Stage registrado no PR da refatoração.

## Requisitos
| ID | Descrição | Origem |
|---|---|---|
| RF-HIS-001 *(novo, D6)* | Registrar o serviço executado (data, repertório, tons, equipe, duração). | Blueprint §9 |
| RF-HIS-002 *(novo, D6)* | Mostrar o histórico da música (última vez, frequência, tons usados, repertórios relacionados). | Blueprint §9 |
| RF-HIS-003 *(novo, D6)* | Log de atividade do sistema somente leitura no Início. | Blueprint §52.1 |
| RF-STG-001…005 | Palco segue igual após renomear e refatorar (regressão). | Blueprint §28, §57 |
| NFR-004 | Acessibilidade das novas seções; nomes acessíveis do Stage preservados. | Blueprint §29 |
| NFR-005 | Leitura e geração autorizadas no banco; sem escrita do cliente. | Blueprint §29, §49–50 |
| NFR-006 | Minimização: log só com ids; anonimização na exclusão. | Blueprint §29, ADR-063 |
| NFR-007 | Consultas indexadas e limitadas; histórico não pesa na biblioteca nem no Palco. | Blueprint §29 |

Rastreio: RF-HIS-001 → RN-01…06, RN-18; RF-HIS-002 → RN-07…09; RF-HIS-003 → RN-10…15, RN-17; NFR-005 → RN-01, RN-02, RN-10, RN-16; NFR-006 → RN-13, RN-14, RN-18; NFR-007 → RN-07, RN-14, RN-20; RF-STG-* → RN-21…25.

## Impacto em domínio, arquitetura e dados

### Domínio
- `src/domain/history/`: tipos `ServiceExecution { serviceId, completedAt, stageStartedAt?, stageEndedAt?, songs: ExecutedSong[], members: ExecutedMember[] }`, `ExecutedSong { position, songId?, title, artist?, key? }`, `ExecutedMember { userId?, musicalFunction }`, `SongHistory`, `ActivityEvent { id, kind, actorUserId?, serviceId?, entityId?, entityTitle?, createdAt }`. Funções puras: `executionDuration` (minutos ou nulo), `activityText(event, names)` (texto pt-BR por `kind`, "Ex-membro" e "item excluído").
- Respeita `AI_CONTEXT.md` §6: Service ≠ StageSession (registro pertence ao serviço); Repertoire ≠ Service; Arrangement fora; transposição não persiste na música (ADR-007).

### Arquitetura
- Leitura online: `src/platform` (RPC) → `application/history` (`getServiceExecution`, `getSongHistory`, `getRecentActivity`) → UI. Sem Dexie, sem `TargetSyncEngine`. Nenhum import de `src/lib/supabase`.
- Servidor: RPCs de leitura na allowlist de `/rpc`; nenhuma regra de permissão em TypeScript.
- Stage: só `src/pages/Stage`, `src/components/stage`, CSS e `src/ui/labels.ts`; `src/sync/stageRealtime.ts` e `application/stage` não mudam.

### Dados
Migrations em `db/migrations/` (aditivas, RLS na mesma migration, `security definer` + `set search_path = ''` na geração, `app.current_user_id()`), numeração prevista **0023** e **0024** (confirmar no PR; se o upload de materiais do B6 entrar antes, renumerar). Passam no job `db`.

- **0023 `service_executions.sql`** (classe C, dado pessoal: equipe):
  - `service_executions (service_id uuid pk → services on delete cascade, organization_id → organizations on delete cascade, completed_at timestamptz not null, completed_by_user_id → app.users on delete set null, stage_started_at, stage_ended_at)`; índice `(organization_id, completed_at desc)`.
  - `service_execution_songs (service_id → service_executions on delete cascade, position int, song_id → songs on delete set null, title text not null, artist text, key text, pk (service_id, position))`; índice `(song_id, service_id)`.
  - `service_execution_members (id uuid pk, service_id → service_executions on delete cascade, user_id → app.users on delete set null, musical_function text not null)`; índice `(user_id)`.
  - Nome e data do serviço vêm de `services` por junção (serviço concluído já é imutável pelo trigger de guarda).
  - RLS: `select` para `app.is_active_in_organization(organization_id)` (nas filhas, via o pai). **Sem** `insert/update/delete` para `cantum_user` (revoke + sem policy).
  - Geração: `transition_service` (create or replace) chama `app.record_service_execution(service_id)` quando `p_to = 'completed'`, na mesma transação (RN-01, RN-03…05). `unique` pela pk garante um registro.
  - Leitura (`language sql stable`, `security invoker`, RLS decide): `get_service_execution(p_service_id)` e `get_song_history(p_song_id)` (RN-07, limitada). Na allowlist do servidor.
  - `export_my_data` (create or replace): + participações do titular (RN-18).
  - Se D2 = (a): mesma função encerra sessões `lobby`/`live` do serviço (ver riscos: guarda do operador).
- **0024 `activity_events.sql`** (classe C, dado pessoal: `actor_user_id`):
  - `activity_events (id uuid pk, organization_id → organizations cascade, team_id, service_id → services on delete cascade, entity_id uuid, actor_user_id → app.users on delete set null, kind text check (lista RN-11), created_at)`; índice `(organization_id, created_at desc)`.
  - RLS: `select` para membro ativo da organização (+ filtro da D4 nos `kind` de recusa/substituição); sem escrita para `cantum_user`.
  - Geração: `app.log_activity(...)` (`security definer`) chamada em `transition_service`, nas RPCs de escala (`respond_to_assignment`, `request_replacement`) e por triggers `after insert` em `rehearsals` e `materials` e `after insert/update/delete` em `repertoire_items`/`repertoires` só com `organization_id` não nulo (RN-11, RN-12). Purga > 90 dias na própria função (RN-14).
  - Leitura: `get_recent_activity(p_organization_id, p_before timestamptz default null)` (`security invoker`, 50 por página, 30 dias, junção de títulos; RN-13).
- **Dexie:** nenhuma `version()` nova (RN-20).
- **Sync:** nenhuma fila nem pull novos. Sem canal de Realtime novo: a atividade recarrega ao abrir/focar o Início.
- **RLS / permissões:** `PERMISSIONS.md` ganha §3.6 (leitura de histórico e atividade, sem capacidade nova, por "ativo na organização") e §5.4 (casos H1–H10) no PR de cada schema. A UI não é mecanismo de segurança.

## Fora do escopo
- Estatística, relatório, gráfico ou ranking por pessoa; presença de voluntários; exportação; CCLI; analytics (§9, RN-19).
- Comentários, reações, respostas, menções, não lidos, notificação a partir da atividade, atividade em tempo real (§52.1).
- Editar ou anotar o registro depois de concluído; "o que foi realmente tocado" no Palco (itens pulados, transposição ao vivo; D1).
- Histórico offline (Dexie) e histórico de música pessoal.
- Feature nova no Stage (inclusive reprise/medley no Palco), mudança de contrato de Realtime, RPC ou rota do Stage.
- Renomear tabelas, bancos ou chaves do Dexie (ADR-011) e o rótulo "Banda" (§52.1.1).

## Plano de testes
- **Domínio / application:** `executionDuration`; `activityText` por `kind` (autor ausente → "Ex-membro", entidade ausente → "item excluído"); casos de uso com `src/platform` mockado (sucesso, erro, sem rede → estado "Disponível com conexão.").
- **RLS / SQL (`scripts/db`):**
  - H1 concluir gera um registro com músicas na ordem, tom `coalesce(si.key, s.current_key)`, só `confirmed`, durações; cancelar não gera.
  - H2 `insert/update/delete` direto em `service_executions*` e `activity_events` por Owner, Admin, Líder e Membro → negado.
  - H3 editar música ou item depois → registro inalterado; excluir a música → `song_id` nulo, título preservado.
  - H4 usuário de **outra organização** lê registro, histórico ou atividade → vazio/negado.
  - H5 **anônimo** (sem `app.current_user_id()`) → negado.
  - H6 membro `inactive` em todas as equipes → negado; Líder `inactive` de uma equipe mas ativo em outra → lê (regra §4).
  - H7 Membro de **outra equipe** da mesma organização lê (leitura por organização, RN-16); se D4 = recomendada, não lê recusa/substituição de equipe que não lidera.
  - H8 repertório pessoal, preparação e disponibilidade não geram evento; `repertoire.updated` agrupado em 30 min.
  - H9 `delete_my_account` → `user_id`/`actor_user_id`/`completed_by_user_id` nulos, registro intacto; `team_member.remove` mantém participações passadas; `export_my_data` inclui participações e nada de terceiros.
  - H10 purga > 90 dias; `get_recent_activity` limita 50 e 30 dias.
- **Server:** RPCs de leitura na allowlist; escrita inexistente.
- **UI (papel/label):** seção "Registro da execução"; filtro "Realizados"; histórico na música (com e sem dados); bloco "Atividade" sem `button`/`textbox` de interação dentro do `region` "Atividade"; estado offline.
- **Stage (refatoração):** antes de mexer, testes de caracterização de `ServiceStagePage` (MD e músico: navegar, transpor, anotação, readiness, encerrar, sair) e os de Realtime (`stageRealtime.test.ts`, `server/src/realtime.test.ts`) verdes; depois, os mesmos testes passam só com a troca de textos da RN-22; teste de que sair descarta o estado temporário (RN-25).
- **Manual:** §58.4 do Stage (celular, tablet, rotação, offline, rede instável, toques rápidos, reconnect) com 2 usuários, mais a jornada musical (biblioteca → import → repertório → serviço → Palco → concluir → histórico).

## Fatias propostas (um PR cada; ordem = menor risco primeiro; 1–4 e 5–7 andam em paralelo)

| # | Branch | Dono | Migration | Dependência |
|---|---|---|---|---|
| 0 | `docs/b7-spec` | planner/lead | — | — |
| 1 | `refactor/stage-naming` (RN-22: renomear componente, classes, variável CSS, textos via `labels.ts`) | ui | — | spec aprovada |
| 2 | `refactor/service-stage-page` (RN-23, RN-25: testes de caracterização primeiro, depois hooks/componentes; lead remove a exceção de lint) | ui | — | 1 |
| 3 | `feat/execution-history-schema` (0023, `transition_service`, leituras, `export_my_data`, `PERMISSIONS.md` §3.6/§5.4, H1–H7, H9) | backend | 0023 | D1, D2, D3 |
| 4 | `feat/execution-history` (domínio, application, "Registro da execução", "Realizados", histórico na música, relacionados locais) | core → ui | — | 3 |
| 5 | `feat/activity-log-schema` (0024, geração nas RPCs/triggers, leitura, H8, H10) | backend | 0024 | 3 (mesma `transition_service`), D4, D5 |
| 6 | `feat/home-activity` (bloco "Atividade" no Início) | core → ui | — | 5 |
| 7 | `refactor/solo-stage-page` (RN-24, opcional) | ui | — | 2 |

QA do bloco (qa) ao fim: §58.4 + jornada musical com 2 usuários. `database.ts` não muda no B7; `eslint.config.js` e `docs/adr/README.md` são do lead.

## Riscos
| Risco | Mitigação |
|---|---|
| Refatoração quebra o Palco ao vivo | Fatias 1–2 só de UI, testes de caracterização antes, contrato de Realtime intocado, manual §58.4 |
| Renomear classe CSS deixa estilo órfão (CSS minificado numa linha) | Substituição mecânica `band-stage-` → `stage-` em `.tsx`/`.css` do Stage, checar `grep` vazio e revisão visual |
| `transition_service` mais pesada / falha bloqueia a conclusão | Snapshot por `insert … select` indexado; teste H1; erro no registro aborta a transição (melhor que concluir sem registro) |
| D2 (a): encerrar sessão por quem não é MD esbarra no `assert_stage_operator` | Caminho explícito na função `security definer` documentado no `REALTIME_CONTRACT.md`; teste de revisão/snapshot; ou adotar (c) |
| Log vira feed ou vigilância | RN-10, RN-11, RN-19; teste de UI sem controles; preparação/disponibilidade fora; D4 |
| Dado sensível (filiação religiosa, LGPD art. 11) no histórico de equipe | Só ids, `on delete set null`, export do titular, leitura só por membro ativo; retenção do registro na D5 |
| Colisão de numeração com o upload do B6 (0023) | Confirmar no PR; renumerar |
| Atividade desatualizada sem Realtime | Recarrega ao focar o Início; aceitável para log |

## Decisões do owner
- **D1 Tom registrado.** (a) tom efetivo planejado do serviço `coalesce(si.key, s.current_key)`; (b) também gravar a última transposição ao vivo por item (exige persistir estado do Palco, mexe no Stage e no contrato). Recomendo **(a)**.
- **D2 Concluir com Palco aberto.** (a) concluir encerra as sessões `lobby`/`live` do serviço na mesma transação (§57, duração exata; contorna o guarda do operador); (b) bloquear a conclusão até o MD encerrar; (c) não mexer no Palco (duração pelo `ended_at` existente, pode ficar nula). Recomendo **(b)**: zero mudança no Stage e mensagem clara "Encerre o Palco antes de concluir".
- **D3 Equipe registrada.** (a) só `confirmed`; (b) também `invited` sem resposta (quem provavelmente tocou mas não confirmou). Recomendo **(a)**.
- **D4 Recusa e substituição na atividade.** (a) visíveis a todos os membros ativos (coerente com a VS-03 RN-13); (b) só a quem tem `schedule.manage` na equipe do serviço; (c) não registrar esses eventos. Recomendo **(b)**: evita pressão social, como a D4 do VS-04-05.
- **D5 Retenção.** Log: 90 dias (recomendo). Registro de execução: (a) enquanto existir o serviço/organização, anonimizado na exclusão da conta; (b) prazo fixo (ex.: 5 anos). Recomendo **(a)**, sujeito ao jurídico do B8.
- **D6 Ids de requisito novos** RF-HIS-001/002/003 a registrar no Blueprint §28 (seção "Histórico"). Recomendo **sim**.

Defaults adotados (sem decisão pendente): leitura só online (RN-20); histórico só de músicas da organização (RN-09); frequência em 12 meses e 5 últimos serviços (RN-07); `service.ready` no lugar de "escala publicada" (RN-15); nenhum ADR novo; fatia 7 opcional.

## Issues
- [ ] Épico B7 / VS-06
- [x] `refactor/stage-naming` (ui-engineer)
- [x] `refactor/service-stage-page` (ui-engineer; lead: `eslint.config.js`)
- [x] `feat/execution-history-schema` — 0023 (backend-engineer)
- [x] `feat/execution-history` (core-engineer → ui-engineer)
- [x] `feat/activity-log-schema` — 0024 (backend-engineer)
- [x] `feat/home-activity` (core-engineer → ui-engineer)
- [x] `refactor/solo-stage-page` (ui-engineer, opcional)
