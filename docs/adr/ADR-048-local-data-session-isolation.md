# ADR-048 — Isolamento dos dados locais por sessão de usuário

- **Status:** Accepted
- **Data:** 2026-10-01
- **Escopo:** Auth / Dexie / Sync
- **Referências:** Blueprint §50.3 e NFR-005; ADR-001, ADR-012, ADR-026, ADR-041

## Contexto

O IndexedDB (`SalmodiaDatabase`) é único por navegador e não é particionado por usuário. Até aqui, `signOut` encerrava apenas a sessão do Supabase. Consequências:

1. Os dados da conta anterior continuavam visíveis para o próximo usuário do mesmo aparelho.
2. `SyncEngine.bootstrap` envia as músicas/repertórios locais quando o remoto do usuário está vazio. Um novo usuário no mesmo aparelho podia **receber na própria conta** dados de outra pessoa.

O Blueprint (§50.3) determina que o cache local não é mecanismo de autorização e que a troca de usuário não pode vazar dados de outra sessão.

## Decisão

1. **Dono dos dados locais.** O app registra em `localStorage` (`cantum-local-data-owner`) o `userId` dono do conteúdo do IndexedDB.
2. **Entrada de sessão.** Antes de expor a sessão à UI ou iniciar a sincronização, `ensureLocalDataOwner` compara o usuário com o dono registrado:
   - mesmo usuário → nada muda;
   - usuário diferente → o IndexedDB é limpo (todas as tabelas, schema preservado);
   - sem dono registrado (primeiro login no aparelho, dados do MVP offline) → os dados são preservados para o bootstrap de sincronização e o dono passa a ser registrado.
3. **Saída.** `signOut` tenta sincronizar as filas (`syncQueue`, `bandSyncQueue`, `targetSyncQueue`). Se ainda houver alterações pendentes, a saída é recusada com `PendingLocalChangesError`, e a UI pede confirmação explícita para descartar. Com a saída confirmada e a sessão remota encerrada, o IndexedDB é limpo e o marcador de dono removido. Se o encerramento remoto falhar, nada local é apagado.

## Consequências

- Não há mais vazamento de dados entre contas no mesmo aparelho, nem upload acidental para a conta errada.
- Após sair, o próximo login do mesmo usuário reconstrói o cache local via sincronização (exige conexão nesse momento).
- Na troca de usuário **sem** saída explícita (sessão expirada e outra pessoa entra), alterações não sincronizadas da conta anterior são descartadas. A segurança tem prioridade; o caso é raro, porque a saída normal bloqueia enquanto houver pendências.
- Relação com o ADR-041: os gates de remoção das stores legadas continuam válidos para a **migração de schema**. Esta decisão não remove stores; apenas limpa o conteúdo ao trocar de sessão, depois de as filas legadas terem sido enviadas.
- O nome físico do banco e as chaves de storage existentes não mudam (ADR-011).
