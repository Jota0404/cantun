# ADR-033 — Target Stage Route and Execution Facade

- Status: Accepted
- Date: 2026-09-20

## Context

The target Stage domain is already represented by StageSession and StageSessionState, but the live runtime still depends on the legacy BandStageService, legacy realtime channel and legacy session identifier.

The application must move the user-facing flow toward Organization -> Service -> StageSession without rewriting the stable realtime/runtime layer prematurely.

## Decision

1. The Service detail flow starts and navigates using the target StageSession.id.
2. `/stage/service-session/:stageSessionId` is the target user-facing entry route.
3. During migration, that route resolves the target session and bridges to the legacy runtime route internally.
4. StageExecutionService becomes the target-named application facade for live execution while delegating to the compatibility-aware BandStageService implementation.
5. Stage musical-function presentation is derived from target Service-stage song data; it must not require a legacy Band preference lookup for the active session.
6. Existing legacy Stage routes remain available as compatibility routes until all external/internal callers use the target route.

## Consequences

### Positive

- User-facing Stage initiation now follows the target domain.
- Application code can depend on a target-named execution facade.
- Existing realtime, revision, presence and command behavior remain intact.
- The migration remains incremental and reversible.

### Temporary compatibility

- The target route currently resolves to the legacy runtime route.
- BandStageService and legacy Stage domain types remain implementation details of the bridge.
- Legacy routes and realtime channels are not removed at this boundary.

## Exit criteria for the bridge

The redirect and legacy runtime route can be removed only after:

1. Stage realtime accepts StageSession identity directly;
2. Stage presence and commands no longer require band_stage_sessions identity;
3. target Stage snapshots and events are canonical;
4. no active UI/application dependency remains on BandStageService or BandStageSession.

## Related decisions

- ADR-023 — Service vs Stage Session
- ADR-025 — Stage Migration Boundary
- ADR-030 — Service/Stage Session Bridge
- ADR-031 — Stage Reads from Service Items
- ADR-032 — Target Stage Operational State