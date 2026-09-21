# ADR-020 — Musical Functions Belong to Team Membership

- Status: Accepted
- Date: 2026-09-20

## Decision

Musical Function is no longer modeled as a single role on the legacy BandMember.

The target model stores zero or more functions in `team_musical_functions`, attached to a `TeamMembership`.

The initial migration copies each legacy `band_members.musical_role` into the corresponding TeamMembership.

The current Band UI remains compatible through `musicalRoleService`, which now resolves the Band → Team bridge and delegates to the new API.

## Compatibility

The legacy RPCs remain available for the current Stage/legacy consumers. They are not removed in this phase.

The compatibility service exposes the existing singular API while also providing plural APIs for the target model.

## Rule

Future UX should allow multiple Musical Functions per Team Membership. The legacy single-value field is historical compatibility data, not the target domain model.
