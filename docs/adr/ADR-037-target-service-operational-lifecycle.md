# ADR-037 — Target Service Operational Lifecycle

**Status:** Accepted  
**Date:** 2026-09-21

## Decision

The target Service aggregate now owns the operational preparation flow between Organization/Repertoire and Stage.

The supported lifecycle is:

`Organization -> Service -> ServiceItems -> Assignments -> StageSession`.

The application layer now supports:

- create/update Service;
- add ServiceItems from canonical Songs;
- remove ServiceItems with position compaction;
- reorder the complete ServiceItem sequence;
- create/update/remove Assignments;
- start a target StageSession from the Service.

ServiceItems remain references to canonical Songs. A ServiceItem may optionally retain the Repertoire that originated the item, but Repertoire remains reusable and does not become operational Stage state.

Local-first writes use the target repositories and target sync queue. Service removal also removes local child ServiceItems and Assignments before removing the Service record.

## UI boundary

Organization detail exposes Services and allows adding canonical songs. Service detail is the operational preparation surface: order editing, assignment editing, and Stage entry.

The canonical Stage route remains `/stage/service-session/:stageSessionId`.

## Compatibility

Legacy Setlist and Band Stage runtime remain outside this aggregate and are covered by ADR-036. No new target Service feature may introduce a dependency on legacy Setlist persistence.

## Validation gate

Before production removal of legacy Service/Stage compatibility:

1. target Service order is verified online and offline;
2. target Assignment lifecycle is verified;
3. Stage reads the target ServiceItems;
4. target sync reconciliation is verified;
5. legacy Stage/Setlist consumers are separately migrated.
