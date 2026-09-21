# Legacy Dexie Migration Gates

Status: compatibility stores retained.

## Target stores now available

- `organizations`
- `organizationMemberships`
- `teams`
- `teamMemberships`
- `organizationSongs`
- `repertoires`
- `repertoireItems`
- `services`
- `serviceItems`
- `assignments`
- `stageSessions`
- `stageSessionStates`
- `targetSyncQueue`

## Legacy stores intentionally retained

- `bands`
- `bandMembers`
- `bandSongs`
- `bandSongMemberStates`
- `bandSetlists`
- `bandSetlistSongs`
- `bandSyncQueue`
- legacy `setlists` / `setlistSongs`
- legacy `syncQueue`

They are not deleted or cleared by the target migration.

## Removal gates

A legacy store may only be removed in a future Dexie migration after all of these are true:

1. No application route reads or writes the store.
2. No application service/repository reads or writes the store.
3. No Stage compatibility/fallback path requires the store.
4. No legacy sync engine or queue requires the store.
5. No offline migration/recovery path requires its records.
6. Existing local installations have a defined migration or safe retirement path.
7. Supabase RPC/RLS/compatibility dependencies have been removed or formally retired.
8. Legacy deep links and active sessions have a documented compatibility outcome.
9. Offline and online flows have been validated.
10. Full test suite passes after the removal.

Until every gate is satisfied, the legacy stores remain migration infrastructure.

## Current boundary

New target features must use target stores and `targetSyncQueue`. Legacy stores may only be accessed by explicitly identified compatibility services.

Target Stage state is remote-authoritative and locally cached; it is not written through the target offline mutation queue.
