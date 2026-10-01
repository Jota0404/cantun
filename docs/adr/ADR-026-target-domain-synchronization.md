# ADR-026 — Target domain synchronization

**Status:** Accepted  
**Date:** 2026-09-20

## Decision

The target CANTUM domain receives a separate synchronization pipeline while the legacy sync engines remain unchanged.

Target entities:

- Organization
- OrganizationMembership
- Team
- TeamMembership
- OrganizationSong
- Repertoire
- RepertoireItem
- Service
- ServiceItem
- Assignment

The target pipeline uses a dedicated Dexie `targetSyncQueue` and `TargetSyncEngine`.

## Rules

1. Local writes are persisted to Dexie first.
2. Writes are queued for Supabase synchronization.
3. Target synchronization is independent from the legacy `SyncEngine` and `BandSyncEngine`.
4. Organization creation uses the existing `create_organization` security-definer RPC because direct organization inserts are intentionally not exposed.
5. Target synchronization uses Supabase RLS as the authorization boundary.
6. Pull operations use the authenticated user's RLS-visible rows.
7. Legacy sync behavior is not changed by this migration.
8. Repositories remain usable offline; queued operations are retried by the target engine when synchronization is available.

## Migration rule

A target entity is allowed to become an application authority only after its local repository and synchronization path are available.

This means new Organization/Team/Repertoire/Service features can be built against the target model without making the existing Band sync infrastructure responsible for target entities.

## Consequence

CANTUM now has two explicit sync generations:

- **Legacy:** songs/setlists/Band entities and their existing queues.
- **Target:** Organization/Team/Repertoire/Service/Assignment and `targetSyncQueue`.

The two pipelines coexist during migration and can be retired independently.
