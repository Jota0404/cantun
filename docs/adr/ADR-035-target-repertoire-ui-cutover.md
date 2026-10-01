# ADR-035 — Target Repertoire UI cutover

**Status:** Accepted  
**Date:** 2026-09-21

## Context

The target content/service vertical slice is implemented, but the primary Repertoire navigation still consumed the legacy `Setlist` model while a second target-only detail page existed under the Organization workspace.

## Decision

Make the target Repertoire model the canonical user-facing Repertoire consumer:

    /repertoires
    /repertoires/:repertoireId
    /organizations/:organizationId/repertoires/:repertoireId
            -> Repertoire / RepertoireItem

The two detail routes share one UI consumer. The legacy `Setlist` repositories/application services remain available only for compatibility paths that still depend on the old Stage/Band runtime.

No destructive database or Supabase removal is performed in this slice.

## Consequences

- New Repertoire navigation no longer creates or mutates legacy Setlists.
- Repertoire ownership is explicitly Organization-scoped.
- The legacy representation can be removed later after all Stage/Band dependencies are migrated.
- The root Repertoire screen now requires an existing Organization when creating a new Repertoire.


## Target repertoire editing slice — complete

The canonical Repertoire UI now supports the core lifecycle without routing through legacy Setlist services: rename, duplicate, delete, add/remove songs, and reorder RepertoireItems. These operations use the target Repertoire/RepertoireItem repositories and target sync queue. Legacy Setlist APIs remain intact for compatibility paths and are not removed in this slice.
