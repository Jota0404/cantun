# ADR-019 — Organization/Team Invite and Membership Migration

- Status: Accepted
- Date: 2026-09-20

## Context

The legacy CANTUM membership flow is based on `BandMember` and `band_invites`. The target model uses `OrganizationMembership` and `TeamMembership`.

The migration must remain additive while the Band UI, routes, Stage, sync and Dexie layers still depend on the legacy Band model.

## Decision

New invitations are owned by the Organization and target a Team.

A new `organization_invites` table and protected RPC API provide:

- create invite
- inspect invite
- accept invite
- revoke invite
- update organization member role
- remove organization member

Accepting an invite creates both:

1. OrganizationMembership
2. TeamMembership

The legacy `bandInviteService` remains as a compatibility facade. Its public API is preserved, but its operations now resolve the Band → Organization + Team bridge and delegate to the new Organization APIs.

Legacy URLs such as `/bands/invite/:token` remain valid during migration.

Legacy Band invite tables and RPCs are not removed in this phase.

## Role mapping

| Legacy Band role | Organization role |
| --- | --- |
| owner | owner |
| editor | admin |
| member | member |

Invite creation does not permit inviting an owner.

## Member management

Legacy member identifiers are resolved through the private Band-member mapping table to the corresponding OrganizationMembership before role changes or removal.

Removing an OrganizationMembership also removes that user's TeamMemberships belonging to the Organization.

## Rationale

This keeps the current UI operational while moving the authoritative membership mutation path toward the target Organization/Team model.

It also avoids exposing private migration mapping tables to the client.

## Migration rule

Do not remove legacy Band invite APIs until all consumers have migrated and the compatibility facade is no longer required.
