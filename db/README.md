# CANTUM — banco PostgreSQL

Schema do backend próprio (ADR-059). Única fonte do schema: as migrations do Supabase foram removidas no fim do B1 e ficam só no histórico do Git.

## Estrutura

| Caminho | Conteúdo |
|---|---|
| `db/migrations/0001_baseline.sql` | schema consolidado (gerado uma vez; ver abaixo) |
| `db/migrations/NNNN_descricao.sql` | mudanças seguintes, aditivas, uma por PR |
| `db/tests/*.sql` | verificações em SQL; cada falha levanta exceção |
| `scripts/db/migrate.sh <banco>` | aplica o que falta e registra em `app.schema_migrations` |
| `scripts/db/verify-migrations.sh` | banco descartável + migrations + idempotência + testes (o mesmo job do CI) |

## Rodar localmente

PostgreSQL 16 (ex.: `brew install postgresql@16` e `brew services start postgresql@16`), com um superusuário `postgres` ou `PGUSER` apontando para o seu usuário:

```bash
PGUSER=postgres scripts/db/verify-migrations.sh
```

## Modelo de acesso

- `cantum_anon` e `cantum_user` são papéis `NOLOGIN`. O servidor conecta com um papel de login que é membro deles e, em cada requisição, abre uma transação com `set local role cantum_user` e `select set_config('app.user_id', <id>, true)`.
- `app.current_user_id()` lê `app.user_id`. Toda política e função usa essa função; nunca `auth.uid()`.
- A autorização mora no banco: RLS em toda tabela de dados e funções `security definer` com `set search_path = ''` e checagem interna.
- `app.users` guarda as contas; `app.sessions` e `app.email_tokens` guardam só hashes de tokens (`0002_auth.sql`). Nenhuma dessas tabelas tem grant para os papéis de requisição: só o servidor acessa. Ver `server/README.md`.
- `pgcrypto` fica no schema `extensions` e é chamado com nome qualificado (`extensions.digest`, `extensions.gen_random_bytes`).

## Como o baseline foi gerado (2026-10-08)

1. As 37 migrations da antiga pasta `supabase/migrations` (removida no B1; ver o histórico do Git) foram aplicadas em PostgreSQL 16 puro, com o shim da plataforma e 6 correções de causa-raiz:
   - coluna `"position"` sem aspas em `returns table` (3 arquivos);
   - `get_band_stage_setlist` recriada com outro tipo de retorno sem `drop`;
   - trigger `band_stage_states_protect_invariants` recriado sem `drop`;
   - FKs para `songs(id)` sem `unique (id)` (resolvido com `songs_id_key unique (id)`; o `id` já é UUID global);
   - `revoke` de `sync_target_stage_state` antes de a função existir;
   - `create_target_stage_session` e `get_target_stage_snapshot` recriadas com parâmetros renomeados sem `drop`.
2. O legado Band/Setlist foi removido: tabelas `band_*`, `setlists`, `setlist_songs`, `private.legacy_band_*`, funções `band_*` e pontes de compatibilidade, e a coluna `stage_sessions.legacy_band_stage_session_id`.
3. `pg_dump --schema-only` de `public`, `private` e `app`, transformado assim:
   - `auth.uid()` → `app.current_user_id()`;
   - `auth.users` → `app.users`;
   - `anon`/`authenticated` → `cantum_anon`/`cantum_user`, sem `service_role`;
   - pgcrypto qualificado.
4. Correções de bugs que o PostgreSQL puro revelou:
   - **pgcrypto sem schema** em funções com `search_path = ''`: criar e aceitar convite falhava;
   - **recursão infinita** nas políticas de `organization_memberships` e `team_memberships`, que se consultavam. Agora usam `app.is_organization_member()` e `app.has_organization_role()` (`security definer`).

O baseline não é regenerado: a partir daqui, toda mudança é uma migration nova.

## Regras para migrations novas

- Nunca editar migration aplicada; aditiva sempre.
- Tabela nova = `enable row level security` + políticas na mesma migration.
- PostgreSQL padrão, sem recurso exclusivo de provedor.
- Comportamento novo de autorização vem com teste em `db/tests/`, incluindo casos negativos (outra organização, sem vínculo, anônimo).
