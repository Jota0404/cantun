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
| `supabase/migrations` | schema atual no Supabase; **congelado** (ADR-059) | — |
| `scripts/db` | verificação de migrations em PostgreSQL puro | — |
| `db/migrations` *(B1)* | schema PostgreSQL próprio: baseline + migrations numeradas | — |
| `server/` *(B1)* | backend Node.js + TS: auth, `/rpc`, `/sync`, `/realtime` | só `pg` e o próprio `server/` |
| `src/platform` *(B1)* | cliente HTTP/WS do `server/`; substitui `src/lib/supabase.ts` | — |

Legado (`domain/bands`, `bandSyncEngine`, `bandStageRealtime`, `Setlist*`, rotas `/bands*`, `/stage/setlist`, `/stage/session`): só correção de bug; sai no B1 (ADR-059).

## Convenções de código

- Código, identificadores e commits em inglês; textos de UI e mensagens de validação em pt-BR; docs/ADRs em português.
- Named exports (exceto `App`); `import type` para tipos; sem `any`, sem `!` injustificado, sem `console.log` em produção.
- Use cases recebem repositório por parâmetro com default (`fn(input, repository = defaultRepository)`) e retornam `{ success: true, … } | { success: false, errors }` para validação.
- Componente/página: `Foo.tsx` + `Foo.css` + `Foo.test.tsx` lado a lado.
- Testes de UI por papel/label acessível (`getByRole`, `getByLabelText`), não por classe CSS. Remoto sempre mockado (`src/lib/supabase` hoje, `src/platform` depois do B1); repositórios com `fake-indexeddb`.
- Arquivos grandes (`StagePage.tsx`, `bandStageRealtime.ts`): extrair hooks/serviços em vez de crescer.
- `react-hooks/set-state-in-effect` está ativa; só 8 páginas têm exceção por arquivo em `eslint.config.js` (débito, issue #42). Não adicione arquivos a essa lista.

## Persistência

- **Dexie:** toda mudança de schema é um novo `this.version(N+1)` em `src/db/database.ts`, com `upgrade()` quando houver transformação e teste de upgrade. Nunca editar versões existentes. Não renomear banco, tabelas ou chaves de storage (ADR-011).
- **PostgreSQL (ADR-049, ADR-059):** o Supabase sai no B1. Nenhuma migration nova em `supabase/migrations`; depois do baseline, SQL novo vai para `db/migrations/NNNN_descricao.sql`, aditivo, nunca editando migration aplicada. Tabela nova = RLS + políticas na mesma migration. Mutação sensível via função `security definer` + `set search_path = ''` + checagem de autorização interna. SQL usa `app.current_user_id()` (nunca `auth.uid()`) e PostgreSQL padrão, sem recurso exclusivo de provedor. Toda migration passa no job `db` (`scripts/db/verify-migrations.sh`).
- **Servidor:** a autorização mora no banco; o `server/` só abre a transação com `set local role cantum_user` + `app.user_id` e chama funções de uma allowlist. Não reimplementar regra de permissão em TypeScript. Dependência nova no `server/` exige justificativa no PR.
- Nenhum arquivo novo importa `src/lib/supabase` ou `@supabase/supabase-js`. Mudou contrato de RPC/Realtime → atualizar tipos TS, testes e doc de contrato no mesmo PR.
- Permissões são verificadas no banco (RLS/RPC); a UI nunca é o mecanismo de segurança (Blueprint NFR-005, §49–50).

## Git (ADR-009, revisado pelos ADR-050 e ADR-058)

- Branch a partir de `main` atualizada, PR para `main`, Conventional Commits.
- Com aprovação explícita do Jota para **cada ação**, a IA pode: criar branch, commitar, rodar testes, fazer push da própria branch, abrir PR, criar issues/labels, fazer merge de PR com CI verde e excluir branches já mescladas ou fechadas (registrando o SHA). A aprovação não se estende a outras ações, outros PRs nem outras sessões.
- Antes de cada PR: apresentar o plano (arquivos) e aguardar o ok. Rodar o gate antes de cada push e mostrar o resultado. A descrição do PR traz resumo, requisitos atendidos, testes executados e checklist DoD (Blueprint §36).
- Exclusivo do Jota: push forçado em `main`, rebase de branch compartilhada, mudança de settings/secrets/variables do GitHub e qualquer ação em banco ou ambiente de produção.

## Agentes e trabalho paralelo

Equipe em `.claude/agents/`. A sessão principal é o **lead**: fatia o trabalho, delega, integra, roda o gate e cuida do Git. O lead é dono de `package*.json`, `eslint.config.js`, configs de build/teste, `.github/`, `CLAUDE.md`, `AI_CONTEXT.md`, `README.md` e índices (`docs/adr/README.md`, `docs/DELIVERY_PLAN.md`, `docs/blocks/00-INDICE.md`).

| Agente | Quando usar | Dono de |
|---|---|---|
| `planner` | Feature Spec, ADR `Proposed`, checagem de fronteira e rastreabilidade antes de codar | `docs/specs/`, `docs/blocks/B*.md`, ADRs novos, docs de contrato (`PERMISSIONS.md`, `REALTIME_CONTRACT.md`) |
| `backend-engineer` | schema, RLS, funções SQL, migrations e o servidor Node.js | `db/`, `supabase/`, `scripts/db/`, `server/` |
| `core-engineer` | domínio, casos de uso, Dexie, sync e cliente remoto | `src/domain`, `src/application`, `src/db` (inclui `database.ts`), `src/sync`, `src/platform`, `src/lib`, `src/auth` (lógica) |
| `ui-engineer` | páginas, componentes, CSS, rotas, acessibilidade, Modo Palco (só correções, D6) | `src/pages`, `src/components`, `src/App.tsx`, CSS |
| `reviewer` | revisão de diff antes do PR: bugs, ADRs, camadas, RLS, offline, escopo, DoD | — (só lê) |
| `qa` | reproduzir bug e validar aceite no app (celular, tablet, offline) | — (só relatório) |

Fluxo de uma fatia: `planner` → `backend-engineer` → `core-engineer` → `ui-engineer` → `reviewer` → `qa` → lead (gate + PR). Bug: `qa` reproduz → engenheiro da camada corrige com teste → `reviewer` → lead.

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
