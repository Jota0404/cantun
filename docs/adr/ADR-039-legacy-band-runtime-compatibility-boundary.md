# ADR-039 — Legacy Band Runtime as Compatibility Boundary

## Status

Accepted.

## Context

The canonical CANTUM domain is now:

`Organization → Team → Service → ServiceItem → StageSession → StageSessionState`.

The application still contains legacy `Band`, `BandMember`, `BandSong`, `BandSetlist` and standalone Band Stage infrastructure. These consumers remain necessary while existing local data, Supabase RPCs, realtime channels, offline queues and old links are being migrated.

The active Stage UI already accepts the canonical `StageSession.id` through the target routes, while the runtime service keeps the legacy session identity as an internal compatibility key.

## Decision

1. Legacy Band application services and repositories are compatibility infrastructure, not new domain APIs.
2. Canonical routes must resolve to Organization/Team/Service/StageSession identities.
3. Target Stage routes may use the existing Stage UI during migration, provided:
   - the external identity is `StageSession.id`;
   - songs are loaded from canonical ServiceItems;
   - Stage commands/read state resolve through the target Stage RPCs when a target session mapping exists;
   - legacy RPCs are used only when no target mapping exists.
4. Legacy Band sync remains isolated from TargetSyncEngine. It must not become the synchronization path for new Organization/Team/Service data.
5. New features must not introduce new dependencies on `BandRepository`, `BandMemberRepository`, `BandSongRepository`, `BandSetlistRepository` or standalone Band Stage RPCs.
6. Removal of legacy infrastructure requires explicit migration gates:
   - no active UI consumers;
   - no Dexie consumers;
   - no Supabase/RPC/RLS consumers;
   - no sync consumers;
   - old-link compatibility is no longer required;
   - offline/online validation passes;
   - full test suite passes.

## Consequences

The legacy runtime can continue serving existing sessions without forcing a destructive migration. At the same time, the canonical target domain remains the only destination for new product flows.

The remaining migration work is therefore consumer-by-consumer replacement, followed by removal only after the gates above are satisfied.
