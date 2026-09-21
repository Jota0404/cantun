# ADR-034 — Target Stage Realtime Migration Boundary

**Status:** Accepted  
**Date:** 2026-09-20

## Context

The target Stage domain is now established through:

```
Organization
  -> Service
  -> ServiceItem
  -> StageSession
  -> StageSessionState
```

The user-facing Stage entry already originates from `Service -> StageSession`, and target Stage commands/lifecycle update the target operational state while preserving the legacy runtime.

The remaining compatibility boundary is the live transport:

- legacy broadcast events;
- legacy `band-stage:<legacySessionId>` channel;
- legacy Presence transport;
- legacy session identity exposed to the existing Stage UI;
- legacy RPCs used internally by target commands.

## Decision

Migrate Stage realtime incrementally in the following order:

1. **Target session identity**
   - Target `StageSession.id` becomes the canonical session identity for new Stage realtime.
   - Legacy session IDs remain available only as an internal bridge during migration.

2. **Target state subscription**
   - `stage_session_states` becomes the authoritative realtime state projection.
   - Clients may reconcile from target state without depending on `band_stage_states`.

3. **Target Stage channel**
   - Introduce a target channel namespace based on `StageSession.id`.
   - Preserve the legacy channel while any active consumer still depends on it.

4. **Target Presence**
   - Preserve the existing ephemeral readiness semantics.
   - Move the transport to the target Stage channel without persisting readiness.

5. **Target commands**
   - Commands continue to use target RPCs.
   - Legacy RPC invocation remains an internal implementation detail until target realtime no longer depends on it.

6. **Removal gate**
   - Do not remove `BandStageRealtime`, legacy broadcast events, legacy Stage RPCs, or `band_stage_states` until:
     - target realtime has feature-equivalent reconnect/reconciliation behavior;
     - target Presence/readiness works;
     - MD/musician Stage flows no longer require legacy session identity;
     - offline/online and revision-gap behavior are covered by tests.

## Compatibility rule

This is an additive migration. The existing Stage runtime remains operational while target realtime is introduced.

No global rename or deletion of legacy Stage infrastructure is permitted at this boundary.

## Consequence

Stage now has a clear final migration boundary:

```
Target StageSession
  -> Target StageSessionState
  -> Target Realtime
  -> Target Presence
  -> Target Commands
```

with the legacy runtime temporarily acting as a compatibility implementation underneath.

Related ADRs: 023, 025, 030, 031, 032, 033.
## Implementation status

**Target realtime boundary slice: complete.**

The current implementation now treats the target StageSession channel as the canonical realtime transport whenever the target subscription is available:

- target Presence/readiness is published first;
- legacy Presence is retained only as a best-effort compatibility mirror;
- target Stage broadcast events are published first;
- legacy broadcast remains a compatibility mirror;
- if target transport fails at runtime, the legacy transport is used as the fallback;
- if the target channel cannot be subscribed, the legacy transport remains the fallback;
- target operational state remains authoritative for reconciliation;
- StageSession.id is now canonical at the realtime reconciliation boundary;
- target snapshot reads use get_target_stage_snapshot directly when a target session is available;
- target snapshots/events are normalized before reaching the application;
- target broadcast payloads carry the target StageSession.id, while the legacy mirror retains the legacy session id;
- reconnect and revision-gap reconciliation use the target snapshot path.

The remaining compatibility layer is intentionally internal: the legacy runtime still provides the underlying command implementation and remains available as a runtime fallback. The target Stage UI no longer needs to translate target session identity back into a legacy route.
