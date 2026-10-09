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

`GET /health` → `{ ok: true }`. Requisições de escrita com cabeçalho `Origin` diferente de `APP_ORIGIN` recebem 403. O realtime (`/realtime`) entra no PR 3 do B1.

## Produção

Ainda não suportada: o servidor recusa `NODE_ENV=production` enquanto não houver provedor de e-mail, porque o mailer de desenvolvimento registra os links com token no log. Hospedagem e provedor são decisões do owner (ADR-059).
