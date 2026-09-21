# ADR-036 — Legacy Setlist/Standalone Stage Compatibility Boundary

**Status:** Accepted  
**Date:** 2026-09-21

## Context

The target CANTUM model distinguishes:

- **Repertoire**: reusable, organization-owned collection of songs.
- **Service**: operational occurrence with ordered ServiceItems.
- **StageSession**: execution context derived from a Service.

The primary Repertoire UI has already moved to `Repertoire`/`RepertoireItem`. The canonical Stage entry points have also moved to target `StageSession.id`.

The repository still contains legacy Setlist APIs, Dexie tables, and the standalone routes:

- `/stage/setlist/:setlistId`
- `/stage/song/:songId`

These paths are still useful as compatibility infrastructure and are not equivalent to the target Service -> StageSession flow.

## Decision

Keep the remaining Setlist and standalone Stage implementation as **explicit legacy compatibility infrastructure** for this migration slice.

Specifically:

1. Do not create new target features on `Setlist`/`SetlistSong`.
2. Do not map `Repertoire` directly into the operational Stage model.
3. Do not delete legacy Setlist repositories, application services, Dexie tables, or `get_band_stage_setlist` yet.
4. Keep `/stage/setlist/:setlistId` and `/stage/song/:songId` available until their consumers and migration requirements are fully resolved.
5. The canonical operational Stage flow remains:
   `Organization -> Service -> ServiceItems -> StageSession -> StageSessionState`.
6. Future removal of standalone Setlist Stage requires an explicit migration of any remaining callers to Service/StageSession semantics, followed by test and offline/online validation.

## Consequences

- Legacy Setlist code remains intentionally present and should not be interpreted as the target architecture.
- Repertoire remains reusable and does not acquire operational Stage state.
- Stage migration can continue independently without a destructive cutover.
- The next removal gate is consumer discovery and migration, not mechanical renaming.

## Removal gates

Legacy Setlist/standalone Stage code may only be removed after:

1. no active UI/application consumer requires Setlist persistence;
2. no sync path requires legacy Setlist tables;
3. no Stage compatibility RPC depends on Setlist input;
4. target Service/StageSession covers the required operational flow;
5. tests cover the migrated path;
6. offline/online behavior is verified.
