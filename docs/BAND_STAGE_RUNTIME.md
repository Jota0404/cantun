# CANTUM — Band Stage Runtime

## Tarefa M

Esta camada implementa o runtime do Modo Banda sobre as RPCs de autoridade da Tarefa L.

### Serviço de domínio

`src/application/stage/bandStageService.ts` centraliza o uso das RPCs:

- criação e ciclo de vida da sessão;
- `play`, `pause`, `next`, `previous`, `goto` e `setKey`;
- leitura do snapshot;
- conexão, reconexão e encerramento do canal Realtime.

Comandos operacionais não usam `BandSyncQueue`. O servidor aplica a mutação e devolve o `BandStageState` autoritativo. O serviço só publica o evento depois de confirmar que o snapshot ainda possui a mesma `revision` retornada pela RPC.

### Transporte Realtime

`src/sync/bandStageRealtime.ts` usa um canal privado por sessão:

```text
band-stage:<sessionId>
```

O Broadcast transporta um envelope versionado com `type`, `sessionId`, `revision`, `actorUserId`, `eventId`, `sentAt` e `payload`.

O consumidor valida a forma do envelope e a sessão esperada. A autoridade do emissor continua no banco/RPC; `actorUserId` do envelope não concede permissão.

### Reconciliação

`BandStageReconciler` mantém a maior `revision` aceita e os `eventId` já vistos.

- eventos atrasados ou duplicados são ignorados;
- salto de revisão dispara `get_band_stage_snapshot`;
- reconexão limpa a revisão local e carrega snapshot antes de voltar a aceitar incrementais;
- o snapshot é tratado como fonte durável de verdade.

### Limite de responsabilidade

```text
BandSyncEngine
  → sincronização de dados persistentes da banda

BandStageService
  → casos de uso e autoridade operacional via RPC

BandStageRealtime
  → transporte efêmero Broadcast + reconciliação
```

Dexie/cache local não autoriza comandos de palco e nenhuma fila offline de comandos é criada nesta etapa.
