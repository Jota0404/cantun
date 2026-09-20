# ADR-014 — CANTUM Domain Migration

- Status: Accepted
- Date: 2026-09-20

## Context

The current implementation uses Band-centered entities while the approved CANTUM product model uses Organization, Team, Membership, Service and Repertoire concepts.

## Decision

Migrate incrementally rather than rewriting the application.

Primary mappings:

- Band -> Organization + Team
- BandMember -> OrganizationMembership / TeamMembership
- BandMemberRole -> Access Role
- MusicalRole -> Musical Function
- BandSong -> Song
- BandSetlist -> Repertoire
- BandSetlistSong -> RepertoireItem
- Setlist -> Repertoire
- SetlistSong -> RepertoireItem

No global mechanical rename is allowed.

## Consequences

Existing musical, Stage, sync and offline capabilities remain reusable. Legacy persistence remains until its consumers and data have been safely migrated.
