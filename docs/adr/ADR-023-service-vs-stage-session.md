# ADR-023 — Service vs Stage Session

**Status:** Accepted  
**Date:** 2026-09-20

## Decision

CANTUM separates the planned operational occurrence from the live execution session.

- **Service** is the scheduled/operational occurrence of an Organization.
- **Service Order / Service Item** defines the planned sequence of Songs/Repertoire items.
- **Assignment** associates people with operational needs.
- **Stage Session** is the live execution context derived from a Service.
- Stage state, realtime events and presence remain implementation concerns of Stage and are not duplicated into Service.

## Migration

The current `BandStageSession` remains compatible with the legacy Band/Setlist model.

The target model introduces Service without rewriting Stage. A later bridge will resolve:

`BandStageSession -> Service -> Repertoire/ServiceItems`.

Existing realtime contracts continue to operate until their consumers migrate.
