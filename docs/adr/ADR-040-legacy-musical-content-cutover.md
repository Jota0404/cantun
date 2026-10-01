# ADR-040 — Legacy Musical Content Cutover

## Status

Accepted.

## Context

The canonical content model is now based on:

- `Song` as the reusable musical entity;
- `OrganizationSong` as organization ownership/context;
- `Repertoire` and `RepertoireItem` as reusable collections;
- `ServiceItem` as the operational service order.

Legacy `BandSong`, `BandSetlist` and `BandSetlistSong` remain in Dexie/Supabase because existing users and old Stage sessions may still depend on them.

The existing Supabase migrations already establish mappings from legacy Band content to canonical Song/Repertoire records.

## Decision

1. Canonical application flows must create and mutate `Song`, `OrganizationSong`, `Repertoire`, `RepertoireItem`, `ServiceItem` and related target entities.
2. Legacy Band content is read-only compatibility infrastructure from the perspective of new target features.
3. Existing legacy identifiers are resolved through explicit bridge mappings rather than duplicated into new target entities.
4. Target Stage reads canonical ServiceItems. Legacy Stage setlist reads remain available only when a target StageSession mapping is unavailable.
5. Navigation from the remaining legacy Stage UI points to the canonical Organization surface.
6. The legacy Dexie stores and Band sync queue remain until migration gates are satisfied; they are not removed merely because canonical equivalents exist.
7. No new feature may introduce a dependency on BandSong/BandSetlist persistence.

## Migration gates

Legacy musical-content infrastructure can only be removed after:

- no application consumer depends on the legacy stores;
- no Stage fallback depends on legacy setlists;
- no Supabase RPC/RLS path depends on legacy content;
- no offline migration path requires legacy data;
- existing legacy links and sessions have a defined compatibility outcome;
- offline/online validation succeeds;
- the complete automated test suite passes.

## Consequence

The migration is now a controlled compatibility boundary rather than a parallel domain. Canonical content is the only direction for new development, while legacy content remains available solely to protect existing data and sessions.
