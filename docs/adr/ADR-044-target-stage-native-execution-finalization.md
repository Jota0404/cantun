# ADR-044 — Finalização da transição do Stage para o domínio canônico

- **Status:** Accepted
- **Date:** 2026-10-01
- **Scope:** Stage / Service / Realtime / Supabase

## Context

The canonical Stage application runtime had already moved to:

`Organization → Service → ServiceItem → StageSession → StageSessionState`

The remaining architectural dependency was at the database boundary: the target `target_stage_*` RPCs delegated commands to legacy `band_stage_*` functions and the target session creation path created a legacy BandStage session.

That meant the frontend was target-native while the persistence/execution boundary was still legacy-driven.

## Decision

The target Stage is now authoritative for:

- session creation;
- session lifecycle;
- current item;
- prepared item;
- playback state;
- key;
- MD annotation;
- revision;
- realtime snapshot source.

Target RPCs mutate `stage_sessions` and `stage_session_states` directly.

The canonical target Stage does **not** create, read, or mutate legacy BandStage state during normal execution.

The legacy Stage remains only for:

- existing legacy routes;
- existing persisted legacy sessions;
- backward-compatible links/adapters;
- eventual controlled data retirement.

## Compatibility boundary

`legacy_band_stage_session_id` remains nullable on `stage_sessions` so historical sessions can retain their mapping.

`get_target_stage_snapshot_by_legacy_id` and `get_stage_session_by_legacy_id` remain lookup adapters for compatibility.

No new target session receives a legacy BandStage session.

## Realtime

Canonical realtime uses:

`stage-session:<StageSession.id>:state`

Postgres changes are sourced from `stage_session_states`.

Broadcast and presence operate on the canonical Stage realtime channel.

## Migration rule

No new feature may introduce a dependency from canonical Stage code to:

- `BandStageService`;
- `BandStageRealtime`;
- `band_stage_sessions`;
- `band_stage_states`;
- `band_stage_*` RPCs.

Legacy code may continue to reference those systems only inside explicit compatibility modules/routes.

## Consequence

The Stage migration is now a completed architectural cutover rather than a runtime bridge.

The remaining legacy Stage code is retirement infrastructure, not part of the canonical application path.
