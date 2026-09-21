# ADR-042 — Target Stage Offline Persistence

## Status

Accepted.

## Context

The target Stage domain already has canonical `StageSession` and `StageSessionState` records in Supabase, while the local-first target sync path previously synchronized Organization, Team, Repertoire and Service data but not Stage session records.

This left the target Stage boundary dependent on the remote RPC path for session identity even though the rest of the target domain had local persistence.

## Decision

Add dedicated Dexie stores for:

- `stageSessions`
- `stageSessionStates`

Add both entities to the target pull/sync engine.

`StageSession` is a writable target entity and can participate in the target sync queue.

`StageSessionState` is a remote-authoritative operational projection. It is synchronized from Supabase but is not placed in the target write queue. Stage commands continue through the Stage RPC contract, which updates the authoritative state and its compatibility projection.

The Stage session application service now caches successful create/start/end/get results locally and can read an existing session from Dexie when the remote session lookup is unavailable.

## Consequences

- Target Stage session identity survives temporary connectivity loss after it has been synchronized locally.
- Stage state becomes available through the same local-first persistence boundary as the rest of the target domain.
- Operational Stage state cannot be accidentally treated as an ordinary offline mutation queue item.
- Legacy Band Stage remains the compatibility execution/realtime implementation until its explicit migration gates are cleared.
