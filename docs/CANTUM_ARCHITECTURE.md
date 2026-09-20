# CANTUM Architecture

> Status: baseline de migração — Fase 0
>
> Produto: CANTUM
>
> Fonte de verdade de produto: CANTUM Project & Product Blueprint v1.1 — Approved

## 1. Authority

A arquitetura deve respeitar a seguinte hierarquia:

1. CANTUM Project & Product Blueprint — produto e UX.
2. ADRs e documentação arquitetural — decisões técnicas.
3. Feature specs/issues — escopo de implementação.
4. Código existente — implementação atual, não autoridade sobre o modelo futuro.

A evolução deve ser incremental e preservar capacidades existentes sempre que compatíveis com o Blueprint.

## 2. Core domain vocabulary

### Organization
Raiz organizacional dos dados e recursos do CANTUM.

### Team
Unidade operacional pertencente a uma Organization.

### Membership
Relação de um usuário com uma Organization ou Team.

### Access Role
Define permissões de acesso.

### Musical Function
Define a função musical/técnica de uma pessoa. Não é equivalente a Access Role.

### Song
Entidade musical central e reutilizável.

### Repertoire
Coleção reutilizável e ordenada de Songs.

### Service
Contexto operacional de uma ocasião/serviço.

### Service Order / Service Item
Estrutura operacional que define a ordem e os itens executados em um Service.

### Assignment
Atribuição de uma pessoa a uma necessidade/função de um Service.

### Stage
Modo operacional de execução musical. Deve permanecer rápido, legível, escuro, responsivo e tolerante a instabilidade.

## 3. Target relationship

```
User
  |
  +-- OrganizationMembership
            |
            v
      Organization
        |
        +-- Team
        |     |
        |     +-- TeamMembership
        |           +-- Access Role
        |           +-- Musical Functions
        |
        +-- Songs
        |
        +-- Repertoires
        |     +-- RepertoireItems -> Song
        |     |
        |     +-- Services
        |           +-- ServiceItems -> Song/Repertoire
        |           +-- Assignments
        |
        +-- Services
              +-- Order / ServiceItems
              +-- Assignments
              +-- Rehearsals
              +-- Materials
```

Operational flow:

```
Organization
   -> Service
   -> Order
   -> Songs / Repertoire
   -> Assignments
   -> Preparation / Rehearsal
   -> Stage
   -> History
```

## 4. Migration map

| Current concept | Target concept | Strategy |
|---|---|---|
| Band | Organization + Team | Migrate |
| BandMember | OrganizationMembership / TeamMembership | Migrate |
| BandMemberRole | Access Role | Refactor |
| MusicalRole | Musical Function | Refactor |
| BandSong | OrganizationSong -> Song | Migrate through mapping; remove duplicated representation |
| BandSongMemberState | Contextual member/song state | Reevaluate during Service/Stage migration |
| BandSetlist | Repertoire | Migrate through Organization ownership |
| BandSetlistSong | RepertoireItem | Migrate |
| Setlist | Repertoire | Refactor/migrate after target ownership is stable |
| SetlistSong | RepertoireItem | Refactor |

## 5. Explicit boundaries

- Repertoire is reusable; Service is operational.
- Organization ownership is distinct from Team membership.
- Access Role is distinct from Musical Function.
- Arrangement is a reserved domain concept; do not persist it as a first-class entity prematurely.
- Network is not part of the Core critical path.
- Stage is preserved and migrated incrementally rather than rewritten.
- Dexie/local-first and Supabase/sync remain complementary layers.

## 6. Migration rules

Do not perform global mechanical renames.

Before removing a legacy entity:

1. identify all application/domain/UI dependencies;
2. identify Dexie tables and migrations;
3. identify Supabase tables, RPCs, RLS and sync contracts;
4. migrate references/data;
5. update tests;
6. verify offline and online behavior;
7. remove the legacy representation only when no active dependency remains.

## 7. Fase 0 decisions

The following are frozen as the current architectural baseline:

- CANTUM is not being rebuilt from zero.
- Band is not the target domain model.
- Band is not renamed directly to Team.
- BandSong is not a permanent parallel representation of Song.
- Repertoire and Service are different aggregates/contexts.
- Musical functions may be multiple per person.
- Stage capabilities and existing contracts are preserved.
- Database migrations must be additive/safe; already-applied migrations are not rewritten.

## 8. Synchronization boundary

Target entities use a dedicated `targetSyncQueue` and `TargetSyncEngine`. The legacy `SyncEngine` and `BandSyncEngine` remain unchanged during migration. Local-first repositories persist target entities to Dexie first and queue Supabase synchronization; Organization creation uses the existing secure creation RPC.

See ADR-026 for the synchronization contract.

## 9. Next implementation slice

The first target vertical slice is:

```
Organization
  -> Team
  -> Membership
  -> Access Role
  -> Musical Function
```

Before coding it, audit the current Band persistence, invite flow, application services, UI dependencies, sync queue and Supabase security contracts.


### Stage operational state migration (ADR-032)

Stage now has a target operational state owned by `StageSession`: `stage_session_states`. The target state resolves the active and prepared `ServiceItem`/canonical `Song`, while the existing BandStage RPC/realtime runtime remains an internal compatibility projection during migration. Target application commands mirror successful legacy state transitions into the target state; no legacy Stage runtime is deleted at this boundary.
