# B3 — Serviço (VS-02)

> Fase 1 · Esforço: 2–3 semanas · Depende de: B2 · Requisitos: RF-SVC-001…004 · Blueprint §8.2, §8.6, §12, §18.2, §32.2, §48.2, §52.2, §53, §57

## Objetivo
O **Service** vira o centro operacional: pertence a uma equipe, tem estado claro, informações básicas e uma **ordem** que mistura músicas e outros momentos do culto.

## Estado atual
- `Service { id, organizationId, name, startsAt, status: 'planned'|'confirmed'|'completed'|'cancelled', createdByUserId }`, sem `teamId`, local nem observações.
- `ServiceItem { id, serviceId, songId (obrigatório), position, repertoireId? }`; SQL `service_items.song_id not null`.
- RLS: só owner/admin escrevem `services` e `service_items`.
- `serviceService.ts` (create/remove/addServiceItem), `serviceScheduleService.ts` (addSongToService, removeServiceItem com reordenação).
- `ServiceDetailPage` (158 linhas). O Stage lê `service_items` via `get_service_stage_songs`.

## Decisões
**ADR-052 — Service operacional:**
- `team_id` obrigatório para serviços novos (os antigos são migrados para a equipe principal da organização).
- Estados `draft → ready → in_progress → completed`, mais `cancelled` a partir de qualquer estado não final. Migração: `planned → draft`, `confirmed → ready`. Transições no domínio (`serviceLifecycle.ts`) e validadas por RPC.
- `ServiceItem.type`: `song | opening | prayer | preaching | announcement | offering | closing | other` (lista final na spec). `title` obrigatório quando `type ≠ song`; `song_id` obrigatório só quando `type = song` (constraint `check`). `notes`, `duration_minutes` opcionais.
- O Stage continua lendo apenas itens `song`, na ordem. Ajuste mínimo em `get_service_stage_songs` (D6).
- Permissão: Líder da equipe do serviço, Admin e Owner criam e editam; Membro lê.

## Escopo

**Entra:**
1. Spec `docs/specs/VS-02-servico.md` + ADR-052.
2. Migration: colunas novas, migração de status, `type`/`title`/`notes`/`duration_minutes` em `service_items`, `song_id` nullable com `check`, RLS via `app.has_permission`.
3. Domínio: máquina de estados, validação de item, reordenação genérica.
4. Application: `createService` (com equipe), `updateServiceInfo`, `transitionService`, `addServiceItem(type)`, `moveServiceItem`, `removeServiceItem`.
5. Dexie: nova `version()` (índices `teamId`, `status`), upgrade dos registros locais; sync.
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
- Serviços antigos aparecem com estado migrado e equipe atribuída.

## Testes
Unit (estados, validação de item, reordenação), RLS (líder de outra equipe não edita), integração (migração Dexie), UI (ordem acessível por teclado), regressão do Stage.

## Riscos
- Migrar `song_id` para nullable quebrar consumidores → mapear todos (`grep service_items` / `ServiceItem`) na spec.
- Serviços antigos sem equipe → migration escolhe a equipe principal e registra o caso na spec.
