# ADR-015 — Organization and Team Ownership

- Status: Accepted
- Date: 2026-09-20

## Decision

Organization is the root organizational ownership boundary.

Team is an operational unit belonging to an Organization.

User access is represented through memberships rather than embedding organizational meaning directly in User.

Target relationship:

```
User -> OrganizationMembership -> Organization
Organization -> Team -> TeamMembership -> User
```

Resources such as Songs, Repertoires and Services are organization-scoped unless a later approved decision defines a narrower scope.

## Consequences

The legacy Band model must not be translated directly into Team. The migration must preserve Organization as the higher-level boundary.
