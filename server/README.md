# CANTUM — servidor

Backend próprio (ADR-059): Node.js 24 + TypeScript (executado direto, sem build), Fastify e `pg`. A autorização mora no PostgreSQL; o servidor autentica, abre a transação com o papel e o usuário certos e repassa a chamada.

## Rodar localmente

```bash
createdb cantum && ../scripts/db/migrate.sh cantum   # uma vez
cp .env.example .env                                  # ajuste DATABASE_URL e APP_ORIGIN
npm ci
npm run dev                                           # http://127.0.0.1:8787
```

Testes de integração (precisam de `psql` no PATH e das variáveis `PG*`): `npm test`. Typecheck: `npm run typecheck`.

O papel de login do servidor precisa ser dono das tabelas `app.*` (ou ter acesso a elas) e membro de `cantum_user` e `cantum_anon`, para conseguir `set local role`.

## Contrato HTTP

Todas as respostas são JSON. Erros: `{ "error": "mensagem" }` com 400 (dados ou regra do banco), 401 (sem sessão), 403 (acesso negado pela RLS ou origem não permitida), 404, 409 (conflito) ou 429 (limite de requisições).

### Sessão

Cookie `cantum_session`: token opaco de 256 bits, `HttpOnly`, `SameSite=Lax`, `Secure` quando `APP_ORIGIN` é https, válido por 30 dias. No banco fica só o hash. O cliente usa `credentials: 'include'`.

| Rota | Corpo | Resposta |
|---|---|---|
| `POST /auth/signup` | `{ email, password }` (senha 8–128) | 201 `{ user }` + cookie; envia link de verificação |
| `POST /auth/login` | `{ email, password }` | 200 `{ user }` + cookie |
| `POST /auth/logout` | — | 204; revoga a sessão |
| `GET /auth/session` | — | 200 `{ user }` ou 401 |
| `POST /auth/verify-email` | `{ token }` | 204 |
| `POST /auth/password-reset/request` | `{ email }` | sempre 204 |
| `POST /auth/password-reset/confirm` | `{ token, password }` | 204; derruba todas as sessões |

`user = { id, email, emailVerified }`. As rotas de autenticação aceitam 10 requisições por minuto por IP.

### RPC

`POST /rpc/:name` com os parâmetros nomeados no corpo (`{ "p_id": "…", "p_name": "…" }`). Só existem as funções com `GRANT EXECUTE … TO cantum_user` no SQL. Retorno:

| A função retorna | Resposta |
|---|---|
| `void` | `null` |
| linha (`returns tabela`) | objeto |
| `setof` linha / `returns table` | array de objetos |
| escalar | o valor |
| `setof` escalar | array de valores |

### Tabelas (`/sync/:table`)

Só tabelas com grant para `cantum_user`, sempre sob RLS. Filtros são de igualdade, pela query string (`?id=…&user_id=…`), com colunas validadas no catálogo.

| Método | Uso | Corpo | Resposta |
|---|---|---|---|
| `GET` | ler tudo que a RLS permite, com filtros opcionais | — | array de linhas |
| `POST` | upsert pela chave primária (até 500 linhas) | `{ rows: [...] }` | `{ count }` |
| `PATCH` | atualizar colunas; filtro obrigatório | `{ values: {...} }` | `{ count }` |
| `DELETE` | apagar; filtro obrigatório | — | `{ count }` |

Uma linha que a RLS não deixa ver ou alterar não gera erro em `PATCH` e `DELETE`: o `count` vem 0. Um `POST` que a RLS recusa devolve 403.

### Outros

`GET /health` → `{ ok: true }`. Requisições de escrita com cabeçalho `Origin` diferente de `APP_ORIGIN` recebem 403.

### Tempo real (`/realtime`)

WebSocket do Modo Palco; o contrato completo (mensagens, erros, códigos de fechamento, consistência) está em [`docs/REALTIME_CONTRACT.md`](../docs/REALTIME_CONTRACT.md). Implementação em `src/realtime.ts`, com `@fastify/websocket`.

- **Handshake:** `Origin` obrigatório e igual a `APP_ORIGIN` (senão HTTP 403, sem upgrade); cookie `cantum_session` válido (senão o upgrade completa e fecha com 4401).
- **Tópico:** `stage-session:<uuid>` (minúsculo). Autorizado por `app.can_subscribe_stage_session(uuid)` no `subscribe` e a cada revalidação; o `snapshot` é sempre lido por `get_target_stage_snapshot` com a identidade do assinante.
- **Mudanças:** trigger `stage_session_states_notify` → `pg_notify('stage_state_changed', {"stage_session_id","revision"})` → `LISTEN` numa conexão dedicada (`application_name = cantum-realtime-listener`), com reconexão e resync dos tópicos assinados.
- **Presença:** em memória, por conexão e tópico, deduplicada por usuário. `userId` e `displayName` vêm da sessão; o cliente só escolhe `musicalRole` e `readiness`. Até o B2, `displayName` é o prefixo do e-mail (`displayNameFor` em `src/realtime.ts`).
- **Limites:** 4 KiB por mensagem (1009), 30 mensagens a cada 10 s (1008), 4 tópicos por conexão, 10 conexões por usuário (4429), 60 s sem mensagem encerra com 1001, revalidação a cada 60 s. Os intervalos são opções de `buildApp({ realtime })` para os testes.
- **Uma instância só:** assinaturas e presença são locais ao processo (ADR-059 §6).

## Produção

Ainda não suportada: o servidor recusa `NODE_ENV=production` enquanto não houver provedor de e-mail, porque o mailer de desenvolvimento registra os links com token no log. Hospedagem e provedor são decisões do owner (ADR-059).
