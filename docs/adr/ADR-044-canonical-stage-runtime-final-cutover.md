# ADR-044 — Canonical Stage Runtime Final Cutover

## Status
Accepted

## Decision

The canonical Stage runtime is now fully target-domain based:

`Organization → Service → ServiceItem → StageSession → StageSessionState`.

Canonical Stage application code uses:

- `StageExecutionService`;
- `StageRealtime`;
- `StageSession`;
- `StageSessionState`;
- target Stage RPCs;
- `get_service_stage_songs`.

Canonical Stage routes are:

- `/stage/service-session/:stageSessionId`;
- `/stage/service-session/:stageSessionId/musician`.

The canonical Stage RPCs now mutate `stage_session_states` directly and update `stage_sessions` directly. They no longer invoke legacy `band_stage_*` RPCs.

## Compatibility boundary

Legacy routes remain available for existing links:

- `/stage/session/:sessionId`;
- `/stage/session/:sessionId/musician`;
- legacy Band/Setlist Stage services and persistence.

Those routes use the legacy Stage runtime deliberately. They are compatibility infrastructure and are not dependencies of canonical Stage.

Legacy tables, migrations, RPCs and Dexie stores are retained until the explicit legacy migration gates are satisfied.

## Realtime

Canonical Stage uses only:

`stage-session:<StageSession.id>:state`

Presence, Broadcast and Postgres state-change reconciliation use that channel. Canonical realtime does not fall back to the legacy `band-stage:<id>` transport.

## Migration consequence

There is no remaining application-runtime dependency from canonical Stage to `BandStageService` or `BandStageRealtime`.

The remaining legacy Stage code exists only to serve legacy routes and historical data.

## Validation gates

Before deleting legacy Stage infrastructure:

1. No canonical route imports legacy Stage services.
2. No target Stage RPC invokes legacy Stage RPCs.
3. No canonical realtime transport uses the legacy channel.
4. Existing legacy links remain intentionally supported.
5. Supabase/RLS/RPC dependencies of legacy routes are audited.
6. Dexie legacy stores and sync queues are audited.
7. Offline and online Stage flows are validated.
8. Full test suite and production build are validated.
