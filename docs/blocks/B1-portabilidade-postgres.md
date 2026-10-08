# B1 — Backend próprio: PostgreSQL + Node.js (ADR-059)

> Fase 0/1 · Esforço: 4–6 semanas de dedicação parcial · Depende de: B0 · Bloqueia: SQL do B2 (#57) · Absorve o antigo B9
> Nome do arquivo mantido por causa dos links existentes; o conteúdo antigo (portabilidade gradual, ADR-049 Fase A) foi substituído.

## Objetivo
Tirar o CANTUM do Supabase de uma vez: banco PostgreSQL reproduzível a partir do Git, backend próprio em Node.js + TypeScript e cliente sem `@supabase/supabase-js`, com a autorização continuando no banco. Como não há usuários reais, não há migração de dados nem convivência.

## Estado atual
- 36 migrations Supabase; 19 falham em PostgreSQL puro (ver `docs/BACKEND_MIGRATION_PLAN.md` §2).
- `app.current_user_id()` já existe (PR #40). Ainda há 173 `auth.uid()` e 19 FKs para `auth.users`.
- 30 arquivos TS importam o Supabase; 29 RPCs, das quais 13 são do legado `Band*`.
- Realtime do Modo Palco em `stage-session:<id>:state` (canônico) e `band-stage:<id>` (legado).

## Escopo

**Entra** (detalhe e donos em `docs/BACKEND_MIGRATION_PLAN.md` §3):
1. **Baseline** `db/migrations/0001_baseline.sql` + runner + CI `db` bloqueante + testes de RLS multiusuário.
2. **Servidor** `server/`: auth própria (`scrypt`, sessão opaca em cookie `HttpOnly`, verificação e reset de e-mail), `/rpc/:name` com allowlist, `/sync/:table`, rate limit, logs sem conteúdo privado.
3. **Realtime** WebSocket + `docs/REALTIME_CONTRACT.md`.
4. **Cliente** `src/platform/{auth,rpc,realtime}.ts` no lugar de `src/lib/supabase.ts`.
5. **Remoção do legado** (`Band*`, `Setlist*`, rotas e stores legadas), com nova `version()` do Dexie.
6. **Remoção do Supabase** (dependência, `supabase/`, shim, docs de dump).

**Não entra:** hospedagem de produção (decisão do owner, antes do primeiro usuário real, junto com o B8); Storage/Materiais (B6); multi-instância do realtime.

## Critérios de aceite
- `db/` recria o banco do zero; o CI bloqueia regressões.
- Testes de RLS: usuário de outra organização não lê nem escreve; anônimo não acessa nada privado; membro `inactive` não age.
- Nenhum import do Supabase; gate verde; fluxos manuais da §5 do plano OK contra o servidor local.

## Riscos
Ver `docs/BACKEND_MIGRATION_PLAN.md` §6.

## Owner precisa
- Aceitar o ADR-059.
- Antes do primeiro usuário real: escolher a hospedagem (mesmo site para front e API) e o provedor de e-mail.
- Depois do cutover: desligar o projeto Supabase.
