# ADR-052 — Service operacional: equipe, estados e ordem genérica

- **Status:** Accepted (owner, 2026-10-09, com as 6 recomendações da spec VS-02)
- **Data:** 2026-10-09
- **Decisor:** Jota (owner)
- **Escopo:** Service / ServiceItem / Stage (leitura)
- **Bloco:** B3 (VS-02) · Requisitos RF-SVC-001…004
- **Relacionados:** ADR-014, ADR-020, ADR-026, ADR-047, ADR-051, ADR-059 · Spec: [`docs/specs/VS-02-servico.md`](../specs/VS-02-servico.md)

## Contexto

Hoje `services` pertence só à organização, tem estados `planned | confirmed | completed | cancelled` e nenhuma informação além de nome e data. `service_items.song_id` é `not null`: a ordem só tem músicas. Só owner/admin escrevem. O Blueprint §8.6, §18.2, §48.2 e §53 pedem um serviço ligado à equipe, com estados `draft | ready | in_progress | completed | cancelled` e uma ordem em que música é um tipo de item entre outros. O B2 (ADR-051) trouxe o Líder e `app.has_permission`. O ADR-059 eliminou dados de produção a migrar.

## Decisão

1. **Equipe:** `services.team_id not null`, com FK composta `(organization_id, team_id) → teams(organization_id, id)` para impedir equipe de outra organização. `on delete restrict`.
2. **Estados:** `draft ↔ ready → in_progress → completed`; `cancelled` a partir de qualquer estado não final; `completed` e `cancelled` são finais. `planned → draft`, `confirmed → ready`. Tabela de transições pura no domínio (`serviceLifecycle.ts`) e repetida na RPC `transition_service`, única via de mudança de `status` (trigger de guarda, como `role`/`status` no ADR-051). O pull do sync é autoritativo para `status`.
3. **ServiceItem genérico:** `type ∈ { song, opening, prayer, preaching, announcement, offering, closing, other }`; `song_id` obrigatório se e só se `type = song`; `title` obrigatório quando não é música; `notes` e `duration_minutes` opcionais. Garantido por `check`. `unique (service_id, position)` passa a deferida.
4. **Stage (D6):** as funções do Stage filtram `type = 'song'`; a navegação por `position` continua igual. Service ≠ StageSession: o B3 não liga o estado do serviço ao do Stage.
5. **Permissões:** capacidades `service.create`, `service.edit`, `service.transition` (Owner, Admin, Líder ativo da equipe do serviço) e `service.delete` (Owner, Admin; Líder só em `draft`), via `app.has_permission`. Leitura: membro ativo da organização.

## Alternativas consideradas

- **Tabela separada para itens não musicais:** duplica ordenação e quebra a ordem única; rejeitada.
- **`team_id` opcional:** mantém serviços "da organização" sem dono operacional e complica a permissão do Líder; rejeitada (sem dados de produção a preservar).
- **Status por escrita direta + LWW:** permitiria transições inválidas por sync offline; rejeitada.
- **`in_progress` automático ao iniciar o Stage:** acopla Service e StageSession; adiada (decisão do owner).

## Consequências

- Sete funções SQL do Stage recebem `create or replace` com um filtro; cliente do Stage ajusta a leitura de itens.
- Dexie ganha uma `version()` (índice `teamId`, upgrade de status e `type`).
- `PERMISSIONS.md` ganha as capacidades `service.*` e os casos S1–S8.
- Excluir equipe com serviços passa a exigir cancelar/mover antes.
