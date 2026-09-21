
> **Superseded:** ADR-044 finalizes the canonical Stage runtime and removes the legacy runtime from target application execution.

# ADR-043 — Target Stage Realtime Cutover

## Status
Accepted.

## Context
Target Stage command execution was already canonical, but the application facade still depended on the legacy `BandStageService` to create and control realtime sessions.

## Decision
The canonical `StageExecutionService` now owns target realtime sessions directly through `BandStageRealtime` in `targetOnly` mode.

The canonical route uses:

- `StageSession.id` as the only external session identity;
- `stage-session:<StageSession.id>:state` as the realtime channel;
- `stage_session_states` as the authoritative state projection;
- target snapshot RPCs for reconciliation;
- target RPCs for all commands.

The legacy `band-stage:<legacySessionId>` channel is no longer created by the canonical Stage execution facade.

Legacy realtime remains available inside `BandStageRealtime` for legacy routes and compatibility consumers. It is not removed in this slice.

## Presence and broadcast
Target-only sessions use the target channel for Presence and Broadcast. PostgreSQL changes on `stage_session_states` trigger target reconciliation. Command events are published on the target channel.

## Consequences
- Canonical Stage no longer depends on `BandStageService`.
- Legacy realtime remains isolated for legacy consumers.
- The remaining migration work is to audit and migrate legacy route consumers, then remove the compatibility transport once its gates are satisfied.
