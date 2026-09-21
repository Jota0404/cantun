# ADR-018 — Legacy Band Bridge to Organization and Team

- Status: Accepted
- Date: 2026-09-20

## Decision

The legacy `Band` model will be bridged to the new organizational model before any legacy removal.

Each existing Band is represented by:

- one Organization;
- one Team belonging to that Organization.

The bridge is recorded in private migration mapping tables so the legacy identifiers remain traceable.

### Membership mapping

| Legacy | Target |
|---|---|
| `band_members` | `organization_memberships` + `team_memberships` |
| `owner` | Organization `owner` |
| `editor` | Organization `admin` |
| `member` | Organization `member` |

The legacy `musical_role` is retained in the migration mapping as historical data. It is not promoted directly into the permanent TeamMembership contract because the target model allows multiple Musical Functions.

## Migration guarantees

1. No legacy Band table or Band data is deleted.
2. The migration is additive and idempotent at the mapping level.
3. Every migrated Band has exactly one Organization and one Team.
4. Every migrated Band member is represented in both target membership layers.
5. Legacy member identifiers and musical-role values remain traceable.
6. The mapping tables are private and are not part of the application domain.
7. Legacy APIs, Stage, sync and Dexie structures remain available until their dependencies are migrated.

## Consequence

The application can progressively read the new Organization/Team model while the Band model remains operational. Legacy removal becomes a later, separately validated migration step.
