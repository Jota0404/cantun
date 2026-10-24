# CANTUM

**Organize · Prepare · Escale · Execute · Conecte**

Plataforma para equipes de louvor organizarem pessoas e funções, montarem serviços e escalas, prepararem repertórios e ensaios e executarem as músicas no culto — com um Modo Palco rápido, legível e confiável mesmo sem internet.

> *Mais do que cifras: uma plataforma para organizar, preparar e operar uma equipe de louvor.*

**Ambiente de teste:** Render + Neon gratuitos, nos EUA (ADR-060, `Proposed`; `render.yaml`), só com dados de teste. Pode levar ~1 min no primeiro acesso depois de inatividade. A hospedagem de produção ainda será decidida pelo owner.

A fonte de verdade de produto é o **[CANTUM Project & Product Blueprint](docs/CANTUM_PROJECT_BLUEPRINT.md)**. Resumo do estado para leigos: **[`docs/STATUS_DO_PROJETO.md`](docs/STATUS_DO_PROJETO.md)**.

## Status (2026-10-23)

| Fase (Blueprint §33) | Situação |
|---|---|
| Fase 0 — Fundação | ✅ B0 (CI, governança da IA, templates, plano de blocos) e B1 (backend próprio, ADR-059) |
| Fase 1 — Operação de equipe | ✅ B2 Equipe, B3 Serviço, B4 Escala, B5 Navegação/Design System, B8 Privacidade (texto jurídico pendente) |
| Fase 2 — Operação musical integrada | ✅ B6 (fatias 1–7; upload de arquivos adiado pelo owner, materiais só por link) |
| Fase 3 — Execução madura | ✅ B7 Execução & Histórico (registro da execução, histórico da música, log de atividade) |
| Fase 4 — Eficiência | ⏳ |
| Fase 5 — Network | ⏳ Futuro, condicionado à validação do core (B10) |
| Lançamento | ⏳ Com o owner: hospedagem no Brasil, migrations em produção, jurídico (`docs/GO_LIVE_CHECKLIST.md`) |

O MVP v0.1 (cifras, repertórios e Modo Palco offline) foi concluído em agosto/2026 e permanece como núcleo musical do produto.

## O que o CANTUM é — e o que não é

**É:** operação de equipes de louvor — equipe, funções, serviços, escalas, biblioteca musical, repertórios, ensaios e execução. No futuro, uma Network para encontrar músicos externos para **necessidades pontuais de um serviço**.

**Não é:** sistema de gestão de igreja, CRM, ERP, financeiro, rede social, chat/mensageiro, calendário genérico, onboarding de voluntários, devocionais, marketplace de pagamento ou plataforma de recrutamento. Ver Blueprint §3 e §24.

## Stack

| Camada | Tecnologia |
|---|---|
| UI | React 19, React Router 7 |
| Linguagem | TypeScript |
| Build/PWA | Vite + `vite-plugin-pwa` |
| Local-first | IndexedDB via Dexie |
| Remoto | PostgreSQL 16 + servidor próprio Node.js/TypeScript em `server/` (auth, RPC, WebSocket) — ADR-059 |
| Testes | Vitest, Testing Library, `fake-indexeddb` |
| CI/CD | GitHub Actions (gate) · deploy no Render a cada push em `main` (ADR-060) · o antigo GitHub Pages só redireciona |

Arquitetura em camadas (Presentation → Application → Domain → Infrastructure) com Repository pattern. O core é **local-first**; a sincronização remota é complementar e a Network será cloud-backed sem contaminar o caminho crítico da execução (Blueprint §16, §47).

## Desenvolvimento local

Pré-requisito: Node.js 24.

```bash
npm ci
cp .env.example .env.local   # VITE_API_URL (padrão em dev: http://localhost:8787)
npm run dev
```

| Comando | Uso |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm test` | todos os testes (Vitest) |
| `npm run lint` | ESLint |
| `npm run build` | type-check (`tsc -b`) + build de produção |
| `npm run preview` | servir o build localmente |
| `cd server && npm test` | testes de integração do servidor (exigem PostgreSQL) |
| `scripts/db/verify-migrations.sh` | aplica `db/migrations/` e roda `db/tests/` num PostgreSQL descartável |

Servidor e banco locais: ver `server/README.md` e `db/README.md`. O app exige login: sem servidor acessível, não é possível entrar.

CI (`.github/workflows/`): `validate` (test + lint + build, todo PR), `verify-migrations` (SQL em PostgreSQL 16, quando muda `db/`) e `test` do servidor (typecheck + integração, quando muda `server/` ou `db/`). O deploy no Render roda as migrations pendentes na subida (`render.yaml`).

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `src/` | app React (`pages`, `components`, `application`, `domain`, `db` = Dexie, `sync`, `platform` = cliente HTTP/WebSocket, `auth`) |
| `server/` | servidor Node.js/TypeScript (Fastify, `pg`): auth, `/rpc`, `/sync`, `/realtime` |
| `db/` | `migrations/` (0001–0027) e `tests/` SQL de RLS |
| `scripts/` | `db/` (migrar, verificar) e `ops/` (`dump.sh`, `restore-test.sh`) |
| `docs/` | Blueprint, arquitetura, ADRs, specs, blocos, operação e privacidade |

## Documentação

| Documento | Papel |
|---|---|
| [`docs/CANTUM_PROJECT_BLUEPRINT.md`](docs/CANTUM_PROJECT_BLUEPRINT.md) | **Produto** — visão, fronteira, capacidades, requisitos, roadmap |
| [`docs/CANTUM_ARCHITECTURE.md`](docs/CANTUM_ARCHITECTURE.md) | **Arquitetura** vigente e migração de domínio |
| [`docs/adr/`](docs/adr/) | Decisões arquiteturais (ADRs) |
| [`docs/DELIVERY_PLAN.md`](docs/DELIVERY_PLAN.md) + [`docs/blocks/`](docs/blocks/) | Plano de entrega em blocos (B0–B10) |
| [`docs/specs/`](docs/specs/) | Feature Specs (Blueprint §34.1) |
| [`docs/BACKEND_MIGRATION_PLAN.md`](docs/BACKEND_MIGRATION_PLAN.md) | Histórico da saída do Supabase (ADR-059, concluída) |
| [`AI_CONTEXT.md`](AI_CONTEXT.md) / [`CLAUDE.md`](CLAUDE.md) | Regras operacionais para desenvolvimento assistido por IA |
| [`docs/PERMISSIONS.md`](docs/PERMISSIONS.md) · [`docs/REALTIME_CONTRACT.md`](docs/REALTIME_CONTRACT.md) | Matriz de permissões · contrato do tempo real do Palco |
| [`docs/OPERATIONS.md`](docs/OPERATIONS.md) · [`docs/GO_LIVE_CHECKLIST.md`](docs/GO_LIVE_CHECKLIST.md) · [`docs/BACKUP_RECOVERY.md`](docs/BACKUP_RECOVERY.md) · [`docs/HOSTING_OPTIONS_BR.md`](docs/HOSTING_OPTIONS_BR.md) | Operação, go-live, backup e opções de hospedagem |
| [`docs/privacy/`](docs/privacy/) | Política e Termos (rascunho), mapa de dados, briefing jurídico |
| `docs/BAND_*.md`, `docs/LEGACY_DEXIE_MIGRATION_GATES.md` | **Históricos**: contratos e gates do runtime legado, removido no B1 |
| `docs/TASK_*.md` | Especificações históricas de tarefas |
| `docs/SALMODIA_*.md` | Documentos **históricos** do MVP v0.1 (nome preservado pelo ADR-011) |

Hierarquia de autoridade (Blueprint §0): Blueprint → Arquitetura → ADRs `Accepted` → Feature Specs/Issues → código atual → suposições da IA.

## Fluxo de trabalho

```text
Issue / Feature Spec → branch → implementação → testes → revisão do diff → PR → merge em main
```

- Branches: `feature/*`, `fix/*`, `refactor/*`, `docs/*`, `test/*`, `chore/*`.
- Commits no padrão Conventional Commits.
- Todo PR precisa de `npm test`, `npm run lint` e `npm run build` verdes (CI).
- Mudança de produto → Blueprint; mudança arquitetural → novo ADR.

## Princípios

1. O serviço é o centro operacional.
2. O músico deve saber exatamente o que fazer.
3. O Modo Palco é uma experiência crítica — execução sem distração.
4. Offline é característica do produto, não detalhe de infraestrutura.
5. Simplicidade antes de abrangência; nada de feature só porque um concorrente tem.
6. Privacidade por desenho.
7. Evolução incremental — sem reescrita big-bang.
