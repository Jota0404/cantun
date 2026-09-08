# CANTUM — Tarefa X: Status de Preparação da Equipe no Modo Banda

## Objetivo
Representar o estado efêmero de preparação dos participantes conectados à sessão de Modo Banda usando a Presence existente.

## Arquitetura
- `BandStageState` permanece reservado ao estado operacional compartilhado da apresentação.
- `BandStageRealtime` permanece como único transporte Realtime da sessão.
- O canal existente `band-stage:<sessionId>` é reutilizado.
- O status de preparação é transportado somente pelo payload efêmero de Presence.
- Nenhuma tabela, RPC, persistência ou revisão operacional é criada para readiness.

## Modelo
`BandStagePresencePayload` e `BandStageParticipant` agora expõem `readiness`, com os valores `ready` ou `waiting`.

Payloads ausentes ou inválidos são normalizados para `waiting` para manter compatibilidade e evitar estado indefinido.

## Comportamento
Ao entrar na sessão, o participante publica `waiting`. O músico pode alternar entre `Aguardando` e `Pronto`; cada alteração republica seu payload na Presence existente.

O painel da equipe mostra o status de cada participante e um contador `prontos/total`. O MD continua sem controle de readiness dos demais participantes.

## Autoridade
Readiness não autoriza comandos, não altera o MD, não incrementa `revision`, não gera broadcast operacional e não entra em `BandStageState`.

## Sessão encerrada e reconnect
O ciclo existente de Presence continua responsável por entrada, reconnect e teardown. O status é efêmero e desaparece quando o participante deixa o canal.

## Fora do escopo
Persistência, histórico, chat, notificações, bloqueio de comandos do MD baseado em readiness, votação, aprovação do MD e novo canal/tabela.

## Testes
Cobertura adicionada para normalização do status, fallback para `waiting`, deduplicação por usuário e ordenação do painel por MD/prontos/nome.
