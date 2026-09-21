# ADR-016 — Access Role vs Musical Function

- Status: Accepted
- Date: 2026-09-20

## Decision

Access permissions and musical/technical responsibilities are separate concepts.

Access Role answers:

> What can this member do?

Musical Function answers:

> What does this member do musically/operationally?

A member may have multiple Musical Functions.

The legacy BandMember musicalRole field is therefore transitional and must not define authorization.
