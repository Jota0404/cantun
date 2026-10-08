# CANTUM — Plano de migração: Supabase → PostgreSQL + backend próprio

> Decisão: [ADR-059](adr/ADR-059-own-backend-now.md) (substitui o cronograma do [ADR-049](adr/ADR-049-postgres-portability-and-own-backend.md)) · Bloco: [B1](blocks/B1-portabilidade-postgres.md) · Atualizado: 2026-10-08
> Estratégia: **saída completa e de uma vez**. Não há usuários reais nem dados a preservar, então não há convivência, migração de dados nem cutover gradual.

## 1. Mapa de dependências do Supabase (`main` @ `6b11ea5`)

| Camada | Recurso Supabase hoje | Volume | Substituto |
|---|---|---|---|
| Auth | `supabase.auth` (senha, sessão, refresh, e-mail) | `src/auth/*`, convites | `/auth/*` no `server/`: `scrypt`, sessão opaca em cookie `HttpOnly`, verificação e reset por e-mail |
| Identidade no SQL | `auth.uid()`, FK `auth.users` | 173 usos · 19 FKs | `app.current_user_id()` (lê `app.user_id`) + `app.users` |
| Papéis | `anon`, `authenticated`, `service_role` | 113 `to authenticated` | `cantum_anon`, `cantum_user` |
| API | PostgREST `.from()` / `.rpc()` | 30 arquivos · 29 RPCs (13 legadas) | `POST /rpc/:name` (allowlist) + `/sync/:table` |
| Autorização | RLS + `security definer` | 76 políticas · 120 funções | Mantidas; o servidor faz `set local role` + `set_config('app.user_id', …)` por transação |
| Realtime | broadcast, presence, `postgres_changes`, `realtime.messages` | canal `stage-session:<id>:state` (+ `band-stage:` legado) | WebSocket `/realtime` + trigger `pg_notify` / `LISTEN`; presença em memória |
| Storage | — | não usado | definido no ADR de Materiais (B6) |

## 2. A cadeia atual não é reproduzível

`scripts/db/verify-migrations.sh` aplicou as 36 migrations em PostgreSQL 16 puro: **17 OK, 19 falham**. Há 4 causas-raiz; as demais falhas vêm em cascata. O baseline corrige todas:

| # | Migration(s) | Erro | Correção no baseline |
|---|---|---|---|
| 1 | `20260908001000_band_stage_setlist_rpc`, `20260908143000_musical_roles`, `20260920180000_service_stage_read_path` | `syntax error at or near "position"` | coluna `"position"` entre aspas em `returns table` (as funções `band_*` saem junto com o legado) |
| 2 | `20260908143000_musical_roles` | `cannot change return type of existing function` | some: o baseline cria cada função uma vez, na forma final |
| 3 | `20260908190000_band_stage_preparation` | trigger já existe | some: trigger criado uma vez (e legado removido) |
| 4 | `20260920140000`, `…150000`, `…160000`, `…190000` | FK para `songs(id)` sem `unique (id)` | `songs` ganha `unique (id)` (o `id` já é UUID global) ou as FKs passam a usar `(user_id, id)`; decidir no PR do baseline |

## 3. Sequência de PRs (bloco B1)

| # | Branch | Conteúdo | Dono |
|---|---|---|---|
| 1 | `chore/db-baseline` | `db/migrations/0001_baseline.sql` (schema final, sem legado, sem objetos da plataforma), runner de migrations, `scripts/db/verify-migrations.sh` apontando para `db/`, job `db` **bloqueante** no CI, testes de RLS multiusuário em SQL | backend-engineer |
| 2 | `feat/server-core` | `server/`: config, pool `pg`, helper de transação com papel e `app.user_id`, `/auth/*`, `/rpc/:name`, `/sync/:table`, rate limit, logs sem conteúdo privado, testes de integração contra PostgreSQL | backend-engineer |
| 3 | `feat/server-realtime` | `docs/REALTIME_CONTRACT.md` + WebSocket `/realtime` (tópicos, `revision` monotônica, só o MD muta, presença em memória, reconexão com snapshot) | backend-engineer |
| 4 | `refactor/client-platform` | `src/platform/{auth,rpc,realtime}.ts`; migrar `src/auth`, `application/*` e `sync/*` para eles; testes mockam `src/platform` | core-engineer (+ ui-engineer em `src/auth` e páginas) |
| 5 | `refactor/remove-legacy` | remove `Band*`, `Setlist*`, `BandSyncEngine`, `bandStageRealtime`, bridges `legacyBand*` e rotas legadas; nova `version()` do Dexie removendo as stores legadas, com `upgrade()` e teste | core-engineer + ui-engineer |
| 6 | `chore/remove-supabase` | remove `@supabase/supabase-js`, `src/lib/supabase.ts`, `supabase/`, `platform-shim.sql`, `export-production-schema.md`; atualiza `.env.example`, CI, deploy e docs | lead |

Os PRs 4 e 5 podem andar em paralelo com o 2 e o 3, desde que a interface de `src/platform` esteja combinada. O B2 (#57) escreve o SQL dele direto em `db/migrations/` depois do PR 1.

## 4. Desenvolvimento local

- PostgreSQL 16 local: Postgres.app, `brew install postgresql@16` ou container. No CI, serviço `postgres:16`.
- `.env` do `server/`: `DATABASE_URL`, `SESSION_SECRET`, `APP_ORIGIN`. Nunca commitar; a IA não lê nem manipula esses valores (ADR-050).
- E-mail em desenvolvimento: o link de verificação, reset ou convite aparece no log do servidor.

## 5. Critério de saída do B1

- Banco recriado do zero a partir de `db/`; job `db` bloqueante e verde.
- Zero `auth.uid()`, `auth.users` e objetos do Supabase no schema.
- Zero imports de `@supabase/supabase-js`; dependência removida.
- Fluxos manuais OK contra o servidor local: cadastro, verificação, login, organização, equipe, convite, música, repertório, serviço, Modo Palco (MD + músico, com queda e retorno de rede).
- `REALTIME_CONTRACT.md` revisado.

## 6. Riscos

| Risco | Mitigação |
|---|---|
| Regressão de autorização na troca de identidade | Testes de RLS multiusuário no PR 1 (duas organizações; usuário sem vínculo; anônimo) antes de qualquer endpoint |
| Realtime próprio menos robusto que o do Supabase | Contrato, `revision` monotônica e testes de reconexão; o Stage continua utilizável offline (ADR-042) |
| Cookie de sessão bloqueado entre domínios diferentes | Hospedar front e API no mesmo site; requisito registrado no ADR-059 |
| Operar backup e segurança por conta própria | NFR-009 e B8 antes do primeiro usuário real; restore testado |
| Escopo do B1 competir com o B2 | O B2 só espera o PR 1; domínio e UI do B2 podem andar em paralelo |
