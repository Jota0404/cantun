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


### Target Stage route/application boundary (ADR-033)

The user-facing Stage flow now starts from `Service -> StageSession`. The target route `/stage/service-session/:stageSessionId` resolves the target session and temporarily bridges into the stable legacy realtime/runtime route. `StageExecutionService` is the target-named application facade. This boundary intentionally preserves the legacy runtime until realtime, presence, commands and session identity can become target-native.

### Target Stage realtime boundary (ADR-034)

The target-native Stage transport boundary is now implemented. `StageSession.id` is the canonical realtime identity, `stage_session_states` is the authoritative state projection, and the target Stage channel is the primary broadcast/Presence transport with legacy fallback. `StageExecutionService` and `SharedExecutionService` expose target-domain application boundaries without inheriting from the legacy runtime. The legacy Stage runtime remains internal compatibility infrastructure until native target command implementations and all legacy consumers are removed.

### Target Repertoire UI cutover

The primary `/repertoires` and `/repertoires/:repertoireId` routes now consume the target `Repertoire`/`RepertoireItem` model. The organization-scoped route `/organizations/:organizationId/repertoires/:repertoireId` uses the same canonical detail consumer. Legacy Setlist repositories and application services remain only as compatibility infrastructure for remaining legacy Stage/Band consumers; they are not used by the primary Repertoire navigation.


## Stage target-entry status

The canonical Stage flow now has target-keyed entries for both the MD/operator view (`/stage/service-session/:stageSessionId`) and musician view (`/stage/service-session/:stageSessionId/musician`). Legacy Stage routes remain as compatibility paths. The target StageSession identity is preserved at the application boundary; legacy execution remains an internal compatibility runtime until the remaining migration gates are cleared.


### Legacy Setlist / standalone Stage boundary (ADR-036)

Legacy `Setlist`/`SetlistSong` persistence and standalone Stage routes remain explicit compatibility infrastructure. They are no longer target-domain entry points and must not receive new target features. Repertoire is not mapped directly to operational Stage; the canonical execution path remains `Organization -> Service -> ServiceItems -> StageSession -> StageSessionState`. Removal is gated on consumer, sync, RPC, test, and offline/online migration validation.


### Target Service operational lifecycle (ADR-037)

Service is now the operational preparation aggregate between Organization/Repertoire and Stage: `Organization -> Service -> ServiceItems -> Assignments -> StageSession`. Target application services support Service editing, ordered ServiceItems, Assignment lifecycle, and target Stage entry. ServiceItems reference canonical Songs and may retain an optional originating Repertoire. Legacy Setlist remains outside this flow.


## Target Team operational UI — complete

The canonical Organization/Team path is now operational in the application:
- Organization detail lists and creates Teams.
- Team detail is scoped by Organization + Team identity.
- Team lifecycle uses the target Team application service.
- Team membership removal is scoped to TeamMembership and does not remove the user from the Organization.
- Organization-level access roles remain distinct from Team membership.
- Team musical functions remain many-to-many on the TeamMembership boundary.
- Team invitations use the target OrganizationInvite API and land directly in the canonical Team route.
- Legacy Band list/detail/invite routes remain compatibility infrastructure and are no longer part of primary navigation.

No destructive removal of legacy Band persistence was performed in this slice.
