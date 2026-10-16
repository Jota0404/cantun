# ADR-022 — Repertoire is Organization-Owned

**Status:** Accepted (revisado em parte pelo [ADR-062](ADR-062-repertorio-pessoal.md))  
**Date:** 2026-09-20

## Decision

`Repertoire` is the reusable musical collection owned by an Organization.

- `Repertoire` replaces the conceptual role of legacy `BandSetlist` and `Setlist`.
- `RepertoireItem` references `Song` directly.
- A repertoire does not own or duplicate Song data.
- Operational occurrence belongs to `Service`, not Repertoire.
- Legacy setlist tables remain until Stage and other consumers are migrated.

## Migration

Legacy `BandSetlist` records are mapped to the Organization created for their Band.

Legacy `BandSetlistSong` entries are converted through the `BandSong -> Song` mapping and become `RepertoireItem` records.

The migration is additive, idempotent and traceable through private mapping tables.

## Nota (2026-10-15)

O [ADR-062](ADR-062-repertorio-pessoal.md) revisa a propriedade: além do repertório da organização (esta decisão, que continua valendo), existe o **repertório pessoal** do usuário (sem organização), que pode ser **copiado** para a organização por Owner, Admin e Líder. O texto acima permanece como histórico.
