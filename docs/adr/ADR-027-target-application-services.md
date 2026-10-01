# ADR-027 — Target application service boundary

**Status:** Accepted  
**Date:** 2026-09-20

The target domain exposes application services instead of making UI code coordinate repositories directly.

Initial services:

- `organizationService`: secure organization creation through the existing RPC.
- `teamService`: Team creation and TeamMembership creation.
- `serviceService`: Service, ServiceItem and Assignment creation.

These services operate on the target domain and therefore use target repositories and their synchronization boundary.

Legacy Band application services remain compatibility facades until their consumers are migrated.

The target services do not introduce new Band/Setlist dependencies.
