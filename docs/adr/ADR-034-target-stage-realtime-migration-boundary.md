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

The current implementation now treats the target StageSession channel as the canonical realtime transport whenever the target subscription is available:

- target Presence/readiness is published first;
- legacy Presence is retained only as a best-effort compatibility mirror;
- target Stage broadcast events are published first;
- legacy broadcast remains a compatibility mirror;
- if the target channel cannot be subscribed, the legacy transport remains the fallback;
- target operational state remains authoritative for reconciliation.

This keeps the migration additive while preventing legacy transport failures from blocking migrated Stage sessions.
