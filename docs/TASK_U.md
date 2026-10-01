# CANTUM — Tarefa U: Controle de Execução Compartilhada do Modo Banda

## Objetivo

Consolidar a execução da sessão de palco em um estado compartilhado derivado exclusivamente do `BandStageSnapshot`. O MD continua sendo a autoridade operacional; músicos acompanham a mesma execução em modo somente leitura.

## Modelo

`SharedExecutionState` reúne, em uma única projeção de execução:

- sessão e revisão autoritativas;
- música atual e índice;
- tom atual;
- execução pausada/ativa;
- anotação do MD;
- status `lobby | running | paused | ended`.

A projeção não cria uma segunda fonte de verdade. Ela é reconstruída a partir de `BandStageSnapshot` sempre que o snapshot inicial, uma reconciliação ou um evento Realtime exigir atualização.

## Comandos

Play, pause, next, previous, goto, alteração de tom e encerramento continuam delegados ao `BandStageService`, que chama as RPCs protegidas. A UI não altera `SharedExecutionState` diretamente para simular sucesso: depois do comando, o snapshot autoritativo é lido novamente.

## Realtime / reconexão

O canal `band-stage:<sessionId>` e o reconciliador existentes permanecem como transporte. Eventos recebidos provocam a leitura do snapshot autoritativo, preservando a regra de `revision` e a recuperação após gaps/reconnect.

## Experiência

O MD vê o mesmo estado que todos os participantes, mas mantém controles operacionais. O músico vê música atual, tom, revisão, execução e anotação provenientes da projeção compartilhada e não recebe controles de palco.

## Segurança

Nenhuma permissão operacional nova foi criada. A autoridade continua no banco via `auth.uid()` e nas RPCs protegidas já existentes. A revisão persistida continua sendo monotônica e a sessão continua tendo no máximo uma instância `live` por banda.
