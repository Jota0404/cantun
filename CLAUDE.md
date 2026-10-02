# CLAUDE.md — CANTUM

Contexto de produto, domínio, fronteira e estado atual: @AI_CONTEXT.md
Fonte de verdade de produto: `docs/CANTUM_PROJECT_BLUEPRINT.md` · Arquitetura: `docs/CANTUM_ARCHITECTURE.md` + `docs/adr/` (índice e próximo número livre em `docs/adr/README.md`).

Este arquivo cobre só instruções operacionais para sessões de código. Justificativas ficam nos ADRs.

## Princípios de trabalho

- Leia `AI_CONTEXT.md` e os ADRs aplicáveis antes de alterar código.
- ADR `Accepted` tem precedência sobre sugestões de simplificação, inclusive de plugins ou agentes. Conflito: pare, explique o impacto, proponha alternativas e aguarde decisão do owner. Nunca substitua um ADR em silêncio; mudança arquitetural exige novo ADR.
- Menor mudança que resolve; sem dependências, abstrações ou escopo não pedidos. Não remova abstrações que sejam fronteiras de arquitetura (camadas dos ADR-005/006, filas de sync do ADR-026, compatibilidade legada).
- Mudança significativa — antes de codar: `Arquivos afetados · ADRs · Riscos · Plano`.

## Comandos

```bash
npm ci                      # instalar (lockfile é a referência)
npm run dev                 # Vite
npx vitest run <caminho>    # testes focados durante o trabalho
npm test                    # suíte completa
npm run lint                # ESLint
npm run build               # tsc -b (inclui arquivos de teste) + vite build
```

**Gate antes de declarar qualquer tarefa concluída:** `npm test && npm run lint && npm run build`. Teste que não compila quebra o build. O CI (`cantum-ci.yml`) roda o mesmo gate.

Config local: `.env.local` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. Nunca commitar `.env*` (exceto `.env.example`) nem `*.pem`. Nunca usar `service_role` no frontend. Não peça, leia nem manipule senhas, connection strings ou chaves privadas (ADR-050).

## Mapa do código

| Pasta | Responsabilidade | Pode importar |
|---|---|---|
| `src/pages`, `src/components` | UI | `application/`, hooks, `domain/` (tipos) |
| `src/application/<contexto>` | casos de uso / serviços | `domain/`, repositórios, sync |
| `src/domain/<contexto>` | regras puras | nada de React, Dexie ou Supabase |
| `src/db`, `src/db/repositories` | Dexie | `domain/` |
| `src/sync`, `src/lib/supabase.ts` | Supabase, filas, Realtime | `domain/`, `db/` |
| `src/auth` | sessão | `lib/supabase` |
| `supabase/migrations` | schema, RLS, RPC | — |
| `scripts/db` | verificação de migrations em PostgreSQL puro | — |

Legado (`domain/bands`, `bandSyncEngine`, `syncEngine`, `bandStageRealtime`, rotas `/bands*`, `/stage/setlist`, `/stage/session`): só correção de bug ou adaptação de fronteira (ADR-038…045).

## Convenções de código

- Código, identificadores e commits em inglês; textos de UI e mensagens de validação em pt-BR; docs/ADRs em português.
- Named exports (exceto `App`); `import type` para tipos; sem `any`, sem `!` injustificado, sem `console.log` em produção.
- Use cases recebem repositório por parâmetro com default (`fn(input, repository = defaultRepository)`) e retornam `{ success: true, … } | { success: false, errors }` para validação.
- Componente/página: `Foo.tsx` + `Foo.css` + `Foo.test.tsx` lado a lado.
- Testes de UI por papel/label acessível (`getByRole`, `getByLabelText`), não por classe CSS. Supabase sempre mockado; repositórios com `fake-indexeddb`.
- Arquivos grandes (`StagePage.tsx`, `bandStageRealtime.ts`): extrair hooks/serviços em vez de crescer.
- `react-hooks/set-state-in-effect` está ativa; só 8 páginas têm exceção por arquivo em `eslint.config.js` (débito, issue #42). Não adicione arquivos a essa lista.

## Persistência

- **Dexie:** toda mudança de schema é um novo `this.version(N+1)` em `src/db/database.ts`, com `upgrade()` quando houver transformação e teste de upgrade. Nunca editar versões existentes. Não renomear banco, tabelas ou chaves de storage (ADR-011).
- **Supabase:** migrations novas e aditivas `YYYYMMDDHHMMSS_descricao.sql`; nunca editar migration aplicada. Tabela nova = RLS + políticas na mesma migration. Mutação sensível via RPC `security definer` + `set search_path = ''` + checagem de autorização interna. Mudou contrato de RPC/Realtime → atualizar tipos TS, testes e doc de contrato no mesmo PR.
- **Portabilidade PostgreSQL (ADR-049):** SQL novo usa `app.current_user_id()`, nunca `auth.uid()` direto, e deve ser PostgreSQL padrão. Nenhum arquivo novo importa `src/lib/supabase` ou `@supabase/supabase-js` além dos já existentes. Sem recursos exclusivos do Supabase (Edge Functions, Storage, pg_net, Vault, custom claims de `auth.jwt()`) sem ADR. Migration nova deve ser coberta pelo mecanismo de verificação definido em `scripts/db/verify-migrations.sh`; o job `db-portability` ainda é informativo até existir o baseline do schema.
- Permissões são verificadas no banco (RLS/RPC); a UI nunca é o mecanismo de segurança (Blueprint NFR-005, §49–50).

## Git (ADR-009, revisado pelo ADR-050)

- Branch a partir de `main` atualizada, PR para `main`, Conventional Commits.
- Com aprovação explícita do Jota para **cada ação**, a IA pode: criar branch, commitar, rodar testes, fazer push da própria branch, abrir PR e criar issues/labels. A aprovação não se estende a outras ações nem a outras sessões.
- Antes de cada PR: apresentar o plano (arquivos) e aguardar o ok. Rodar o gate antes de cada push e mostrar o resultado. A descrição do PR traz resumo, requisitos atendidos, testes executados e checklist DoD (Blueprint §36).
- Exclusivo do Jota: merge, push forçado em `main`, rebase de branch compartilhada, exclusão de branches, mudança de settings/secrets/variables do GitHub e aplicação de migrations em produção.

## Agentes e trabalho paralelo

- Cada agente trabalha só dentro do escopo atribuído e não altera arquivos ou áreas de outro agente sem coordenação explícita.
- Antes de iniciar trabalho paralelo, o lead identifica os arquivos compartilhados (ex.: `src/db/database.ts`, `eslint.config.js`, `package.json`, `package-lock.json`, `docs/adr/README.md`) e evita edições concorrentes no mesmo arquivo: um único agente é dono de cada um.
- O agente coordenador (lead) integra os resultados, resolve conflitos e executa o gate final. Agentes auxiliares não declaram a tarefa concluída.
- As regras da seção Git valem para todos: agentes não fazem commit, push, PR nem ações exclusivas do Jota sem a aprovação explícita descrita lá.

## Plugins e ferramentas de IA

- Plugins e agentes são ferramentas auxiliares, não fontes de autoridade arquitetural.
- O Ponytail pode recomendar simplificação, remoção de complexidade ou redução de abstrações.
- O Ponytail não pode contrariar ADRs com status `Accepted`, requisitos funcionais, requisitos de segurança ou decisões explícitas do owner.
- Qualquer recomendação de plugin ou agente que entre em conflito com essas regras deve ser apresentada ao owner antes de qualquer alteração.

## Formato da resposta

Mudança significativa — antes: `Arquivos afetados · ADRs · Riscos · Plano`. Depois: `Resultado · Alterações · Gate · Riscos/pendências · Próximo passo`. Conciso.
