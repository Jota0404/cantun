# ADR-038 — Legacy Band Route Cutover

## Status

Accepted

## Context

The target Organization/Team vertical slice is operational, while legacy Band routes remain for backward compatibility. The legacy Band invite API already resolves through the Organization/Team bridge, so continuing to land users in Band pages would keep the compatibility model as an active product entry point.

## Decision

Legacy Band routes become compatibility redirects:

- `/bands` redirects to `/organizations`.
- `/bands/:bandId` resolves the existing legacy Band -> Organization + Team mapping and redirects to the canonical Team route.
- `/bands/invite/:token` remains a valid compatibility entry point for existing invite links, but accepted invites land on the canonical Organization/Team route.
- Legacy Band invite/application services remain as adapters where required by existing links and persistence.
- Legacy Band persistence, RPCs, sync and standalone Stage infrastructure are not removed by this ADR.

## Consequences

The active user journey no longer depends on Band list/detail screens. Existing URLs remain usable while the canonical Organization/Team model becomes the destination.

Removal of legacy Band persistence remains gated by the migration rules in `docs/CANTUM_ARCHITECTURE.md`: consumers, Dexie, Supabase/RPC/RLS/sync, tests, and offline/online behavior must be migrated before destructive removal.

## Validation

The cutover is intentionally UI/application-level and does not change legacy database identity. The Band -> Organization + Team mapping remains the source of truth for compatibility redirects.
