# ADR-017 — Repertoire vs Service

- Status: Accepted
- Date: 2026-09-20

## Decision

Repertoire and Service are distinct concepts.

Repertoire is reusable musical content.

Service is an operational occurrence/context that may use a Repertoire or a selected set/order of Songs.

The execution flow is:

```
Service -> Order / ServiceItems -> Songs -> Stage
```

A Repertoire must not become a synonym for a Service.

## Consequences

Legacy Setlist/BandSetlist structures must be migrated with care. A mechanical Setlist -> Service rename is prohibited.
