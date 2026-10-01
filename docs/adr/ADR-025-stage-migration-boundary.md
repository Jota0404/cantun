# ADR-025 — Stage migration boundary

**Status:** Accepted  
**Date:** 2026-09-20

## Context

The CANTUM Stage implementation is already a working operational subsystem. It contains:

- stage session state;
- revision-based event reconciliation;
- realtime broadcast;
- presence;
- current song/key state;
- musical-role-aware Stage data;
- offline/local-first presentation.

The domain model is still named around the legacy Band/Setlist concepts:

- `BandStageSession`;
- `bandId`;
- `setlistId`;
- `get_band_stage_snapshot`;
- `get_band_stage_setlist`;
- `band-stage:<sessionId>`.

The target domain now separates:

- Organization;
- Team;
- Song;
- Repertoire;
- Service;
- ServiceItem;
- Assignment;
- Stage Session.

## Decision

Stage will migrate incrementally and will **not** be rewritten as part of the Organization/Team migration.

The target relationship is:

```
Organization
  -> Service
      -> ServiceItem -> Song
      -> Assignment
      -> StageSession
```

A Stage Session is an execution context derived from a Service. It is not a replacement for Service and it is not a second scheduling model.

The existing realtime/reconciliation implementation remains authoritative for Stage behavior until the target persistence bridge is complete.

## Migration boundary

The migration will happen in this order:

1. Preserve existing Stage persistence and realtime behavior.
2. Establish a mapping between legacy `BandStageSession` and target `Service` / Stage Session.
3. Establish the mapping between legacy `setlistId` / `BandSetlistSong` and target `Repertoire` / `RepertoireItem` / `ServiceItem`.
4. Replace Stage data retrieval with canonical `Song` records.
5. Replace legacy membership/function lookup with OrganizationMembership + TeamMembership + Musical Functions.
6. Only after all consumers are migrated, remove legacy Stage dependencies.
7. Keep the realtime channel and revision protocol stable unless a separate ADR explicitly changes it.

## Explicit non-goals

This ADR does not:

- redesign the Stage UX;
- replace Supabase Realtime;
- replace presence;
- replace revision reconciliation;
- delete legacy Stage tables or RPCs;
- rename every Stage file mechanically.

## Compatibility rule

During migration, legacy Stage APIs may act as compatibility facades, but new application code must not introduce additional dependencies on:

- `BandStageSession` as a new domain authority;
- `BandSetlist` as a new content model;
- `BandSong` as a new canonical song model.

New Stage integrations should reference Service, ServiceItem, Repertoire, RepertoireItem and Song whenever the corresponding target entity is available.

## Production gate

The legacy Stage layer cannot be removed until all of the following are true:

- every active Stage session has a target Service relationship;
- every Stage item resolves to canonical Song;
- Stage no longer requires BandSetlist/BandSong for its primary read path;
- realtime snapshot/event behavior remains compatible;
- presence still resolves the correct participants;
- offline/local-first behavior is validated;
- old Stage RPCs have no remaining application consumers;
- migrations are additive and existing sessions remain readable.

## Consequence

Stage remains temporarily legacy-shaped internally, but its migration path is now explicit. This prevents the Stage subsystem from blocking the broader Organization/Team migration while also preventing new code from deepening the old Band/Setlist dependency.
