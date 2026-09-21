# ADR-041 — Legacy Dexie Compatibility Gates

## Status

Accepted.

## Context

CANTUM now has canonical offline/local stores for Organization, Team, Song ownership, Repertoire, Service, ServiceItem and Assignment, with a dedicated `targetSyncQueue`.

The legacy Band runtime still has independent Dexie stores and a dedicated `bandSyncQueue`. Those stores must remain available while compatibility routes, legacy Stage fallbacks, legacy synchronization and existing offline data are still in use.

Deleting the legacy stores from the Dexie schema too early could discard local data or break an existing compatibility path.

## Decision

Legacy Band Dexie stores remain compatibility infrastructure:

- `bands`
- `bandMembers`
- `bandSongs`
- `bandSongMemberStates`
- `bandSetlists`
- `bandSetlistSongs`
- `bandSyncQueue`

New target-domain features must not write to these stores.

Target-domain writes continue through the target repositories and `targetSyncQueue`.

Store removal is gated by all of the following:

1. application consumers of the legacy stores are removed;
2. Supabase/RPC/RLS consumers of the legacy persistence are removed;
3. legacy sync consumers are removed;
4. legacy links/session compatibility requirements are resolved;
5. offline/online validation has passed;
6. no legacy local records remain;
7. `bandSyncQueue` is empty.

The gate is implemented in `src/db/legacyDexieCompatibility.ts` and intentionally reports readiness without deleting data.

## Consequences

- Existing users keep their local legacy data during the migration.
- The target offline path remains isolated from the legacy Band sync queue.
- Migration progress can be measured explicitly instead of inferred from the Dexie schema.
- A future Dexie version may remove legacy stores only after the gate reports readiness and the application-level consumers have already been removed.
- No destructive cleanup is introduced in this migration block.

## Non-goals

This ADR does not migrate or delete existing legacy local records. It does not change Supabase migrations and does not remove legacy repositories or compatibility services.
