# ADR-029 — Target content and service vertical slice

**Status:** Accepted  
**Date:** 2026-09-20

The second target-domain vertical slice is complete:

```
Organization
  -> OrganizationSong
  -> Repertoire
       -> RepertoireItem -> Song
  -> Service
       -> ServiceItem -> Song/Repertoire
       -> Assignment -> User + Musical Function
```

## Implemented

- OrganizationSong application service.
- Repertoire application service and target consumer.
- Service scheduling helper and operational Service consumer.
- Assignment creation and listing in the Service workspace.
- Target Organization workspace now exposes organization-owned songs, repertoires and services.
- Target routes are available without requiring creation of a legacy Band entity.
- Existing Band/Setlist consumers remain compatibility paths and are not deleted.

## Ownership

- Organization owns the reusable musical context.
- Song remains canonical musical content.
- Repertoire is reusable ordered content.
- Service is an operational occurrence.
- ServiceItem defines the service order.
- Assignment connects a user to a service and musical function.

## Boundary

Stage is intentionally not folded into this slice. The next migration boundary is Service -> StageSession while preserving the existing realtime/stage behavior.
