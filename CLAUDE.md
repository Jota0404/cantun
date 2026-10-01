# CLAUDE.md — CANTUM

Contexto de produto, domínio, fronteira e workflow: @AI_CONTEXT.md
Fonte de verdade de produto: `docs/CANTUM_PROJECT_BLUEPRINT.md` · Arquitetura: `docs/CANTUM_ARCHITECTURE.md` + `docs/adr/`.

Este arquivo cobre só o que é específico para sessões de código.

## Comandos

```bash
npm ci                      # instalar (lockfile é a referência)
npm run dev                 # Vite
npx vitest run <caminho>    # testes focados durante o trabalho
npm test                    # suíte completa
npm run lint                # ESLint
npm run build               # tsc -b (inclui arquivos de teste) + vite build
```

**Gate antes de declarar qualquer tarefa concluída:** `npm test && npm run lint && npm run build`. Teste que não compila quebra o build.

Config local: `.env.local` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. Nunca commitar `.env*` (exceto `.env.example`) nem `*.pem`. Nunca usar `service_role` no frontend.

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

Legado (`domain/bands`, `bandSyncEngine`, `syncEngine`, `bandStageRealtime`, rotas `/bands*`, `/stage/setlist`, `/stage/session`): só correção de bug ou adaptação de fronteira.

## Convenções de código

- Código, identificadores e commits em inglês; textos de UI e mensagens de validação em pt-BR; docs/ADRs em português.
- Named exports (exceto `App`); `import type` para tipos; sem `any`, sem `!` injustificado, sem `console.log` em produção.
- Use cases recebem repositório por parâmetro com default (`fn(input, repository = defaultRepository)`) e retornam `{ success: true, … } | { success: false, errors }` para validação.
- Componente/página: `Foo.tsx` + `Foo.css` + `Foo.test.tsx` lado a lado.
- Testes de UI por papel/label acessível (`getByRole`, `getByLabelText`), não por classe CSS. Supabase sempre mockado; repositórios com `fake-indexeddb`.
- Arquivos grandes (`StagePage.tsx`, `bandStageRealtime.ts`): extrair hooks/serviços em vez de crescer.
- `react-hooks/set-state-in-effect` está desligado globalmente (débito técnico): não escreva código novo que dependa disso.

## Persistência

- **Dexie:** toda mudança de schema é um novo `this.version(N+1)` em `src/db/database.ts`, com `upgrade()` quando houver transformação e teste de upgrade. Nunca editar versões existentes. Não renomear banco, tabelas ou chaves de storage (ADR-011).
- **Supabase:** migrations novas e aditivas `YYYYMMDDHHMMSS_descricao.sql`; nunca editar migration aplicada. Tabela nova = RLS + políticas na mesma migration. Mutação sensível via RPC `security definer` + `set search_path = ''` + checagem de autorização interna. Mudou contrato de RPC/Realtime → atualizar tipos TS, testes e doc de contrato no mesmo PR.
- Permissões são verificadas no banco (RLS/RPC); a UI nunca é o mecanismo de segurança (Blueprint NFR-005, §49–50).

## Git (ADR-009, revisado pelo ADR-050)

Branch a partir de `main`, PR para `main`, Conventional Commits. Com aprovação explícita do Jota para cada ação, a IA pode criar branch, commitar, rodar testes, fazer push e abrir PR. Exclusivo do Jota: merge, push forçado em `main`, exclusão de branches, mudança de settings/secrets/variables do GitHub e aplicação de migrations em produção. Nunca rebase de branch compartilhada.

## Formato da resposta

Mudança significativa — antes: `Arquivos afetados · ADRs · Riscos · Plano`. Depois: `Resultado · Alterações · Gate · Riscos/pendências · Próximo passo`. Conciso.
