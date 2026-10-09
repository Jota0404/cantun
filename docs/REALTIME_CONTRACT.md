# CANTUM — Contrato de tempo real do Modo Palco

- **Status:** Aceito (implementado no B1, PR 3)
- **Decisão:** [ADR-059](adr/ADR-059-own-backend-now.md) §6 · Bloco [B1](blocks/B1-portabilidade-postgres.md), PR 3 (`feat/server-realtime`) · Plano: [`BACKEND_MIGRATION_PLAN.md`](BACKEND_MIGRATION_PLAN.md) §3
- **Implementam:** `backend-engineer` (`server/`, `db/migrations/`) e `core-engineer` (`src/platform/realtime.ts`, `src/sync/stageRealtime.ts`)
- **Atualizado:** 2026-10-09

Cobre só o Stage canônico (`StageSession`, ADR-047). O legado `band-stage:<id>` sai no B1 e não tem equivalente.

## Resumo

- Um WebSocket por aba em `/realtime`, autenticado pelo cookie `cantum_session`.
- Um tipo de tópico: `stage-session:<StageSession.id>`.
- O servidor envia só o que vem do banco (snapshot completo do estado) e a presença. O cliente só assina tópicos e publica a própria presença.
- Mutação continua só por `POST /rpc/target_stage_*`. O WebSocket não tem mensagem de mutação.
- A presença fica em memória no servidor. Identidade e nome exibido vêm da sessão, nunca do payload.

## 1. Transporte e autenticação

| Item | Regra |
|---|---|
| URL | `ws(s)://<host da API>/realtime`. Mesma base do HTTP de `src/platform`: `http` vira `ws` e `https` vira `wss`. Sem query string: nenhum token na URL. |
| Autenticação | O handshake (GET de upgrade) leva o cookie `cantum_session` ([`server/README.md`](../server/README.md), Sessão). O servidor resolve o usuário com o mesmo `sessionUserId` das rotas HTTP. |
| Sessão inválida no handshake | O servidor completa o upgrade e fecha na hora com **4401**. O navegador não expõe o status HTTP de um handshake recusado, e o código de fechamento é a única forma de o cliente distinguir "sem sessão" de "sem rede". |
| Origem | `Origin` é obrigatório e deve ser igual a `APP_ORIGIN`. Caso contrário, **HTTP 403 sem upgrade** (defesa contra cross-site WebSocket hijacking). O hook atual de `server/src/app.ts` só confere a origem em métodos de escrita, então a rota `/realtime` confere por conta própria. |
| Mesmo site | Front e API no mesmo site (ADR-059 §5). Em desenvolvimento, use o mesmo host nos dois (`localhost:5173` e `localhost:8787`). `127.0.0.1` e `localhost` são sites diferentes: o cookie `SameSite=Lax` não vai no handshake nem no `fetch`. |
| Revalidação | A cada 60 s, por conexão, o servidor revalida a sessão (logout, reset de senha, expiração) e a autorização de cada tópico assinado (§3). Sessão inválida fecha com **4401**. Tópico não autorizado gera `error forbidden`, e a assinatura e a presença daquele tópico caem. |
| Heartbeat | O cliente envia `ping` a cada 25 s e o servidor responde `pong`. Sem `pong` em 10 s, o cliente fecha e reconecta. O servidor encerra com **1001** a conexão que passa 60 s sem enviar nenhuma mensagem (o cliente trata como queda e reconecta). Em `visibilitychange` (volta ao primeiro plano) e no evento `online`, o cliente manda `ping` na hora, ou reconecta se o socket não estiver aberto. |
| Reconexão | Backoff de 0,5 s, 1 s, 2 s, 4 s e 8 s, com teto de 10 s e jitter de ±20%. O contador zera quando chega um `snapshot`. Depois de reconectar, o cliente reassina todos os tópicos e reenvia a última presença de cada um. Não há reconexão depois de **4401** nem depois de fechamento pelo próprio cliente (1000). |
| Multiplexação | Uma conexão por aba, com até 4 tópicos (§6.3). O cliente pode fechar o socket (1000) quando não sobra nenhum tópico. |

O servidor processa as mensagens de cada conexão **em ordem, uma por vez**. Assim, um `presence` enviado logo depois de um `subscribe` nunca passa à frente dele.

## 2. Mensagens

Frames de texto com JSON, no formato `{ "type": "...", ... }`. Os tópicos seguem `^stage-session:<uuid>$`, com o uuid **em minúsculas** (`[0-9a-f]`, formato 8-4-4-4-12), como o PostgreSQL e `crypto.randomUUID()` o produzem. Maiúsculas geram `error invalid_topic`; o cliente não normaliza, envia o id como recebeu do banco.

### 2.1 Cliente → servidor

| `type` | Campos | Efeito |
|---|---|---|
| `subscribe` | `topic` | Autoriza (§3), registra e responde com `snapshot` seguido de `presence`. Repetir a mensagem é idempotente: o servidor reenvia os dois. |
| `unsubscribe` | `topic` | Remove a assinatura e a presença desta conexão no tópico, e os demais assinantes recebem `presence`. É idempotente e não tem resposta. |
| `presence` | `topic`, `musicalRole`, `readiness` | Substitui a presença desta conexão no tópico (§5) e o servidor envia `presence` a todos os assinantes. Exige assinatura ativa. |
| `ping` | — | O servidor responde `pong`. |

JSON inválido, `type` desconhecido ou campo fora do formato geram `error invalid_message`, e a conexão continua. Campos extras são ignorados. Mensagem binária gera `error invalid_message`. **`userId`, `displayName` e `isMd` nunca são lidos do payload.**

### 2.2 Servidor → cliente

| `type` | Campos | Quando |
|---|---|---|
| `snapshot` | `topic`, `snapshot: { session, state }` | Depois de `subscribe`, a cada mudança de `revision` e no resync do `LISTEN` (§4). |
| `presence` | `topic`, `participants: [{ userId, displayName, musicalRole, readiness }]` | Depois do primeiro `snapshot` de um `subscribe`, e a cada entrada, mudança ou saída. A lista vem sempre completa. |
| `error` | `code`, `message`, `topic` (quando houver) | Ver §2.3. |
| `pong` | — | Resposta a `ping`. |

`snapshot` é **exatamente** o JSON devolvido por `get_target_stage_snapshot`, lido com a identidade do assinante: as linhas de `stage_sessions` e `stage_session_states` em snake_case, iguais às de `/rpc`. O cliente reaproveita `toStageSession` e `toStageSessionState`. Os demais campos vêm em camelCase, como em `StagePresencePayload`.

```json
{ "type": "subscribe", "topic": "stage-session:6f1c…" }
{ "type": "snapshot", "topic": "stage-session:6f1c…",
  "snapshot": { "session": { "id": "6f1c…", "service_id": "…", "md_user_id": "…", "status": "live", "…": "…" },
                "state": { "stage_session_id": "6f1c…", "revision": 12, "current_index": 2, "is_running": true, "…": "…" } } }
{ "type": "presence", "topic": "stage-session:6f1c…", "musicalRole": "vocals", "readiness": "ready" }
{ "type": "presence", "topic": "stage-session:6f1c…",
  "participants": [{ "userId": "…", "displayName": "Ana", "musicalRole": "vocals", "readiness": "ready" }] }
```

### 2.3 Erros e códigos de fechamento

| `error.code` | Quando | O que o cliente faz |
|---|---|---|
| `invalid_message` | JSON inválido, `type` desconhecido ou campo inválido | Registra (é bug do cliente) e segue. |
| `invalid_topic` | Tópico fora do formato | Idem. |
| `forbidden` | Sem permissão **ou** sessão de palco inexistente, no `subscribe` ou na revalidação. Os dois casos não são distinguidos, para não revelar ids. | Para de assinar o tópico e mostra erro; status `ERROR`. |
| `too_many_topics` | Quinto tópico na mesma conexão | Bug do cliente. |
| `not_subscribed` | `presence` sem assinatura ativa | Reassina e reenvia a presença. |
| `internal` | Falha do servidor ou do banco | Reassina com backoff. |

| Fechamento | Motivo | Reconecta? |
|---|---|---|
| 1000 | Fechamento normal pelo cliente | Não |
| 1001 | Servidor desligando ou reiniciando, ou 60 s sem mensagem do cliente (inatividade, §1) | Sim |
| 1006 | Queda de rede (sem frame de fechamento) | Sim |
| 1008 | Excesso de mensagens (§6.3) | Sim, com backoff |
| 1009 | Mensagem acima de 4 KiB | Sim, com backoff |
| 4401 | Sem sessão válida (handshake ou revalidação) | **Não**: o app segue o fluxo de login |
| 4429 | Conexões demais do mesmo usuário | Sim, com backoff |

## 3. Autorização

**Quem assina `stage-session:<id>`:** quem passa em `app.can_subscribe_stage_session(<id>)`, ou seja, o membro da organização dona do serviço da sessão, com qualquer papel. É a mesma regra de `get_target_stage_snapshot` e da antiga política "Stage target members can receive realtime". Usuário de outra organização, sem vínculo ou anônimo recebe `false`. Sessão `ended` pode ser assinada, para leitura do estado final.

**O que cada papel envia pelo WebSocket:** todos enviam o mesmo conjunto (`subscribe`, `unsubscribe`, `presence`, `ping`). O MD muta o estado só por `POST /rpc/target_stage_*`. O banco garante que só o MD atual muta, via `private.assert_stage_operator` e os triggers `*_operator_guard`. O servidor do realtime não reimplementa essa regra (ADR-059 §3).

```sql
-- db/migrations/0003_stage_realtime.sql (ou o próximo número livre no merge)
create function app.can_subscribe_stage_session(p_stage_session_id uuid) returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select coalesce((
    select app.is_organization_member(svc.organization_id)
    from public.stage_sessions ss
    join public.services svc on svc.id = ss.service_id
    where ss.id = p_stage_session_id
  ), false)
$$;
revoke all on function app.can_subscribe_stage_session(uuid) from public;
grant execute on function app.can_subscribe_stage_session(uuid) to cantum_user;
```

- **Onde roda:** dentro de `asUser(pool, userId, …)` (`server/src/db.ts`), como as rotas HTTP. Fica no schema `app`, então não entra na allowlist de `/rpc`: `server/src/catalog.ts` só lista funções de `public`.
- **Quando roda:** no `subscribe` e na revalidação de 60 s. Além disso, cada `snapshot` é lido por `get_target_stage_snapshot` com a identidade do assinante, então toda entrega de estado passa de novo pela autorização do banco.
- **Membro `inactive`:** ver a Pendência 3.

## 4. Consistência

- **Fonte da `revision`:** `stage_session_states.revision`, um inteiro por sessão. Só as RPCs `target_stage_*` (`security definer`) a alteram, sempre com `revision + 1` sob o lock de linha do `UPDATE`. `cantum_user` só tem `SELECT` nas tabelas do Stage. Logo, a `revision` é estritamente crescente por sessão. Uma RPC sem efeito (ex.: `next` no último item) não incrementa e não notifica.
- **Invariante:** toda mudança visível no palco em `stage_sessions` (status, `md_user_id`) incrementa a `revision` na mesma transação. `target_stage_start` e `target_stage_end` já fazem isso. Uma RPC futura, como a troca de MD, precisa manter a regra, senão o servidor não notifica. Exceção conhecida: apagar a música ou o item em execução zera `current_song_id`/`current_service_item_id` por `ON DELETE SET NULL` sem incrementar a `revision`; os assinantes só veem a mudança na próxima revisão ou reassinatura.
- **Servidor:** guarda, por conexão e tópico, a `lastRevision` enviada, e nunca envia `snapshot` com `revision <= lastRevision`. A exceção é a resposta a `subscribe`, que é sempre enviada.
- **Cliente:** guarda a `revision` atual por tópico. Um `snapshot` com `revision` menor é descartado, um com `revision` igual é idempotente e um com `revision` maior é aplicado. Como todo snapshot é completo, não existe buraco de revisão: pular de 5 para 8 é normal e não pede reconciliação.
- **Entrada e reconexão:** o primeiro `snapshot` depois de cada `subscribe` substitui o estado local sem comparar `revision`. O servidor é a autoridade, e isso cobre o estado vindo do Dexie (ADR-042) e o banco recriado em desenvolvimento.
- **RPC do MD:** o cliente do MD aplica o estado devolvido pela RPC pela mesma regra. Depois chega o `snapshot` com a mesma `revision`, e a aplicação é idempotente.
- **Ordem:** o NOTIFY é entregue só depois do commit, e o servidor lê o snapshot depois disso. Por isso nunca envia estado não confirmado. Leituras concorrentes podem terminar fora de ordem, e a regra da `lastRevision` resolve.
- **NOTIFY perdido:** o PostgreSQL entrega o NOTIFY, no commit, a toda sessão que está escutando. A perda só acontece com a conexão de `LISTEN` caída. A cobertura é esta:
  1. ao reconectar o `LISTEN`, o servidor faz o **resync**: relê e envia o snapshot de todo tópico que tem assinantes;
  2. um `select 1` na conexão de `LISTEN` a cada 30 s, com `query_timeout` igual ao intervalo, detecta conexão morta ou meio aberta;
  3. quando o WebSocket cai, o cliente reassina e recebe um snapshot;
  4. o botão "Sincronizar" continua chamando `get_target_stage_snapshot` por `/rpc`.

  Não há polling periódico.
- **Offline (ADR-042):** sem socket, o cliente mantém o último estado e as músicas locais, com status `RECONNECTING`. Nada é enfileirado: comandos de palco não entram na fila de sync.
- **Status do cliente:** `StageConnectionStatus` continua igual.
  - `CONNECTING`: socket abrindo, ou aguardando o primeiro snapshot.
  - `SUBSCRIBED`: snapshot recebido.
  - `RECONNECTING`: queda, em backoff.
  - `ERROR`: 4401 ou `forbidden`.
  - `DISCONNECTED`: fechamento pelo cliente.

  O texto exibido em pt-BR fica com a UI.

## 5. Presença e readiness

| Campo | Origem | Validação no servidor |
|---|---|---|
| `userId` | **Sessão do socket** | — |
| `displayName` | **Sessão do socket** (servidor) | Lido do banco na abertura da conexão: hoje o prefixo do e-mail; no B2, `app.users.display_name` (obrigatório no cadastro, 1–80 caracteres) |
| `musicalRole` | Cliente | Um dos valores de `team_musical_functions_musical_function_check` (`vocals` … `other`); fora disso vira `other` |
| `readiness` | Cliente | `ready` ou `waiting`; fora disso vira `waiting` |

- **`isMd` não trafega.** O cliente calcula `userId === snapshot.session.md_user_id`, como já faz hoje. Por isso o servidor sempre envia o `snapshot` antes da primeira `presence`.
- **Identidade:** `userId` e `displayName` são sempre os da sessão do socket; um `displayName` enviado pelo cliente é ignorado, pelo mesmo motivo do `userId`: ninguém se passa por outro. Do payload, o servidor lê só `musicalRole` e `readiness`. O nome é lido uma vez por conexão: uma troca de nome aparece na próxima conexão. Hoje, qualquer membro pode publicar presença com o `userId` de outra pessoa, inclusive o do MD (§7). O teste RT-10 cobre esse caso.
- **Escopo:** a presença existe por conexão e tópico. Só aparece quem enviou `presence`; assinar não basta. O cliente não envia presença em sessão `ended`, como hoje.
- **Deduplicação:** a lista é indexada por `userId`. Várias conexões do mesmo usuário (abas, aparelhos) viram uma entrada só, a do `presence` recebido por último. O usuário sai da lista quando a última conexão dele deixa o tópico.
- **Limpeza:** `unsubscribe`, fechamento do socket, timeout de heartbeat, 4401 e `forbidden` removem a presença da conexão e disparam `presence` para quem fica.
- **Persistência:** nenhuma (Blueprint §51.2). Um reinício do servidor zera tudo. O readiness sobrevive a quedas porque o cliente guarda a última presença e a reenvia depois de reassinar.
- **Ordenação:** é do cliente (MD, depois prontos, depois nome), via `presenceStateToStageParticipants`. O servidor envia a lista completa, sem diff.

## 6. Servidor

### 6.1 Banco

Ficam na mesma migration de §3:

```sql
create function private.notify_stage_state_changed() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  perform pg_notify('stage_state_changed',
    json_build_object('stage_session_id', new.stage_session_id, 'revision', new.revision)::text);
  return null;
end;
$$;

create trigger stage_session_states_notify
  after update on public.stage_session_states
  for each row
  when (old.revision is distinct from new.revision)
  execute function private.notify_stage_state_changed();
```

- **Canal:** `stage_state_changed`.
- **Payload:** `{"stage_session_id":"<uuid>","revision":12}`, com cerca de 80 bytes, bem abaixo do limite de 8000 bytes do NOTIFY. O estado nunca vai no NOTIFY, porque o servidor relê o snapshot com a identidade de cada assinante.
- **Sem trigger de `INSERT`:** o estado nasce com revisão 0, sem assinantes, e quem assina recebe o snapshot no `subscribe`.
- **Testes SQL:** em `db/tests/0003_stage_realtime.sql` (RT-01, RT-02).

### 6.2 Processo

- **Plugin:** `@fastify/websocket` (o ADR-059 §4 já prevê plugin de WebSocket; justificar no PR), com `maxPayload: 4096`.
- **`LISTEN`:** um `pg.Client` dedicado, fora do pool e com `keepAlive`, faz `LISTEN stage_state_changed`. Em erro ou fim de conexão, reconecta com backoff de 1 s a 30 s e faz o resync (§4).
- **Estado em memória:**
  - `topics: Map<topic, Set<Conn>>`;
  - `Conn = { userId, tokenHash, displayName, subs: Map<topic, { lastRevision, presence? }>, queue }` (o `displayName` é lido do banco na abertura, antes de qualquer mensagem da fila).
- **`subscribe`:**
  1. valida o formato e o limite de tópicos;
  2. roda `can_subscribe_stage_session` (falso gera `forbidden`);
  3. **registra a assinatura;**
  4. lê e envia o snapshot;
  5. envia a presença.

  Registrar antes de ler fecha a janela em que um NOTIFY chegaria entre a leitura e o registro e se perderia.
- **NOTIFY:** se o tópico não tem assinantes, o servidor ignora. Caso contrário, lê `get_target_stage_snapshot` com `asUser(userId)` para cada assinante:
  - erro `P0001` ou `42501` gera `forbidden` e remove a assinatura;
  - sucesso envia o snapshot se `revision > lastRevision`.

  **Teto conhecido:** são N leituras por mudança, com N = conexões no tópico (dezenas). Se N crescer, ler uma vez por usuário distinto.
- **Revalidação (60 s):** sessão e `can_subscribe_stage_session` por tópico (§1, §3).
- **Desligamento:** fecha os sockets com 1001 e encerra o `LISTEN`.
- **Testes:** os intervalos (heartbeat, timeout, revalidação, health do `LISTEN`) vêm das opções de `buildApp`, para os testes não esperarem minutos.
- **Uma instância só (ADR-059 §6):** assinaturas e presença são locais ao processo. Multi-instância está fora do B1.

### 6.3 Limites

| Limite | Valor | Ao exceder |
|---|---|---|
| Mensagem recebida | 4 KiB | fecha com 1009 |
| Mensagens recebidas | 30 a cada 10 s, por conexão | fecha com 1008 |
| Tópicos | 4 por conexão | `error too_many_topics` |
| Conexões | 10 por usuário | fecha a nova com 4429 |
| Handshake | limite global do servidor (300/min por IP) | HTTP 429 |

### 6.4 Logs (NFR-008)

- **Registra:** abertura e fechamento de conexão (`userId` e código), resultado de `subscribe` (`topic`), resync do `LISTEN` e erros.
- **Nunca registra:** cookie, `displayName`, anotação do MD ou conteúdo de snapshot.

## 7. Supabase atual → este contrato

| Hoje (`src/sync/stageRealtime.ts`, Supabase) | Agora |
|---|---|
| Canal privado `stage-session:<id>:state` | Tópico `stage-session:<id>` em `/realtime` |
| JWT do Supabase no socket | Cookie `cantum_session` no handshake |
| Política "Stage target members can receive realtime" (`realtime.messages`, `select`) | `app.can_subscribe_stage_session` no `subscribe` e na revalidação |
| Política "… can send realtime" (`insert`, broadcast e presence) | Só `presence`, e sem identidade no payload |
| `postgres_changes` em `stage_session_states` + publicação `supabase_realtime` | Trigger `pg_notify` + `LISTEN`, e o servidor envia o `snapshot` |
| Broadcast `stage.*` publicado pelo cliente do MD depois da RPC (`publishStageEvent`) | **Removido.** Só o servidor emite estado, sempre lido do banco |
| `get_target_stage_snapshot` por RPC a cada evento | O snapshot chega pelo socket. A RPC fica para "Sincronizar" e para o retorno dos comandos do MD |
| `channel.track({ userId, isMd, … })` + `presenceState()` / `sync`/`join`/`leave` | `presence` sem `userId`/`displayName`/`isMd`, e o servidor envia a lista completa |
| Status `SUBSCRIBED` / `CHANNEL_ERROR` / `TIMED_OUT` / `CLOSED` | `StageConnectionStatus` (§4) e códigos de fechamento (§2.3) |
| Heartbeat do Phoenix | `ping` / `pong` |

**Deixa de existir no transporte:**
- o envelope `StageEvent` (`eventId`, `actorUserId`, `sentAt`) e os 12 `StageEventType`;
- `publish`, `broadcast.self/ack`, `seenEventIds` e a reconciliação `revision-gap`;
- o callback `onEvent`, que as páginas usam só para rebuscar o snapshot;
- `client.auth.getUser()` para obter o `actorUserId`;
- a dupla checagem de `revision` antes e depois do comando em `StageExecutionService.command`, que existia para casar o evento publicado com o estado e passa a ser dispensável;
- as políticas de `realtime.messages`, que já estão fora do baseline;
- o canal legado `band-stage:<id>`.

**Motivo de segurança da mudança:** hoje qualquer membro da organização pode publicar um broadcast com `revision` arbitrária, por exemplo 999999. O `StageReconciler` dos outros clientes adota essa revisão e passa a descartar todo evento e snapshot legítimo, e o palco congela até a reconexão. Pelo mesmo caminho, qualquer membro pode publicar presença com o `userId` do MD. No contrato novo, as duas coisas são impossíveis por construção.

## 8. Casos de teste

| # | Camada | Caso | Esperado |
|---|---|---|---|
| RT-01 | db | `can_subscribe_stage_session`: membro; outra organização; sem vínculo; anônimo (sem `app.user_id`); sessão inexistente | `true` só para o membro |
| RT-02 | db | Trigger `stage_session_states_notify` existe, com `WHEN` sobre `revision` | catálogo confere (a entrega real é testada no RT-08) |
| RT-03 | server | Handshake sem cookie, com sessão revogada ou com sessão expirada | fecha com 4401 |
| RT-04 | server | `Origin` ausente ou diferente de `APP_ORIGIN` | HTTP 403, sem upgrade |
| RT-05 | server | `subscribe` de membro | `snapshot` com a `revision` atual, depois `presence` |
| RT-06 | server | `subscribe` de outra organização, sem vínculo ou de sessão inexistente | `error forbidden`, idêntico nos três casos, sem snapshot |
| RT-07 | server | MD chama `target_stage_next` por `/rpc` | todos os assinantes recebem `snapshot` com `revision + 1`. A mesma RPC de um não-MD responde 400 e ninguém recebe nada |
| RT-08 | server | Cliente `pg` em `LISTEN stage_state_changed` durante um comando | payload só com `stage_session_id` e `revision`. `UPDATE` que não muda a `revision` não notifica |
| RT-09 | server | Várias RPCs em sequência rápida | cada conexão recebe `revision` estritamente crescente |
| RT-10 | server | `presence` com `userId`/`displayName`/`isMd` de outra pessoa, ou com campos inválidos | a lista mostra o `userId` e o `displayName` da sessão, com `musicalRole`/`readiness` normalizados (§5) |
| RT-11 | server | Duas conexões do mesmo usuário | uma entrada (a mais recente). Fechar uma mantém a entrada; fechar a outra remove, e os demais recebem a lista nova |
| RT-12 | server | `unsubscribe`; `presence` sem `subscribe` | a presença sai da lista; `error not_subscribed` |
| RT-13 | server | Mensagem acima de 4 KiB; quinto tópico; excesso de mensagens; 11ª conexão; JSON inválido; tópico com uuid em maiúsculas | 1009; `too_many_topics`; 1008; 4429; `invalid_message`, com a conexão ativa; `invalid_topic` |
| RT-14 | server | `ping`; silêncio acima do timeout | `pong`; o servidor fecha com 1001 e limpa a presença |
| RT-15 | server | Logout ou reset de senha com socket aberto; membership removida | 4401 na revalidação; `forbidden`, e a assinatura cai |
| RT-16 | server | `pg_terminate_backend` na conexão de `LISTEN` e comando durante a queda | depois da reconexão, os assinantes recebem o snapshot novo |
| RT-17 | server | `subscribe` seguido de `presence` sem esperar resposta | processados em ordem; a presença é aceita |
| RT-20 | client | Snapshot com `revision` menor, igual, maior e salto de 5 para 8 | descarta; no-op; aplica; aplica sem RPC extra |
| RT-21 | client | Primeiro snapshot depois de reconectar, com `revision` menor que a local | substitui o estado local |
| RT-22 | client | Queda (1006) | `RECONNECTING`, backoff, reassinatura, reenvio da última presença, `SUBSCRIBED` |
| RT-23 | client | 4401; `forbidden` | não reconecta, `ERROR`; para o tópico |
| RT-24 | client | `pong` não chega em 10 s | fecha e reconecta |
| RT-25 | client | Mensagem `presence` recebida | participantes com `isMd` calculado do `md_user_id` do snapshot, em ordem. O payload enviado não contém `userId` nem `displayName` |
| RT-26 | client | Retorno da RPC do MD e, depois, snapshot com a mesma `revision` | aplicado uma vez, sem regressão |
| RT-27 | client | Snapshot com `status = ended` | a página desconecta (comportamento atual) |
| RT-28 | client | Sem rede | o último estado continua na tela e nada é enfileirado (ADR-042) |
| RT-30 | manual | MD e músico em dois aparelhos; derrubar e voltar a rede do músico no meio de uma música; reiniciar o servidor com os dois conectados (plano §5) | o músico volta ao estado atual sem ação manual e com o readiness preservado |

Os testes de cliente mockam `src/platform/realtime.ts`, sem tocar no Supabase. Os de servidor rodam contra PostgreSQL real, como `server/src/app.test.ts`.

## Pendências

1. **Texto dos ADR-043 e ADR-047 (sem conflito de decisão).**
   - O texto: o ADR-047 §Realtime e o ADR-043 descrevem broadcast publicado pelo cliente e `postgres_changes`. Este contrato elimina o broadcast do cliente.
   - Por que não é conflito: o ADR-059 §6 delega o realtime a este documento, e o ADR-043 já está marcado `superseded`.
   - **Recomendação:** o lead anota no índice que o ADR-047 teve o "Realtime alterado pelo ADR-059", sem editar o ADR.
2. **Fonte do nome exibido na presença (decidido, 2026-10-09).**
   - O servidor lê o nome da sessão (§5); o cliente não envia `displayName`.
   - Até o B2: prefixo do e-mail, visível só para membros da mesma organização.
   - B2 (`docs/specs/VS-01-equipe.md`): `app.users.display_name not null`, obrigatório no `POST /auth/signup`; `displayNameFor` (`server/src/realtime.ts`) passa a ler essa coluna. Sem fallback.
3. **Membro `inactive` no Stage (dependência do B2).**
   - Hoje `can_subscribe_stage_session` e `get_target_stage_snapshot` exigem só o vínculo com a organização.
   - O `PERMISSIONS.md` (§4, N11) nega o Stage a quem está `inactive` em todas as equipes.
   - **Recomendação:** a migration do B2 que cria `app.has_permission` passa as duas funções a exigir `stage.run`, no mesmo PR, com o teste N11.
4. **Número da migration.** O SQL do B2 também vai para `db/migrations/`. Use o próximo número livre no momento do merge.
