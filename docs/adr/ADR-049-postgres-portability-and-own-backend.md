# ADR-049 — PostgreSQL portável agora, backend próprio depois

- **Status:** Accepted
- **Data:** 2026-10-01
- **Decisor:** Jota (owner)
- **Escopo:** Infraestrutura remota / banco / autenticação / realtime
- **Altera:** ADR-012 (Supabase passa a ser provedor **transitório**)
- **Plano de execução:** [`docs/BACKEND_MIGRATION_PLAN.md`](../BACKEND_MIGRATION_PLAN.md)

## Contexto

O ADR-012 adotou o Supabase para autenticação, PostgreSQL, RLS e sincronização. Desde então, o CANTUM passou a depender de quatro serviços da plataforma:

| Serviço | Dependência atual |
|---|---|
| Auth | `supabase.auth.*`, 19 FKs para `auth.users` |
| API (PostgREST/RPC) | 18 `.from()` e 47 `.rpc()` em 31 arquivos TypeScript |
| Autorização | 173 usos de `auth.uid()`, 76 políticas, 120 funções `security definer`, papéis `anon`/`authenticated` |
| Realtime | canais do Modo Palco (broadcast/presence), políticas em `realtime.messages`, publicação `supabase_realtime` |

O owner definiu como padrão da E.C.H.O Tech **PostgreSQL com backend próprio**, o mesmo usado nos demais produtos da empresa. Uma troca imediata custaria cerca de 2 a 3 meses (auth, API, autorização e realtime próprios) e atrasaria a Fase 1 do Blueprint.

Uma verificação em PostgreSQL 16 puro (`scripts/db/verify-migrations.sh`) mostrou ainda que **a cadeia de migrations do repositório não é reproduzível**: 19 das 36 migrations falham. São 4 causas-raiz, e as demais falhas vêm em cascata (ver o plano, §2). Portanto, o schema de produção não pode ser reconstruído a partir do repositório.

## Decisão

1. **Fase A — portabilidade (agora).** O Supabase continua como provedor, mas o CANTUM passa a depender de **contratos próprios**:
   - **SQL:** schema `app` com `app.current_user_id()`. Políticas e RPCs migram de `auth.uid()` para esse contrato. O SQL novo deve ser PostgreSQL padrão.
   - **Banco reproduzível:** baseline do schema de produção versionado e cadeia de migrations verificada no CI em PostgreSQL puro.
   - **TypeScript:** adaptadores em uma camada de plataforma (auth, dados/RPC, realtime). Só essa camada pode importar `@supabase/supabase-js`.
   - **Realtime:** contrato de tópicos, eventos e autorização documentado independentemente do provedor.
2. **Fase B — backend próprio (após a Fase 1 do produto).** O Supabase sai, substituído por backend próprio sobre PostgreSQL, conforme o padrão E.C.H.O. A stack do backend será definida em ADR próprio no início da Fase B.
3. **Princípio de continuidade.** A autorização continua **no banco** (RLS + funções). O backend próprio define, por transação, o papel e `app.user_id`, e reaproveita as políticas existentes em vez de reimplementá-las na aplicação.

## Regras imediatas

- SQL novo usa `app.current_user_id()`, nunca `auth.uid()` diretamente.
- Nenhum arquivo novo fora da camada de plataforma importa `src/lib/supabase` ou `@supabase/supabase-js`.
- Toda migration nova precisa aplicar sem erro em `scripts/db/verify-migrations.sh`.
- Nada de recursos exclusivos do Supabase sem ADR: Edge Functions, Storage, pg_net, Vault, `auth.jwt()` custom claims.

## Consequências

- **Positivas:** a troca de provedor vira uma decisão de infraestrutura e não uma reescrita; o banco fica reproduzível (pré-requisito também de backup e recuperação, NFR-009); o produto fica alinhado ao padrão da empresa; e o caminho fica aberto para hospedagem no Brasil (LGPD).
- **Custos:** cerca de 1 a 2 semanas na Fase A; na Fase B, operar auth, API, realtime, backups e observabilidade próprios.
- **Pré-requisito bloqueante:** obter o schema real de produção (dump) e a lista de migrations aplicadas (Fase A0).
- O ADR-012 continua válido para local-first, filas de sync e LWW. Só a escolha do provedor remoto passa a ser transitória.
