# ADR-024 — Service Ownership and Assignments

**Status:** Accepted  
**Date:** 2026-09-20

## Decision

- Service belongs to an Organization.
- ServiceItem references the canonical Song and may optionally reference the Repertoire that supplied it.
- ServiceItem owns ordering for the occurrence.
- Assignment belongs to a Service and targets a user plus a Musical Function.
- Assignment may optionally target a ServiceItem.
- Access permissions remain Organization/Team membership concerns.
- Musical Function remains distinct from Access Role.

## Rationale

This keeps reusable musical content in Song/Repertoire while operational planning lives in Service. It also allows a person to be assigned to a specific function without changing their persistent Team membership.

Stage remains separate and will consume Service context through a later compatibility bridge.
