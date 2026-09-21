# ADR-030 — Service to StageSession bridge

**Status:** Accepted  
**Date:** 2026-09-20

The Service domain is now the target operational entry point for Stage.

## Target relationship

```
Organization
  -> Service
       -> ServiceItem
       -> Assignment
       -> StageSession
            -> legacy BandStageSession
                 -> existing realtime/state engine
```

## Implementation

- Added target `StageSession` domain type.
- Added `stage_sessions` target table.
- Added RPCs:
  - `create_service_stage_session`
  - `start_service_stage_session`
  - `end_service_stage_session`
  - `get_service_stage_session`
- Added `stageSessionService`.
- Service workspace can initiate the stage.
- The bridge reuses the existing BandStage session/runtime instead of duplicating realtime logic.

## Compatibility rule

The existing BandStage realtime, revision, presence and command implementation remains authoritative for live execution.

The new StageSession is the target domain context and stores the link to the legacy runtime session.

No Stage realtime rewrite is performed in this block.

## Current limitation

The bridge currently requires the Service to contain at least one repertoire-backed ServiceItem. This is intentional during migration because the legacy Stage runtime still consumes a BandSetlist/Repertoire-compatible context.

Once the Stage read path is migrated to ServiceItems directly, this constraint can be removed.

## Next boundary

The next migration can replace the legacy Stage read path with:

```
StageSession
  -> Service
  -> ServiceItems
  -> canonical Song
```

while preserving the existing realtime transport and execution semantics.
