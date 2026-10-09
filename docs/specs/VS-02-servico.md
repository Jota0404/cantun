# Feature Spec — VS-02 Serviço: equipe, estados e ordem

- **Status:** Em revisão
- **Bloco:** B3 (`docs/blocks/B3-servico-vs02.md`)
- **Fatia vertical:** VS-02
- **Autor / data:** Claude Code (planner), sob revisão do Jota · 2026-10-09
- **Decisão associada:** [ADR-052](../adr/ADR-052-service-operacional.md) (Proposed) · Matriz: [`docs/PERMISSIONS.md`](../PERMISSIONS.md) (ADR-051) · Backend: ADR-059

## Feature
O Service pertence a uma equipe, tem estado (`draft → ready → in_progress → completed | cancelled`), informações básicas (nome, data/hora, local, observações) e uma ordem de itens genéricos, em que música é um tipo entre outros (Blueprint §8.2, §8.6, §18.2, §48.2).

## Objetivo
Tornar o serviço o centro operacional que o B4 (escala) e o B6 (repertório e materiais) vão preencher. Sustenta o Blueprint §26 (itens 1 e 3: o serviço fica organizado; cada músico sabe o que vai acontecer).

## User Stories
- Como **Líder**, quero criar um serviço da minha equipe com nome, data/hora, local e observações, para planejar o culto.
- Como **Líder**, quero montar a ordem com músicas e outros momentos (abertura, oração, ministração…), reordenar e remover itens, para que todos vejam a sequência real.
- Como **Líder**, quero marcar o serviço como pronto, em andamento, realizado ou cancelado, para comunicar o estado à equipe.
- Como **Owner/Admin**, quero fazer o mesmo em qualquer equipe da organização.
- Como **Membro**, quero ver os serviços (próximos, em planejamento, realizados) e a ordem, para me preparar.
- Como **MD no Modo Palco**, quero que anterior/próxima percorram só as músicas, na ordem do serviço.

## Regras de negócio
- **RN-01** Todo serviço tem `team_id` de uma equipe da **mesma organização** (garantido no banco).
- **RN-02** Estados e transições (ADR-052): `draft ↔ ready`, `ready → in_progress`, `in_progress → completed`, e `cancelled` a partir de `draft`, `ready` ou `in_progress`. `completed` e `cancelled` são finais. Serviço novo nasce `draft`. Transição inválida é recusada no domínio e no banco.
- **RN-03** O status só muda por RPC (`transition_service`); escrita direta de `status` é barrada no banco (mesmo padrão do `role`/`status` do B2).
- **RN-04** `ServiceItem.type ∈ { song, opening, prayer, preaching, announcement, offering, closing, other }`. `type = song` ⇒ `song_id` obrigatório; `type ≠ song` ⇒ `song_id` nulo e `title` obrigatório (1–120 após `trim`). `notes` opcional; `duration_minutes` opcional, 1–600.
- **RN-05** A ordem é `position` única por serviço; reordenar e remover renumeram de forma contígua.
- **RN-06** Serviço `completed` ou `cancelled` não aceita edição de informações nem da ordem.
- **RN-07** O Stage lê só itens `song`, por `position`; anterior/próxima pulam itens não musicais (D6: ajuste mínimo, sem feature nova).
- **RN-08** Permissões (novas capacidades, escopo de equipe = equipe do serviço): `service.create`, `service.edit` (informações e ordem), `service.transition`: Owner, Admin e **Líder ativo da equipe do serviço**. `service.delete`: Owner e Admin; o Líder só exclui em `draft`. Leitura: membro ativo na organização (`PERMISSIONS.md` §4). Decididas no banco por `app.has_permission`; `permissions.ts` só espelha (NFR-005).
- **RN-09** Sem calendário como produto (§8.2): lista por agrupamento, não grade de datas.

## Acceptance Criteria
- [ ] O Líder cria um serviço da própria equipe com nome, data/hora, local e observações; nasce `draft`.
- [ ] O Líder de outra equipe, o Membro e o usuário de outra organização não criam nem editam (negado pelo banco).
- [ ] A ordem aceita músicas e itens não musicais, reordenáveis por arrastar **e** por subir/descer via teclado.
- [ ] Item `song` sem música ou item não musical sem título é recusado (domínio e `check`).
- [ ] `completed → draft`, `cancelled → ready` e similares são recusados no domínio e no banco; `update services set status` direto é negado.
- [ ] Serviço `completed`/`cancelled` não aceita edição.
- [ ] O Stage mostra só as músicas, na ordem; anterior/próxima respeitam a ordem e pulam itens não musicais (§34.1, ex. 3).
- [ ] Lista agrupa próximos, em planejamento e realizados, com estado visível (§53).
- [ ] Offline: leitura funciona; criação e edição entram na fila e respeitam a autorização ao subir.

## Requisitos
| ID | Descrição | Origem |
|---|---|---|
| RF-SVC-001 | Criar um serviço. | Blueprint §28 |
| RF-SVC-002 | Definir informações básicas. | Blueprint §28 |
| RF-SVC-003 | O serviço possui uma ordem de itens. | Blueprint §28 |
| RF-SVC-004 | Associar equipe e escala. **B3 cobre a equipe; a escala é do B4.** | Blueprint §28 |
| NFR-001 | Leitura offline. | Blueprint §29 |
| NFR-004 | Acessibilidade (ordem operável por teclado). | Blueprint §29 |
| NFR-005 | Permissão no banco. | Blueprint §29, §49–50 |

RF-SVC-005 (repertório e materiais) é do B6.
Rastreio: RF-SVC-001 → RN-01, RN-08; RF-SVC-002 → RN-02, RN-03, RN-06; RF-SVC-003 → RN-04, RN-05, RN-07; RF-SVC-004 → RN-01.

## Impacto em domínio, arquitetura e dados

### Domínio
- `Service` ganha `teamId`, `location?`, `notes?`; `ServiceStatus = 'draft' | 'ready' | 'in_progress' | 'completed' | 'cancelled'`.
- `src/domain/services/serviceLifecycle.ts`: tabela de transições pura (`canTransition`, `transition`).
- `ServiceItem` ganha `type`, `title?`, `notes?`, `durationMinutes?`; `songId` opcional. Validação pura (RN-04) em `serviceItem.ts`; reordenação genérica (independe do tipo).
- Respeita `AI_CONTEXT.md` §6: Repertoire ≠ Service, Service ≠ StageSession, Arrangement fora.

### Arquitetura
- `domain/services` → `application/services` (`createService(teamId)`, `updateServiceInfo`, `transitionService`, `addServiceItem(type)`, `moveServiceItem`, `removeServiceItem`) → UI. Padrão `fn(input, repository = default)` com `{ success, errors }`.
- Remoto via `src/platform`; nenhum import de `src/lib/supabase`.
- ADRs: **ADR-052 (Proposed)**, ADR-051, ADR-059, ADR-026 (sync), ADR-011 (Dexie), D6 (Stage congelado).

### Consumidores de `song_id` (passa a ser nulo em itens não musicais)
- SQL (baseline): `get_service_stage_songs`, `create_target_stage_session` (exige "ao menos um item"), `initialize_target_stage_state` (primeiro item), `target_stage_goto`, `target_stage_next`, `target_stage_previous`, `target_stage_prepare_next`. Todos ganham `and si.type = 'song'`; nada mais muda (navegação já é por `position >`/`<`, então os buracos de posição são naturais).
- Cliente: `src/domain/services/serviceItem.ts`, `src/application/services/serviceScheduleService.ts`, `src/application/stage/getServiceStageSongs.ts`, `src/domain/stage/stageSessionState.ts`, `src/sync/targetSyncEngine.ts`, `src/db/database.ts`, `src/pages/Organization/ServiceDetailPage.tsx`.
- `assignments.service_item_id` (B4): sem mudança agora.

### Dados
- **SQL (`db/migrations/NNNN_service_operational.sql`, próximo número livre no merge, depois da migration do B2; nada em `supabase/migrations`):**
  - `teams`: `unique (organization_id, id)`; `services`: `team_id uuid not null`, FK composta `(organization_id, team_id) → teams (organization_id, id) on delete restrict`, `location text`, `notes text`.
  - Status: troca do `check` para os cinco estados; `default 'draft'`; `update … set status = 'draft' where 'planned'`, `'ready' where 'confirmed'`.
  - **Sem dados de produção para migrar** (ADR-059 §1). Para bancos de desenvolvimento, o backfill de `team_id` usa a equipe mais antiga da organização (`min(created_at)`); serviço de organização sem equipe impede o `not null` e o banco local é recriado.
  - `service_items`: `type text not null default 'song' check (...)`, `title text`, `notes text`, `duration_minutes int check (1..600)`, `song_id` nullable, `check ((type = 'song') = (song_id is not null))` e `check (type = 'song' or char_length(btrim(title)) between 1 and 120)`. A `unique (service_id, position)` passa a `deferrable initially deferred` para permitir renumerar numa transação.
  - Guarda de status: trigger `before insert or update on services` barra `status` diferente do atual (ou ≠ `draft` no insert) fora da RPC, como no B2. RPC `transition_service(p_service_id, p_to)` `security definer`, `set search_path = ''`, valida a transição (RN-02) e `service.transition`.
  - Guarda de edição: serviço final não aceita update de informações nem escrita em `service_items` (RN-06), na política/trigger.
  - RLS: substitui "organization admins can write services/service items" por políticas com `app.has_permission(organization_id, team_id, 'service.*')`; leitura mantém "membro da organização", com a regra de ativo do §4.
  - As sete funções do Stage listadas acima: `create or replace` com o filtro `type = 'song'`. `create_target_stage_session` continua exigindo owner/admin (ver decisões).
- **Dexie:** nova `this.version(13)` (a v12 é do B2; confirmar no PR): `services: 'id, organizationId, teamId, startsAt, status, updatedAt'`; `upgrade()`: `planned → draft`, `confirmed → ready`, `teamId` = equipe local mais antiga da organização ou `null` (o pull corrige); `serviceItems` recebe `type = 'song'`. Teste de upgrade v12 → v13.
- **Sync (`TargetSyncEngine`):** mapeia os campos novos. `status` **não** sobe no push (só por RPC) e o pull o sobrescreve sem LWW; demais campos LWW (ADR-026). Transição offline entra na fila; recusa do servidor reverte e avisa. Itens de um serviço sobem depois do serviço e numa mesma transação de push (renumeração com a `unique` deferida).
- **RLS / permissões:** acrescentar `service.*` ao `PERMISSIONS.md` (seção 3) e casos negativos (abaixo); a UI não é mecanismo de segurança.

## Fora do escopo
- Vagas, atribuições e escala (B4); aplicar repertório, materiais e ensaio (B6) — áreas aparecem como placeholders.
- Templates de serviço (Fase 4); calendário; recorrência.
- Ligar automaticamente `in_progress` ao início do Stage (ver decisões).
- Mudar quem cria a sessão de palco (MD).

## Plano de testes
- **Domínio / application:** todas as transições (válidas e inválidas); validação de item por tipo; reordenação e renumeração com tipos mistos; casos de uso com sucesso e `errors`.
- **Repositórios (fake-indexeddb):** upgrade v12 → v13 (status migrado, `teamId`, `type = 'song'`); índices `teamId`/`status`.
- **Sync:** `toRow`/`fromRow` dos campos novos; push sem `status`; pull sobrescreve `status`; recusa de transição reverte (`src/platform` mockado).
- **UI (papel/label):** lista agrupada; criar serviço; ordem com subir/descer por teclado e anúncio da nova posição; item não musical com título; ações conforme `permissions.ts`; estado final sem edição.
- **RLS / SQL (`scripts/db`):** Owner, Admin, Líder da equipe × Líder de outra equipe × Membro × outra organização × sem vínculo × anônimo × `inactive`; casos S1–S8 abaixo; `check`s de item; FK composta (equipe de outra organização); renumeração com `unique` deferida.
- **Regressão do Stage:** serviço com itens mistos: snapshot, `next`/`previous`/`goto`/`prepare_next` só em músicas; serviço só com itens não musicais não cria sessão.
- **Manual:** mobile/tablet; offline (leitura e fila); Stage com itens mistos.

Casos negativos novos (para o `PERMISSIONS.md`):
| # | Caso | Esperado |
|---|---|---|
| S1 | Líder da equipe A cria ou edita serviço da equipe B | negado |
| S2 | Membro cria, edita ou transiciona serviço | negado |
| S3 | `update services set status` direto, por qualquer papel | negado (só RPC) |
| S4 | Transição inválida pela RPC (`completed → draft`) | negado |
| S5 | Serviço com `team_id` de outra organização | negado (FK composta) |
| S6 | Editar serviço ou ordem em `completed`/`cancelled` | negado |
| S7 | Líder exclui serviço fora de `draft` | negado |
| S8 | Líder `inactive` da equipe do serviço edita | negado |

## Riscos
| Risco | Mitigação |
|---|---|
| `song_id` nulo quebra consumidores | Lista completa acima; regressão do Stage obrigatória |
| Renumerar a ordem esbarra na `unique (service_id, position)` no push | `unique` deferida + push dos itens de um serviço numa transação; teste de servidor |
| Ajuste do Stage vira feature (D6) | Só o filtro `type = 'song'` nas sete funções; nenhuma UI nova no Stage |
| Equipe excluída com serviços | `on delete restrict`; Admin cancela/move antes (decisão pendente) |
| Status offline divergente | Status só por RPC, pull autoritativo, reversão com aviso |

## Issues
- [ ] Épico B3 / VS-02
- [ ] `feat/service-schema` — migration + RLS + guardas + Stage `type = 'song'` + testes `scripts/db` (backend-engineer; depende do B2 #57)
- [ ] `feat/service-domain` — domínio + application + Dexie v13 + sync + testes (core-engineer)
- [ ] `feat/service-list-detail` — lista e detalhe (§52.2) com ordem acessível (ui-engineer)
- [ ] `fix/stage-song-items-only` — ajustes de cliente do Stage (`getServiceStageSongs`, `stageSessionState`) + regressão (core-engineer)
