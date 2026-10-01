# CANTUM — Tarefa O: Cliente Músico do Modo Banda

## Status

Implementação de cliente músico em somente leitura sobre o runtime de `BandStageSession`.

## Objetivo

Disponibilizar uma experiência de palco para músicos que projeta o estado compartilhado da sessão em tempo real, sem oferecer autoridade operacional local.

## Implementação

A rota existente `/stage/session/:sessionId` identifica o papel do usuário a partir de `snapshot.session.mdUserId`.

- `mdUserId === user.id`: mantém a interface operacional do MD.
- qualquer usuário autenticado diferente do MD: recebe a projeção de músico.

A projeção do músico:

- conecta ao mesmo `BandStageService` e `BandStageRealtime`;
- carrega o snapshot inicial e o setlist da sessão;
- acompanha eventos/reconciliações por `revision`;
- mostra a música corrente definida pelo `BandStageState`;
- mostra tom operacional compartilhado;
- mostra status da sessão, revisão e conectividade;
- permite apenas ações locais de leitura, como tamanho da fonte, modo de leitura e sincronização manual;
- não expõe `play`, `pause`, `next`, `previous`, `goto`, `setKey` ou `endSession` como ações do músico.

O setlist do músico não é interativo: selecionar outra música localmente não altera a projeção compartilhada.

## Segurança e autoridade

A UI não é tratada como mecanismo de autorização. A autoridade continua nas RPCs/RLS já implementadas nas tarefas anteriores.

A ausência de comandos na interface do músico é uma proteção de experiência e redução de erro operacional; um cliente não-MD não deve obter autoridade apenas por renderizar uma tela diferente.

## Critérios de aceitação

1. Músico entra na sessão e recebe a música corrente.
2. Mudança do MD é refletida pela projeção quando um snapshot atualizado chega.
3. `revision` e status de conexão permanecem visíveis.
4. Evento atrasado não deve regredir a projeção, conforme o reconciliador existente.
5. Reconexão/sincronização manual recupera o snapshot corrente.
6. O músico não possui controles de palco.
7. Preferências locais de leitura não são publicadas como estado compartilhado.
8. A sessão encerrada permanece somente leitura.
