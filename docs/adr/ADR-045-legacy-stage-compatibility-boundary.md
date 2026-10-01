# ADR-045 — Legacy Stage Isolated to Compatibility Routes

## Status
Accepted

ADR-044 completed the canonical Stage runtime cutover. This ADR records the resulting ownership boundary.

### Canonical

All new Stage work must use:

`StageExecutionService → StageRealtime → target Stage RPCs → stage_session_states`.

Canonical Stage identities are always `StageSession.id`.

### Legacy

The following are compatibility-only:

- `BandStageService`;
- `BandStageRealtime`;
- `band_stage_sessions`;
- `band_stage_states`;
- legacy Stage RPCs;
- legacy standalone Stage routes;
- legacy Band/Setlist Stage repositories and sync infrastructure.

No new target feature may add a dependency on these components.

### Removal

Legacy Stage infrastructure may be removed only after:

- old route/link compatibility is no longer required;
- legacy consumers are absent;
- legacy Supabase RPC/RLS dependencies are absent from the canonical application;
- legacy Dexie/sync consumers are migrated;
- offline/online validation passes;
- the complete test suite and production build pass.

Until then, legacy Stage remains read/execute compatibility infrastructure, not part of the target domain.
