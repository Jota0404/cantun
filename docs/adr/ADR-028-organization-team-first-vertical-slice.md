# ADR-028 — Organization/Team first vertical slice

**Status:** Accepted  
**Date:** 2026-09-20

The first target-domain vertical slice is now implemented end-to-end:

```
User
  -> OrganizationMembership
  -> Organization
       -> Team
            -> TeamMembership
            -> Musical Functions
```

## Implemented layers

- Domain entities: Organization, OrganizationMembership, Team, TeamMembership.
- Dexie persistence.
- Supabase persistence and RLS.
- Target synchronization queue and engine.
- Organization creation through the secure RPC.
- Team creation through the target repository.
- Team creator is automatically added as TeamMembership.
- Musical Functions are read/written through the target Team RPCs.
- Organization and Team workspace consumers are exposed in the application.

## Compatibility

The legacy Band UI remains available. It is not removed or renamed mechanically.

The new Organization/Team workspace is the target consumer for the new model. Existing Band flows continue through compatibility bridges until their remaining consumers are migrated.

## Completion criteria

This block is considered complete when the target Organization/Team flow can be exercised without requiring a new Band entity. The implementation now satisfies that architectural boundary.

The next block is the migration of reusable musical content and operational scheduling:

```
Organization
  -> OrganizationSong
  -> Repertoire
  -> Service
  -> ServiceItem
  -> Assignment
```
