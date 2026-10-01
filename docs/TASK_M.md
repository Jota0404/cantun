# CANTUM — Tarefa M

## Status

**Implementada estruturalmente na `feature/song-detail`.**

### Entregas

- `src/domain/stage/bandStage.ts`
  - entidades e protocolo versionado do palco;
  - tipos de sessão, estado e eventos;
  - normalização de linhas Supabase para domínio.
- `src/application/stage/bandStageService.ts`
  - serviço de domínio para ciclo de vida e comandos;
  - uso exclusivo das RPCs de autoridade de L;
  - publicação somente após confirmação da revisão persistida.
- `src/sync/bandStageRealtime.ts`
  - Broadcast por sessão;
  - validação do envelope;
  - deduplicação por `eventId`;
  - monotonicidade de `revision`;
  - reconciliação por snapshot em salto/reconexão.
- testes unitários para serviço e reconciliador.

### Invariantes preservadas

O runtime não usa `BandSyncQueue` como autoridade operacional, não cria comandos offline confirmados e não concede autoridade pelo `actorUserId` do envelope. As RPCs de L continuam responsáveis por membership, papel do MD, estado da sessão e escrita atômica do estado.

### Validação

A branch foi atualizada com a implementação. O workflow configurado no repositório executa `npm test`, `npm run lint` e `npm run build` em pushes para `feature/song-detail`; não havia uma execução registrada disponível no momento da conclusão desta tarefa.
