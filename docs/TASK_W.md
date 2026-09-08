# CANTUM — Tarefa W: Presença Operacional no Modo Banda

## Objetivo
Adicionar presença efêmera aos participantes conectados a uma sessão de Modo Banda sem criar uma nova fonte de verdade.

## Arquitetura
- `BandStageState` continua sendo o estado operacional persistente e autoritativo.
- `BandStageRealtime` continua sendo o único transporte Realtime da sessão.
- Broadcast continua transportando eventos operacionais.
- Supabase Realtime Presence transporta somente a presença efêmera.
- O canal existente `band-stage:<sessionId>` é reutilizado.
- Nenhuma tabela/campo de presença foi adicionado a `BandStageState`.
- Presença não incrementa `revision` nem altera música, tom, execução, anotação ou preparação.

## Participante
`BandStageParticipant` expõe `userId`, `displayName`, `musicalRole` e `isMd`. `MusicalRole` é reutilizado. `isMd` é derivado do snapshot, não usado para autorização.

## Ciclo
`subscribe → snapshot → presence`. Reconnect resubscreve, reconcilia o snapshot e republica o payload de Presence. Teardown desconecta o canal.

## Segurança
O canal usa `private: true`. A migration adiciona RLS em `realtime.messages` para autorizar somente membros da banda associada à sessão. A autorização operacional continua em `auth.uid()` + RPCs. Presence não concede comandos.

## UI
MD e músicos visualizam uma área discreta de “Equipe conectada” com nome, função musical, indicação de MD e quantidade de participantes. Não há toast nem controles de gerenciamento.

## Sessão encerrada
Snapshot `ended` não inicia presença e o runtime da tela desconecta a sessão.

## Fora do escopo
Status “pronto”, chat, mensagens, reações, convites, troca de MD, múltiplos MDs, persistência/histórico, notificações, novo canal, nova tabela ou alterações em `BandStageState`.

## Testes
Cobertura adicionada para entrada, múltiplos participantes, MD, fallback, reconnect, teardown e sessão encerrada.
