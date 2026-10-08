# ADR-059 — Saída completa do Supabase: PostgreSQL + backend próprio em Node.js

- **Status:** Accepted (2026-10-08)
- **Data:** 2026-10-08
- **Decisor:** Jota (owner). Saída completa e de uma vez, stack Node.js + TypeScript + PostgreSQL e hospedagem definida depois; o ADR inteiro, inclusive a remoção do legado, foi aceito pelo owner em 2026-10-08.
- **Altera:** ADR-049 (o cronograma Fase A → Fase B é substituído; os princípios continuam), ADR-012 (provedor remoto). **Encerra** os limites de compatibilidade legada dos ADR-036, 038–041 e 045.
- **Plano:** [`docs/BACKEND_MIGRATION_PLAN.md`](../BACKEND_MIGRATION_PLAN.md) · Bloco [B1](../blocks/B1-portabilidade-postgres.md)

## Contexto

O ADR-049 previa sair do Supabase em duas fases: portabilidade gradual agora e backend próprio depois da Fase 1. Ele foi desenhado para proteger uma produção em uso. Esse cuidado deixou de ser necessário:

- o app **não tem usuários reais** e os dados no Supabase são só de teste (owner, 2026-10-08);
- a cadeia de migrations não é reproduzível (19 de 36 falham em PostgreSQL puro), e o dump de produção só serviria para preservar uma produção que não precisa ser preservada;
- fazer a Fase A e depois a Fase B mexeria duas vezes nos mesmos 31 arquivos e nas mesmas 29 RPCs;
- a camada de compatibilidade legada (`Band*`, `Setlist*`) existe só para preservar dados e links de usuários antigos, e esses usuários não existem.

## Decisão

1. **Saída completa agora, sem convivência.** O Supabase é substituído de uma vez, antes da implementação do B2 (#57–#60). Sem dupla escrita, sem migração de dados, sem período de cutover. Os dados de teste não são migrados.
2. **Banco.** PostgreSQL 16+ padrão. A fonte do schema passa a ser `db/`:
   - `db/migrations/0001_baseline.sql`: schema consolidado a partir das migrations atuais, com as 4 causas-raiz corrigidas, `auth.uid()` trocado por `app.current_user_id()`, `auth.users` trocado por `app.users`, e sem objetos da plataforma (`realtime.messages`, publicação `supabase_realtime`, papéis `anon`/`authenticated`/`service_role`);
   - papéis próprios: `cantum_anon`, `cantum_user` e o dono do schema;
   - migrations seguintes numeradas (`0002_…`), aplicadas por um runner próprio com a tabela `app.schema_migrations`;
   - `supabase/migrations` vira histórico e é removido no fim do B1. **O dump de produção fica dispensado.**
3. **Autorização continua no banco** (princípio do ADR-049): RLS + funções `security definer` com `set search_path = ''`. Cada requisição roda em uma transação com `set local role cantum_user` e `set_config('app.user_id', <id>, true)`. O backend não reimplementa regras de permissão.
4. **Backend.** `server/` no mesmo repositório, com `package.json` próprio: Node.js 24 + TypeScript, `fastify` (HTTP, validação, plugins de cookie, CORS, rate limit e WebSocket) e `pg` (driver). Endpoints:
   - `POST /rpc/:name`, só para funções de uma allowlist (1:1 com as RPCs atuais);
   - `GET /sync/:table?since=` e `POST /sync/:table` para as tabelas sincronizadas, com allowlist e sob RLS, preservando a fila e o LWW do ADR-026;
   - `/auth/*` e `/realtime` (WebSocket).
5. **Autenticação própria.**
   - **Senha:** `node:crypto` `scrypt` (biblioteca padrão; parâmetros OWASP), com e-mail verificado antes de aceitar convite vinculado a e-mail (`PERMISSIONS.md` §7.3).
   - **Sessão:** token opaco de 256 bits guardado só como hash em `app.sessions`, com expiração e revogação, entregue em cookie `HttpOnly; Secure; SameSite=Lax`. **Consequência:** front e API precisam estar no mesmo site (ex.: `app.dominio` + `api.dominio`), o que vira requisito da hospedagem.
   - **Proteções:** rate limit em login, cadastro, reset e convites.
   - **E-mail:** verificação, reset e convite passam por uma interface. Em desenvolvimento ela só registra o link no log; o provedor é escolhido junto com a hospedagem.
6. **Realtime.** WebSocket em `/realtime`, implementando `docs/REALTIME_CONTRACT.md` (a escrever no B1). Mudanças de `stage_session_states` chegam por trigger + `pg_notify` e `LISTEN` no servidor. A presença fica em memória, nunca persistida (Blueprint §51.2). A assinatura de um tópico é autorizada por função SQL. Uma instância só.
7. **Cliente.**
   - `src/platform/auth.ts`, `src/platform/rpc.ts` e `src/platform/realtime.ts` (HTTP/WS) substituem `src/lib/supabase.ts`;
   - `@supabase/supabase-js` sai do `package.json`;
   - os testes mockam esses módulos;
   - local-first, Dexie e as filas de sync (ADR-001, 026, 048) não mudam, só o transporte.
8. **Legado removido, não portado.**
   - **Sai:** `Band*`, `Setlist*`, `BandSyncEngine`, `bandStageRealtime`, rotas `/bands*`, `/stage/setlist`, `/stage/session`, os bridges `legacyBand*`, as RPCs `band_*`/`get_band_*` e as tabelas legadas. As stores legadas do Dexie saem em uma nova `version()`, com `upgrade()` e teste (ADR-011: nunca editar versões existentes).
   - **Fica:** `songs` e sua sincronização, que são core.
9. **Hospedagem: decisão adiada.** Desenvolvimento e CI usam PostgreSQL local ou em container. A escolha (de preferência região Brasil, por causa da LGPD) é do owner e acontece antes do primeiro usuário real, junto com o B8. Requisitos: mesmo site para front e API, backup com restore testado (NFR-009).

## Regras imediatas

- Nenhuma migration nova em `supabase/migrations`. SQL novo vai para `db/migrations/`, depois do baseline.
- SQL usa `app.current_user_id()`, PostgreSQL padrão, nada exclusivo de provedor.
- Nenhum arquivo novo importa `src/lib/supabase` ou `@supabase/supabase-js`.
- Dependência nova no `server/` exige justificativa no PR.

## Alternativas rejeitadas

- **Manter as Fases A e B do ADR-049:** trabalho dobrado para proteger dados que não existem.
- **Autohospedar Supabase ou PostgREST:** mantém acoplamento ao ecossistema e não é o padrão escolhido pelo owner.
- **JWT em `localStorage`:** exposto a XSS e difícil de revogar. Sessão opaca em cookie `HttpOnly` é a recomendação da OWASP.
- **Argon2id via dependência nativa:** `scrypt` da biblioteca padrão atende à OWASP sem binário nativo.
- **SQL Server / .NET:** reescreveria 76 políticas e 120 funções; descartado pelo owner.

## Consequências

- **Positivas:** um só banco reproduzível a partir do Git (pré-requisito do NFR-009); fim do acoplamento ao Supabase; remoção de cerca de metade das RPCs e de todo o runtime legado; o B2 já nasce no schema novo.
- **Custos:** operar auth, API, realtime, backups e observabilidade próprios; ordem de grandeza de 4 a 6 semanas de dedicação parcial; o B2 (#57) espera o baseline.
- **Owner:** depois do cutover, exportar o que quiser guardar e desligar o projeto Supabase (ação de produção, exclusiva do owner).
