# ADR-031 — Stage reads from ServiceItems

**Status:** Accepted  
**Date:** 2026-09-20

The live Stage runtime keeps its existing session/realtime/control implementation, but its musical read model now comes from the target domain.

## Target read path

```
legacy BandStageSession
       |
       v
target StageSession
       |
       v
Service
       |
       v
ServiceItems
       |
       v
canonical Songs
```

## Implementation

- `get_stage_session_by_legacy_id` resolves the target StageSession.
- `get_service_stage_songs` reads the Service's ordered ServiceItems and canonical Songs.
- `BandStagePage` prefers this target read path.
- Legacy `get_band_stage_setlist` remains as a compatibility fallback.

## Preserved behavior

- Existing BandStage realtime channel.
- Existing revision/state reconciliation.
- Existing MD commands.
- Existing presence/readiness behavior.
- Existing legacy session URL and runtime identifier.

This is intentionally a read-model migration, not a Stage runtime rewrite.

## Next boundary

Once all Stage consumers use the target model, the legacy `get_band_stage_setlist` read RPC can be retired and Stage state can reference target ServiceItem/Song identifiers directly.
