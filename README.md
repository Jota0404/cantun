# CANTUM

**Organize · Prepare · Escale · Execute · Conecte**

Plataforma para equipes de louvor organizarem pessoas e funções, montarem serviços e escalas, prepararem repertórios e ensaios e executarem as músicas no culto — com um Modo Palco rápido, legível e confiável mesmo sem internet.

> *Mais do que cifras: uma plataforma para organizar, preparar e operar uma equipe de louvor.*

A fonte de verdade de produto é o **[CANTUM Project & Product Blueprint](docs/CANTUM_PROJECT_BLUEPRINT.md)**.

## Status

| Fase (Blueprint §33) | Situação |
|---|---|
| Fase 0 — Fundação atual | ✅ Domínio canônico consolidado em `main`; B0 (CI, governança da IA, templates, plano de blocos) concluído |
| Fase 1 — Operação de equipe | 🟡 Em andamento: B1 Backend próprio concluído (Supabase removido, ADR-059); B2 Equipe (spec e ADR-051 aceitos); depois B3 Serviço e B4 Escala |
| Fase 2 — Operação musical integrada | ⏳ |
| Fase 3 — Execução madura | 🟡 Parte adiantada: Modo Palco compartilhado, presença e readiness já existem |
| Fase 4 — Eficiência | ⏳ |
| Fase 5 — Network | ⏳ Futuro, condicionado à validação do core |

O MVP v0.1 (cifras, repertórios e Modo Palco offline) foi concluído e validado em agosto/2026 e permanece como núcleo musical do produto.

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
| CI/CD | GitHub Actions → GitHub Pages |

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

Servidor e banco locais: ver `server/README.md` e `db/README.md`. O app exige login: sem servidor acessível (como hoje no link público, até a hospedagem ser definida), não é possível entrar.

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
| `docs/BAND_*.md`, `docs/LEGACY_DEXIE_MIGRATION_GATES.md` | Contratos e gates do runtime legado (compatibilidade) |
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
