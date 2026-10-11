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
| `POST /auth/signup` | `{ email, password, displayName }` (senha 8–128; nome 1–80 sem contar espaços nas pontas) | 201 `{ user }` + cookie; envia link de verificação |
| `POST /auth/login` | `{ email, password }` | 200 `{ user }` + cookie |
| `POST /auth/logout` | — | 204; revoga a sessão |
| `GET /auth/session` | — | 200 `{ user }` ou 401 |
| `POST /auth/verify-email` | `{ token }` | 204 |
| `POST /auth/verify-email/resend` | — (exige sessão) | 204; se o e-mail ainda não foi verificado, invalida os links anteriores e envia um novo |
| `POST /auth/password-reset/request` | `{ email }` | sempre 204 |
| `POST /auth/password-reset/confirm` | `{ token, password }` | 204; derruba todas as sessões |

`user = { id, email, emailVerified, displayName }`. O nome muda por `POST /rpc/set_my_display_name`; os nomes dos membros de uma organização vêm de `POST /rpc/get_organization_member_profiles` (sem e-mail). As rotas de autenticação aceitam 10 requisições por minuto por IP.

### RPC

`POST /rpc/:name` com os parâmetros nomeados no corpo (`{ "p_id": "…", "p_name": "…" }`). Só existem as funções com `GRANT EXECUTE … TO cantum_user` no SQL. Retorno:

| A função retorna | Resposta |
|---|---|
| `void` | `null` |
| linha (`returns tabela`) | objeto |
| `setof` linha / `returns table` | array de objetos |
| escalar | o valor, em JSON (texto vem entre aspas) |
| `setof` escalar | array de valores |

### Tabelas (`/sync/:table`)

Só tabelas com grant para `cantum_user`, sempre sob RLS. Filtros são de igualdade, pela query string (`?id=…&user_id=…`), com colunas validadas no catálogo.

| Método | Uso | Corpo | Resposta |
|---|---|---|---|
| `GET` | ler tudo que a RLS permite, com filtros opcionais | — | array de linhas |
| `POST` | upsert pela chave primária (até 500 linhas) | `{ rows: [...] }` | `{ count }` |
| `PATCH` | atualizar colunas; filtro obrigatório | `{ values: {...} }` | `{ count }` |
| `DELETE` | apagar; filtro obrigatório | — | `{ count }` |

Uma linha que a RLS não deixa ver ou alterar não gera erro em `PATCH` e `DELETE`: o `count` vem 0. Um `POST` que a RLS recusa devolve 403. Tabelas que o `cantum_user` só lê (ex.: `stage_sessions`, `stage_session_states`, que mudam só por `target_stage_*`) recusam `POST`, `PATCH` e `DELETE` com 403.

### Outros

`GET /health` → `{ ok: true }`. Requisições de escrita com cabeçalho `Origin` diferente de `APP_ORIGIN` recebem 403.

### Escala (`/schedule`)

**Convites automáticos:** depois do commit de `transition_service` (serviço sai de `draft`) e de `assign_member` (serviço já fora de `draft`), o `/rpc` reivindica no banco (`app.claim_pending_invites`, atômico por `invite_sent_at`) os convites ainda não enviados e manda o e-mail; não duplica, e falha do provedor não desfaz a transição nem a atribuição (log sem endereço nem link). O Líder pode reenviar à mão:

`POST /schedule/assignments/:id/resend-invite` (sem corpo, exige sessão): reenvia o e-mail do convite de escala (ADR-054). Quem gere a escala da equipe do serviço dispara; só atribuição `invited` de serviço fora de `draft` e não final; no máximo um envio por minuto por atribuição (429 depois). O e-mail leva pessoa, função, serviço, data/hora e um link para `/meus-servicos`, que exige login: nada confirma sem autenticar. 204 em caso de sucesso, inclusive se o provedor de e-mail falhar (registrado no log, sem endereço nem link). As mudanças de estado da atribuição são só por RPC (`assign_member`, `respond_to_assignment`, `request_replacement`, `replace_assignment`, `cancel_assignment`); `assignments` não aceita escrita pelo `/sync`.

### Tempo real (`/realtime`)

WebSocket do Modo Palco; o contrato completo (mensagens, erros, códigos de fechamento, consistência) está em [`docs/REALTIME_CONTRACT.md`](../docs/REALTIME_CONTRACT.md). Implementação em `src/realtime.ts`, com `@fastify/websocket`.

- **Handshake:** `Origin` obrigatório e igual a `APP_ORIGIN` (senão HTTP 403, sem upgrade); cookie `cantum_session` válido (senão o upgrade completa e fecha com 4401).
- **Tópico:** `stage-session:<uuid>` (minúsculo). Autorizado por `app.can_subscribe_stage_session(uuid)` no `subscribe` e a cada revalidação; o `snapshot` é sempre lido por `get_target_stage_snapshot` com a identidade do assinante.
- **Mudanças:** trigger `stage_session_states_notify` → `pg_notify('stage_state_changed', {"stage_session_id","revision"})` → `LISTEN` numa conexão dedicada (`application_name = cantum-realtime-listener`), com reconexão e resync dos tópicos assinados.
- **Presença:** em memória, por conexão e tópico, deduplicada por usuário. `userId` e `displayName` vêm da sessão; o cliente só escolhe `musicalRole` e `readiness`. O `displayName` é `app.users.display_name`, lido uma vez por conexão (`displayNameFor` em `src/realtime.ts`). Assinar exige `stage.run`: membro `inactive` em todas as equipes recebe `forbidden`, também na revalidação.
- **Limites:** 4 KiB por mensagem (1009), 30 mensagens a cada 10 s (1008), 4 tópicos por conexão, 10 conexões por usuário (4429), 60 s sem mensagem encerra com 1001, revalidação a cada 60 s. Os intervalos são opções de `buildApp({ realtime })` para os testes.
- **Uma instância só:** assinaturas e presença são locais ao processo (ADR-059 §6).

## Produção

Render + Neon + Brevo (ADR-060). Configuração em [`render.yaml`](../render.yaml); roteiro para o owner em [`docs/OPERATIONS.md`](../docs/OPERATIONS.md).

- **Migrations sem psql:** `node src/migrate.ts` aplica `db/migrations` em `DATABASE_URL`, com o mesmo contrato do `scripts/db/migrate.sh`, e dá ao usuário da conexão a participação em `cantum_user` e `cantum_anon`, necessária para o `set local role` num banco gerenciado. Roda no start, antes do servidor.
- **Front na mesma origem:** se `../dist/index.html` existir (`npm run build` na raiz), o servidor serve o build. Rotas sem extensão fora de `/auth`, `/rpc`, `/sync`, `/realtime` e `/health` recebem o `index.html` (SPA). Arquivos em `assets/` têm cache longo; o resto revalida. O front é montado com `VITE_API_URL` igual à URL do serviço.
- **E-mail:** `BREVO_API_KEY` e `MAIL_FROM` (`Nome <email>`) ligam o `brevoMailer`. Com `NODE_ENV=production`, o servidor não sobe sem os dois, porque o mailer de desenvolvimento registra links com token no log.
- **Proxy:** `TRUST_PROXY=<n>` é o número de proxies confiáveis na frente do servidor (1 no Render). O IP do cliente (rate limit, log) vem do `X-Forwarded-For` contado a partir do fim; o que vem antes, e que o cliente pode forjar, é ignorado. Sem a variável, vale o IP do socket. `HOST=0.0.0.0` expõe a porta `PORT`.
- **Logs:** o log de requisição não leva a query string (os links de e-mail levam o token nela) nem cookies.
