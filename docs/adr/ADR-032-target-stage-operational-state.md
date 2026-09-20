# ADR-032 — Target Stage Operational State

**Status:** Accepted

## Context

The CANTUM blueprint defines Stage as the execution surface of a Service. The target model is:

Organization → Service → ServiceItem → StageSession.

The existing Stage runtime still uses legacy BandStage tables, RPCs, realtime channels and compatibility contracts. Replacing that runtime in one step would unnecessarily risk the existing shared execution behavior.

## Decision

Introduce `stage_session_states` as the target operational state owned by `StageSession`.

The target state stores:
- revision;
- current ServiceItem;
- canonical Song;
- current index and key;
- prepared ServiceItem/Song;
- running state;
- MD annotation;
- update timestamp.

During the migration boundary:
1. target Stage reads use `stage_session_states`;
2. target Stage commands are exposed through target RPCs;
3. target RPCs still invoke the existing legacy BandStage RPCs internally;
4. the legacy state is mirrored into the target state after each successful command;
5. the existing realtime channel/event protocol remains intact;
6. legacy Stage state therefore remains a compatibility projection/runtime dependency, not the target application contract.

The target state resolves current and prepared items through `ServiceItems` and canonical `Songs`, never through `BandSong` as the application-level identity.

## Compatibility

The migration is additive.

If a target StageSession mapping is unavailable, the application keeps the existing legacy Stage path. This preserves compatibility while migrations are deployed incrementally.

No legacy Stage table or realtime contract is removed by this ADR.

## Consequences

### Positive

- Stage operational state now has a target-domain home.
- Application commands can move away from Band naming without rewriting realtime.
- Canonical Song and ServiceItem identities become the source for target Stage state.
- Revision, shared execution, presence and event ordering remain preserved.
- The next migration can remove legacy state as an authoritative dependency after parity validation.

### Remaining migration

The legacy BandStage RPCs and state tables remain internal compatibility infrastructure. They can be removed only after:

- target command parity is verified;
- realtime/reconnect/revision-gap behavior is verified;
- offline/local-first behavior is unaffected;
- all Stage consumers use target contracts;
- the legacy state projection is no longer required.

## Blueprint alignment

This follows the approved CANTUN product baseline: Service is the operational occurrence, ServiceItem is its ordered musical content, and Stage is the execution experience built on top of that operational model.

### Subsequent implementation

The migration also routes Stage lifecycle operations through target RPCs and mirrors legacy state changes into the target state automatically. Stage read data now resolves the current user's Service Assignment musical function when available, with compatibility fallback to `other`.
