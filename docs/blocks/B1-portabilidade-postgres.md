# B1 — Portabilidade PostgreSQL (ADR-049, Fase A)

> Fase 0 · Esforço: 1–2 semanas · Depende de: B0 + **dump do schema de produção (owner)** · Em paralelo com B2–B5

## Objetivo
Tornar o banco **reproduzível a partir do Git** e o código **independente do Supabase**, preparando a troca para um backend próprio (padrão E.C.H.O) sem parar o produto.

## Estado atual
- 19 das 36 migrations falham em PostgreSQL puro. Causas: `position` sem aspas em `RETURNS TABLE`; mudança de tipo de retorno sem `drop`; trigger recriado sem `drop`; FKs para `songs(id)` com PK `(user_id, id)`. **A produção diverge do repositório.**
- Existem `scripts/db/platform-shim.sql`, `scripts/db/verify-migrations.sh`, o workflow `db-portability` (informativo) e `app.current_user_id()` (PR #40).
- Acoplamento: 173 `auth.uid()`, 19 FKs para `auth.users`, 18 `.from()` + 47 `.rpc()` em 31 arquivos TS, 3 canais Realtime.

## Escopo

### A0 — Baseline (bloqueante)
1. O owner gera `prod-schema.sql` (só schema de `public`, `private`, `app` + políticas de `realtime.messages`) e `applied.txt` (`supabase_migrations.schema_migrations`). Nunca exportar dados.
2. Comparar com o resultado do harness e documentar as divergências em `docs/db/BASELINE_DIFF.md`.
3. Versionar `db/baseline/0000_baseline.sql`, normalizado e sem objetos da plataforma.
4. Harness: shim + baseline + migrations com timestamp maior que o do baseline. Workflow `db-portability` **bloqueante** (remover `continue-on-error`).
5. Documentar em `supabase/README.md` como ambientes novos são criados.

### A1 — Identidade e papéis no SQL
- Migration que recria funções e políticas trocando `auth.uid()` por `app.current_user_id()`. É mecânica, com `create or replace function` e `drop policy` / `create policy`.
- Tabela `app.users (id, email, created_at)` alimentada por trigger em `auth.users`. FKs **novas** apontam para `app.users`.
- Testes de RLS multiusuário em SQL no harness: dois `sub`, duas organizações; um não lê nem escreve na organização do outro.

### A2 — Camada de plataforma no TypeScript
```text
src/platform/auth.ts       AuthGateway       signIn, signUp, signOut, getSession, onSessionChange
src/platform/data.ts       DataGateway       call(rpc, args), select(table, query)
src/platform/realtime.ts   RealtimeGateway   join(topic) → broadcast/presence/state
src/platform/supabase/     adaptadores (únicos a importar @supabase/supabase-js)
```
- Migrar por contexto, um PR cada: auth → organizations/teams → repertoires/services → stage/realtime → sync engines.
- ESLint `no-restricted-imports` bloqueando `@supabase/supabase-js` e `src/lib/supabase` fora de `src/platform/supabase/`.
- Testes passam a mockar os gateways.

### A3 — Contrato de Realtime
`docs/REALTIME_CONTRACT.md`: tópicos, eventos, payloads, presença/readiness, quem pode emitir (só o MD muta), `revision` monotônica, reconexão e snapshot.

**Não entra:** backend próprio (B9); troca de provedor; Storage.

## Entregáveis por PR
1. `chore/db-baseline` (A0) · 2. `refactor/sql-identity-contract` (A1) · 3–7. `refactor/platform-*` (A2, um por contexto) · 8. `docs/realtime-contract` (A3).

## Critérios de aceite
- `verify-migrations.sh` recria o banco do zero sem erro e o CI bloqueia regressões.
- Zero `auth.uid()` em funções e políticas ativas (consulta ao catálogo no harness).
- Zero imports do Supabase fora de `src/platform/supabase/` (ESLint).
- Contrato de Realtime documentado e revisado.

## Riscos
- Divergência prod × repo maior que o esperado → o baseline vem do dump, nunca da cadeia.
- Regressão de autorização na troca de identidade → testes de RLS antes do merge.

## Owner precisa
Gerar o dump (instruções em `scripts/db/export-production-schema.md`, do B0) e aplicar as migrations novas na produção.
