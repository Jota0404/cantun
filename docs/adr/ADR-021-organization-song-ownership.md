# ADR-021 — Organization Song Ownership

**Status:** Accepted  
**Date:** 2026-09-20

## Context

CANTUM already has a global `Song` entity and the legacy model also has `BandSong`.

`BandSong` must not become a second musical entity. Its organizational context belongs to the relationship between an Organization and a Song.

## Decision

- `Song` remains the canonical musical entity.
- `OrganizationSong` represents that an Organization owns/uses a Song.
- Musical content is stored only in `Song`; `OrganizationSong` must not duplicate title, lyrics, key, BPM or notes.
- Legacy `BandSong` records are migrated through a private mapping table.
- If a `BandSong` has `source_song_id`, that existing Song is reused.
- If it has no `source_song_id`, a Song is created from the legacy musical data and its generated ID is recorded in the mapping.
- The legacy `band_songs` table remains available until all consumers are migrated.
- Migration is additive and idempotent.

## Target relationship

```text
Organization
    |
    +-- OrganizationSong
            |
            +-- Song
```

## Compatibility

The existing Band/Stage APIs continue to operate during the migration. Repertoire migration will later point directly to `Song`, removing the need for `BandSong` as a musical entity.

## Consequences

The system gains a single source of truth for musical content while retaining organization-level ownership/context and a traceable migration path for legacy records.
