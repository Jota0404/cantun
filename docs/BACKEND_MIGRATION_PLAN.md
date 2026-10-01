# CANTUM — Plano de migração: Supabase → PostgreSQL + backend próprio

> Decisão: [ADR-049](adr/ADR-049-postgres-portability-and-own-backend.md) · Status: **Fase A em andamento** · Atualizado: 2026-10-01
> Estratégia: **portabilidade agora (Fase A), backend próprio depois (Fase B)**, sem parar o roadmap de produto do Blueprint.

## 1. Mapa de dependências do Supabase (`main` @ `ef82afd`)

| Camada | Recurso Supabase | Volume | Substituto na Fase B |
|---|---|---|---|
| Auth | `supabase.auth` (senha, sessão, refresh, e-mail) | `AuthContext`, convites | Auth do backend (hash de senha, sessão/JWT, verificação e reset por e-mail) |
| Identidade no SQL | `auth.uid()`, FK `auth.users` | 173 usos · 19 FKs | `app.current_user_id()` + tabela `app.users` |
| Papéis | `anon`, `authenticated`, `service_role` | 113 `to authenticated` | Papéis próprios (`cantum_anon`, `cantum_user`, `cantum_service`) ou os mesmos nomes |
| API | PostgREST `.from()` / `.rpc()` | 18 + 47 chamadas em 31 arquivos · 29 RPCs | Endpoints do backend chamando as **mesmas funções SQL** |
| Autorização | RLS + `security definer` | 76 políticas · 120 funções | Mantidas: o backend faz `set local role` e `set_config('app.user_id', …)` por transação |
| Realtime | broadcast, presence, `postgres_changes`, `realtime.messages` | 3 canais (Modo Palco) | WebSocket do backend + `LISTEN/NOTIFY` (ou Redis pub/sub) |
| Storage | — | não usado | S3/compatível quando "Materiais" (Blueprint §16.4) entrar |

## 2. Achado crítico — a cadeia de migrations não é reproduzível

`scripts/db/verify-migrations.sh` aplicou as 36 migrations em PostgreSQL 16 puro (com `scripts/db/platform-shim.sql`): **17 OK, 19 falham**. Quatro causas-raiz, o resto é cascata:

| # | Migration(s) | Erro | Causa |
|---|---|---|---|
| 1 | `20260908001000_band_stage_setlist_rpc`, `20260908143000_musical_roles`, `20260920180000_service_stage_read_path` | `syntax error at or near "position"` | `position` é palavra-chave; não pode ser nome de coluna em `RETURNS TABLE (...)` sem aspas. Falha em qualquer PostgreSQL |
| 2 | `20260908143000_musical_roles` | `cannot change return type of existing function` | `create or replace` de `get_band_stage_setlist` com colunas novas exige `drop function` antes |
| 3 | `20260908190000_band_stage_preparation` | trigger `band_stage_states_protect_invariants` já existe | Recria trigger sem `drop trigger if exists` |
| 4 | `20260920140000`, `…150000`, `…160000`, `…190000` | `no unique constraint matching given keys for referenced table "songs"` | `songs` tem PK `(user_id, id)`; FKs novas apontam para `songs(id)` sem constraint `unique (id)` |

**Conclusão:** o banco de produção foi construído com SQL diferente do que está no repositório (edições no SQL Editor e/ou migrations não aplicadas). Hoje **não é possível recriar o banco a partir do Git**. Isso bloqueia a portabilidade, a recuperação de desastre (NFR-009) e qualquer ambiente de teste.

## 3. Fase A — Portabilidade (agora · ~1–2 semanas)

### A0 · Baseline do schema real — **bloqueante, precisa do owner**

1. Exportar o schema e o histórico aplicado da produção (connection string em *Supabase → Project Settings → Database*):

   ```bash
   pg_dump "$SUPABASE_DB_URL" --schema-only --no-owner --no-privileges \
     --schema=public --schema=private --schema=app > prod-schema.sql
   pg_dump "$SUPABASE_DB_URL" --schema-only --no-owner \
     --table='realtime.messages' >> prod-schema.sql   # políticas de realtime
   psql "$SUPABASE_DB_URL" -c "select version, name from supabase_migrations.schema_migrations order by version" > applied.txt
   ```

   *(Alternativa: `supabase db dump --schema public,private`.)* Não exportar dados neste passo.
2. Comparar `prod-schema.sql` com o resultado do harness e registrar as divergências.
3. Versionar `db/baseline/0000_baseline.sql` (schema de produção normalizado, sem objetos da plataforma). Migrations com timestamp ≤ baseline viram histórico; ambientes novos aplicam *shim + baseline + migrations posteriores*.
4. Ajustar `verify-migrations.sh` para esse fluxo e **tornar o job `db-portability` bloqueante**.

### A1 · Contrato de identidade e papéis no SQL

- ✅ `app.current_user_id()` (migration `20261001200000_app_identity_portability`).
- Migration mecânica: `create or replace` de todas as funções e recriação das políticas trocando `auth.uid()` → `app.current_user_id()` (verificada pelo harness).
- `app.users (id, email, created_at)` alimentada por trigger em `auth.users` na Fase A. FKs novas apontam para `app.users`. Na Fase B, `app.users` vira a tabela de usuários do backend.
- Testes de RLS multiusuário em SQL rodando no harness (dois `sub` distintos, uma organização cada).

### A2 · Camada de plataforma no TypeScript

```text
src/platform/
  auth.ts        AuthGateway      signIn, signUp, signOut, getSession, onSessionChange
  data.ts        DataGateway      call(rpcName, args), select(table, query)   ← 47 rpc + 18 from
  realtime.ts    RealtimeGateway  join(topic) → broadcast / presence / onStateChange
  supabase/      adaptadores atuais (únicos a importar @supabase/supabase-js)
```

- Migrar os 31 arquivos para os gateways, um contexto por PR (auth → organizations/teams → repertoires/services → stage/realtime → sync engines).
- Regra ESLint `no-restricted-imports` bloqueando `@supabase/supabase-js` e `src/lib/supabase` fora de `src/platform/supabase/`.
- Os testes mockam os gateways, não o client do Supabase.

### A3 · Contrato de Realtime

`docs/REALTIME_CONTRACT.md`: tópicos (`stage-session:<id>:state`, `band-stage:<id>`), eventos, payloads, presença (`readiness`), regras de autorização (só o MD muta), `revision` monotônica e reconexão. Esse é o documento que o servidor WebSocket da Fase B vai implementar.

### Critério de saída da Fase A

- Banco recriável do zero a partir do Git; CI `db-portability` bloqueante e verde.
- Zero `auth.uid()` em funções e políticas ativas.
- Zero imports do Supabase fora de `src/platform/supabase/`.
- Contrato de realtime documentado.

## 4. Fase B — Backend próprio (após a Fase 1 do produto · ~6–10 semanas)

| Bloco | Conteúdo | Observação |
|---|---|---|
| B0 ADR de stack | linguagem/framework, hospedagem do PostgreSQL (padrão E.C.H.O; avaliar região Brasil), deploy | Define antes de codar |
| B1 Auth | cadastro, login, refresh, verificação e reset de e-mail, convites | Os hashes de senha do Supabase (`auth.users.encrypted_password`, bcrypt) podem ser migrados, evitando reset geral; validar no dump |
| B2 API | endpoints 1:1 para as RPCs existentes; o backend executa a função SQL com `set local role` + `app.user_id` | RLS e regras continuam no banco |
| B3 Realtime | WebSocket + `LISTEN/NOTIFY`, implementando `REALTIME_CONTRACT.md` | Presença em memória/Redis; nunca persistida (Blueprint §51.2) |
| B4 Adaptadores | `src/platform/http/` implementando os mesmos gateways | Troca por variável de ambiente |
| B5 Operação | backups e restore testados (NFR-009), observabilidade (NFR-008), rate limit, logs sem conteúdo privado | Pré-requisito de produção |
| B6 Cutover | migração de dados (public/private + usuários), período de dupla validação, desligamento do Supabase | Plano de rollback documentado |

## 5. Riscos

| Risco | Mitigação |
|---|---|
| Divergência prod × repo maior do que o detectado | A0 com dump real antes de qualquer migration nova de grande porte |
| Regressão de autorização na troca `auth.uid()` → `app.current_user_id()` | Testes RLS multiusuário no harness + função idêntica em comportamento na Fase A |
| Realtime próprio menos robusto que o do Supabase | Contrato e testes de reconexão/revision antes do cutover; Stage local-first continua funcionando sem rede |
| Esforço da Fase B competir com o produto | Fase B só começa após a Fase 1 do Blueprint; Fase A cabe dentro da Fase 0 |

## 6. Sequência de PRs

1. **PR — base de portabilidade** *(este)*: ADR-049, este plano, `scripts/db/*`, workflow `db-portability`, `app.current_user_id()`.
2. **PR — baseline A0** (depende do dump de produção).
3. **PR — SQL identity cutover A1** (auth.uid → app.current_user_id + testes RLS).
4. **PRs — platform gateways A2** (um por contexto) + regra ESLint.
5. **PR — contrato de Realtime A3**.
6. Fase B conforme ADR de stack.
