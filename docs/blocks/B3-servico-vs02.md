# B3 — Serviço (VS-02)

> Fase 1 · Esforço: 2–3 semanas · Depende de: B2 (`app.has_permission`), B1 · Spec: [`VS-02-servico.md`](../specs/VS-02-servico.md) · Requisitos: RF-SVC-001…004 · Blueprint §8.2, §8.6, §12, §18.2, §32.2, §48.2, §52.2, §53, §57

## Objetivo
O **Service** vira o centro operacional: pertence a uma equipe, tem estado claro, informações básicas e uma **ordem** que mistura músicas e outros momentos do culto.

## Estado atual
- `Service { id, organizationId, name, startsAt, status: 'planned'|'confirmed'|'completed'|'cancelled', createdByUserId }`, sem `teamId`, local nem observações.
- `ServiceItem { id, serviceId, songId (obrigatório), position, repertoireId? }`; SQL `service_items.song_id not null`.
- RLS: só owner/admin escrevem `services` e `service_items`.
- `serviceService.ts` (create/remove/addServiceItem), `serviceScheduleService.ts` (addSongToService, removeServiceItem com reordenação).
- `ServiceDetailPage` (158 linhas). O Stage navega por `service_items.position` em sete funções SQL (`get_service_stage_songs`, `create_target_stage_session`, `initialize_target_stage_state`, `target_stage_goto/next/previous/prepare_next`).
- Sem dados de produção a migrar (ADR-059 §1).

## Decisões
**ADR-052 — Service operacional** (`Proposed`):
- `team_id not null` com FK composta (equipe da mesma organização), `on delete restrict`. Backfill só em banco de desenvolvimento (equipe mais antiga da organização).
- Estados `draft ↔ ready → in_progress → completed`, mais `cancelled` a partir de qualquer estado não final. Migração: `planned → draft`, `confirmed → ready`. Transições no domínio (`serviceLifecycle.ts`) e só pela RPC `transition_service` (trigger de guarda no `status`).
- `ServiceItem.type`: `song | opening | prayer | preaching | announcement | offering | closing | other` (lista final). `title` obrigatório quando `type ≠ song`; `song_id` obrigatório só quando `type = song` (constraint `check`). `notes`, `duration_minutes` opcionais.
- O Stage continua lendo apenas itens `song`, na ordem: filtro `type = 'song'` nas sete funções (D6).
- Permissão: `service.create/edit/transition` para Owner, Admin e Líder ativo da equipe do serviço; `service.delete` Owner/Admin (Líder só em `draft`); Membro lê.

## Escopo

**Entra:**
1. Spec `docs/specs/VS-02-servico.md` + ADR-052.
2. Migration em `db/migrations/` (próximo número livre): colunas novas, migração de status, `type`/`title`/`notes`/`duration_minutes` em `service_items`, `song_id` nullable com `check`, RLS via `app.has_permission`.
3. Domínio: máquina de estados, validação de item, reordenação genérica.
4. Application: `createService` (com equipe), `updateServiceInfo`, `transitionService`, `addServiceItem(type)`, `moveServiceItem`, `removeServiceItem`.
5. Dexie: nova `version(13)` (índices `teamId`, `status`), upgrade dos registros locais; sync.
6. UI — lista de serviços: próximos / em planejamento / realizados (sem calendário, §8.2).
7. UI — detalhe do serviço (§52.2): Visão geral · **Ordem** (com arrastar ou subir/descer, acessível por teclado) · Escala (placeholder até o B4) · Repertório/Músicas · Observações. Materiais e Ensaio como placeholders até o B6.
8. Ajuste do Stage para ignorar itens não musicais.

**Não entra:** vagas e atribuições (B4), aplicar repertório ao serviço (B6), templates (Fase 4).

## Entregáveis por PR
1. `docs/vs-02-spec` · 2. `feat/service-schema` · 3. `feat/service-domain` · 4. `feat/service-list-detail` · 5. `fix/stage-song-items-only`.

## Critérios de aceite
- O Líder cria um serviço da sua equipe com nome, data/hora, local e observações; nasce em `draft`.
- A ordem aceita itens não musicais e músicas, reordenáveis.
- Transições inválidas (ex.: `completed → draft`) são recusadas no domínio e no banco.
- O Stage do serviço mostra só as músicas, na ordem, e anterior/próxima respeita a ordem (§34.1, ex. 3).
- Registros locais (Dexie) aparecem com estado migrado; o pull atribui a equipe.

## Testes
Unit (estados, validação de item, reordenação), RLS (líder de outra equipe não edita), integração (migração Dexie), UI (ordem acessível por teclado), regressão do Stage.

## Riscos
- `song_id` nullable quebra consumidores → mapeados na spec (7 funções SQL, 7 arquivos do cliente).
- Renumeração da ordem × `unique (service_id, position)` no push → `unique` deferida e push dos itens numa transação.
