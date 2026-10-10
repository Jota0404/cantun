# CANTUM — Plano de entrega em blocos

> v1.0 · 2026-10-01 (status atualizado em 2026-10-08) · Fonte de verdade de produto: `docs/CANTUM_PROJECT_BLUEPRINT.md`
> Arquitetura: `docs/CANTUM_ARCHITECTURE.md` + `docs/adr/` · Migração de backend: `docs/BACKEND_MIGRATION_PLAN.md` (ADR-059)
> Documentos por bloco: `docs/blocks/` (índice em `docs/blocks/00-INDICE.md`)

## 1. Visão geral

```text
B0 Fundação ──► B1 Backend próprio (ADR-059: baseline SQL → servidor → cliente sem Supabase)
                    │ baseline (PR 1)
                    ▼
               B2 Equipe (VS-01) ──► B3 Serviço (VS-02) ──► B4 Escala (VS-03) ──► B6 Música no serviço + Ensaio (VS-04/05)
                    ▲                    ▲                     ▲                        │
                    └──── B5 Navegação & Design System (começa junto com B2) ───────────┘
                                                                                        ▼
                          B8 Privacidade mínima (antes de usuários reais) ──► B7 Execução & Histórico (VS-06)
                                                                                        ▼
                                                                            B10 Network (hipótese)
```

**MVP-Operacional (meta):** B0 + B2 + B3 + B4 + B5 + B8. Cobre os critérios de sucesso 1 a 3 do Blueprint (§26): montar serviço rápido, escalar com menos esforço e cada músico saber o que fazer.

| Bloco | Fase (Blueprint §33) | Esforço* | Depende de |
|---|---|---|---|
| B0 Fundação | 0 | 1 sem | — |
| B1 Backend próprio | 0/1 (ADR-059) | 4–6 sem | B0 |
| B2 Equipe | 1 | 2–3 sem | B0; SQL depois do baseline do B1 |
| B3 Serviço | 1 | 2–3 sem | B2 |
| B4 Escala | 1 | 4–6 sem | B3 |
| B5 Navegação & Design System | 1 | 2 sem (contínuo) | B0 |
| B6 Música no serviço + Ensaio + Materiais | 2 | 4–6 sem | B4 |
| B7 Execução & Histórico | 2/3 | 2–3 sem | B6 |
| B8 Privacidade mínima | 0/1 | 1–2 sem | B2 |
| ~~B9 Backend próprio~~ | — | — | absorvido pelo B1 (ADR-059) |
| B10 Network | 5 | — | hipótese; só após validação do core |

\*Semanas de dedicação parcial de um desenvolvedor solo, como ordem de grandeza.

## 2. Decisões já tomadas (não reabrir sem ADR)

| # | Decisão | Origem |
|---|---|---|
| D1 | Nome do produto: **CANTUM** | owner, ADR-011 |
| D2 | **Papéis em dois níveis**: organização = `owner` / `admin` / `member`; equipe = `leader` / `member` (`TeamMembership.role`) | auditoria, Anexo A · ADR-051 · Blueprint v1.2 |
| D3 | **Vaga × atribuição**: `ServicePosition` (serviço + função + quantidade) e `Assignment` ligado à vaga. Estados da atribuição: `invited → confirmed \| declined → replacement_needed`, mais `cancelled`. Vaga `open/filled` é derivada | auditoria, Anexo B · Blueprint v1.2 · ADR-053 (reservado) |
| D4 | Supabase sai de uma vez (B1): PostgreSQL + backend próprio em Node.js; SQL usa `app.current_user_id()`; nada exclusivo de provedor | ADR-049 + ADR-059 |
| D5 | Dados locais isolados por usuário | ADR-048 |
| D6 | Stage congelado para features novas até o fim da Fase 2 (só correções) | auditoria, I6 |
| D7 | Arrangement não é persistido; Network fora do caminho crítico | Blueprint §8.7, §16.3 |

Esta tabela é o **registro canônico** das decisões da auditoria de viabilidade de 2026-10-01, que é um documento externo e não versionado. O que muda o produto (D2, D3) entrou no Blueprint v1.2.

## 3. Blocos

### B0 — Fundação (Fase 0)

**Objetivo:** repositório pronto para entregar features com segurança.

- [x] Mesclar os PRs #37 → #38 → #39 → #40 (antes do #37, criar as variáveis `VITE_SUPABASE_*` no GitHub).
- [x] Adicionar ADR-048 ao índice `docs/adr/README.md` e atualizar o próximo número livre.
- [x] **ADR-050 — revisão do ADR-009:** a IA (Claude Code) pode criar branch, commitar, fazer push e abrir PR com aprovação do owner; merge sempre humano.
- [x] `docs/specs/_TEMPLATE.md` (Feature Spec, Blueprint §34.1) e `.github/ISSUE_TEMPLATE/feature.md` com campo de requisito `RF-*`.
- [x] `.github/pull_request_template.md` com o checklist de DoD do Blueprint §36.
- [x] Reabilitar `react-hooks/set-state-in-effect` por arquivo (lista de exceções explícita) e abrir issue para zerar as exceções (#43, débito em #42).
- [x] Apagar as branches antigas já contidas em `main` (2026-10-08, ADR-058; SHAs no `B0-fundacao.md`).
- [x] Este plano versionado em `docs/DELIVERY_PLAN.md`.

**Pronto quando:** `main` verde, templates ativos, ADR-050 aceito.

### B1 — Backend próprio (ADR-059, substitui a portabilidade gradual do ADR-049)

Sem usuários reais: sai o Supabase de uma vez, sem dump nem migração de dados. Detalhe em `docs/BACKEND_MIGRATION_PLAN.md` §3.

- [x] **PR 1 — baseline:** `db/migrations/0001_baseline.sql` (PostgreSQL puro, sem legado), runner, CI `db` bloqueante, testes de RLS multiusuário.
- [x] **PR 2 — servidor:** `server/` (Node.js + TS, Fastify, `pg`): auth própria, `/rpc/:name`, `/sync/:table`.
- [x] **PR 3 — realtime:** `docs/REALTIME_CONTRACT.md` + WebSocket. Inclui `POST /auth/verify-email/resend` (pré-requisito do convite com e-mail verificado no B2).
- [x] **PR 4 — cliente:** `src/platform/{auth,rpc,realtime}.ts` no lugar de `src/lib/supabase.ts`.
- [x] **PR 5 — legado:** remover `Band*`, `Setlist*` e rotas legadas; nova `version()` do Dexie.
- [x] **PR 6 — limpeza:** remover `@supabase/supabase-js`, `supabase/` e o shim; atualizar CI, deploy e docs.

**Regra para os blocos B2+:** SQL novo vai para `db/migrations/` depois do PR 1 e passa no job `db`.

### B2 — Equipe (VS-01 · RF-TEAM-001…004)

**Objetivo:** Owner/Admin organizam a equipe; o Líder coordena; o Membro participa.

- [x] **ADR-051 — Papéis em dois níveis** (D2) com a matriz de permissões §49 como fonte única: `docs/PERMISSIONS.md` + função SQL `app.has_permission(...)` + espelho TS para a UX. Spec: `docs/specs/VS-01-equipe.md` (#56).
- [ ] Migration (em `db/migrations/`, depois do baseline do B1): `team_memberships.role` (`leader`/`member`, default `member`) e `status` (`active`/`inactive`); `pending_invite` é derivado do convite aberto (`PERMISSIONS.md` §7.3). Atualizar o domínio, o Dexie (nova `version`), o sync e os repositórios.
- [ ] RLS: Líder gerencia pessoas e funções da **sua** equipe; Membro cria música e repertório (§49); ajustar as políticas que hoje exigem `owner`/`admin`.
- [ ] Casos de uso: promover/rebaixar Líder, ativar/inativar membro, convite com estado `pending_invite`.
- [ ] Regra de produto "1 organização principal por conta" na UI e no caso de uso, sem constraint de banco (§6.1).
- [ ] Onboarding guiado (§6.2): criar conta → organização (Owner) → equipe principal → convidar → definir funções.
- [ ] Tela de Equipe (§32.3): membros, papel, funções, status; destacar funções sem pessoa.

**Testes:** permissões por papel (unit + RLS), transições de status, onboarding (integração).

### B3 — Serviço (VS-02 · RF-SVC-001…004)

- [ ] **ADR-052 — Service operacional:** `team_id`; estados `draft → ready → in_progress → completed | cancelled` (migrar `planned → draft`, `confirmed → ready`); `location`, `notes`. Máquina de estados no domínio.
- [ ] **ServiceItem genérico:** `type` (`song` + tipos do 1º corte, definidos na Feature Spec: abertura, oração, ministração, aviso, encerramento…), `title`, `notes`, `duration_minutes?`; `song_id` passa a ser opcional (obrigatório só quando `type = 'song'`).
- [ ] O Stage continua consumindo apenas os itens `song`, na ordem do serviço (ajuste mínimo, respeitando D6).
- [ ] Tela de Serviço (§52.2): Visão geral · Ordem · Escala · Repertório/Músicas · Observações. Materiais e Ensaio ficam como placeholders até o B6.
- [ ] Lista de serviços: próximos, em planejamento, passados (sem virar calendário, §8.2).

### B4 — Escala (VS-03 · RF-SCH-001…005, RF-TEAM-005)

- [ ] **ADR-053 — Vagas e atribuições** (D3): tabela `service_positions`; `assignments.position_id`; novos estados; migração das atribuições atuais (`pending → invited`, `accepted → confirmed`).
- [ ] Regras: só o membro atribuído confirma ou recusa; recusa → `replacement_needed` e a lacuna fica visível; líder substitui.
- [ ] **Disponibilidade** (§8.4), modelo simples: membro × data → `available | unavailable | tentative`. Na escala, sugere quem está disponível para a função.
- [ ] **ADR-054 — Canal de notificação** (bloqueio B3 da auditoria): proposta inicial de e-mail transacional + link de confirmação compartilhável + Web Push opcional. Implementar só o mínimo: convite para escala e lembrete de confirmação.
- [ ] Visão do membro (§12.2, §68): "meus próximos serviços / minha função / confirmar".
- [ ] Indicador de lacunas no serviço e na tela Início.

**Testes:** confirmação/recusa só pelo titular (unit + RLS), lacuna após recusa, substituição, disponibilidade.

### B5 — Navegação & Design System (§52, §61)

- [ ] **ADR-055 — Design system:** tema escuro como padrão, verde como cor de ação, tokens em CSS vars; componentes só com repetição comprovada (§61.1).
- [ ] Navegação: **Início · Serviços · Músicas · Equipe · Mais** (Repertórios, Ensaios, Histórico, Configurações). Sidebar no desktop, bottom nav no mobile. Remover "Nova música/Importar" do topo e "Organizações" no plural; tirar "MUSIC WORKSPACE".
- [ ] Início contextual (§52.1): próximo serviço, pendências, situação da escala.
- [ ] Acessibilidade: `eslint-plugin-jsx-a11y`, alvos ≥ 24 px (≥ 44 px no Stage), foco visível.
- [x] Aposentar rotas legadas `/bands*` (feito no B1, ADR-059).

### B6 — Música no serviço + Ensaio + Materiais (VS-04/05 · RF-REP-004, RF-REH-*, RF-MUS-005)

- [ ] Aplicar repertório ao serviço (gera itens `song`, preservando reuso); duplicar repertório no modelo alvo.
- [ ] `Rehearsal` ligado ao serviço (horário, músicas, observações).
- [ ] **ADR — Materiais/Storage** (tipos, tamanho, retenção, cache offline), respeitando D4: sem Storage do Supabase sem esse ADR.
- [ ] Readiness do membro para o ensaio (reaproveitar o modelo de presença efêmera quando fizer sentido).

### B7 — Execução & Histórico (VS-06)

- [ ] Registro do serviço executado (repertório, equipe, tons) e derivados por música (última vez tocada, tons usados).
- [ ] `ActivityLog` somente leitura no Início (§52.1): sem comentários nem reações.
- [ ] Encerrar o freeze do Stage (D6) e refatorar `ServiceStagePage.tsx` e renomear o que ainda diz "Band" no Stage canônico (`BandStagePresencePanel`, classes `band-stage-*`, textos "MODO BANDA"/"Setlist").

### B8 — Privacidade mínima (antes de qualquer igreja real usar)

- [ ] Política de privacidade + termos (dado sensível de filiação religiosa, LGPD art. 11), listando os subprocessadores.
- [ ] Exclusão de conta e de dados pessoais.
- [ ] Regra para menores (art. 14) — validar com assessoria jurídica.
- [ ] `docs/BACKUP_RECOVERY.md` (NFR-009) com restore testado.

### B9 — Backend próprio

Absorvido pelo B1 (ADR-059).

### B10 — Network

Hipótese condicionada (Blueprint §38; auditoria §6). Hoje só se modela a vaga aberta (`ServicePosition` do B4), que no futuro origina a `ServiceNeed`.

## 4. Forma de trabalho por bloco

```text
Feature Spec (docs/specs/) → ADR, se houver decisão estrutural → migration (harness)
→ domínio + testes → application + testes → Dexie/sync → UI + testes → gate → PR pequeno
```

- Um PR por fatia vertical; PRs grandes se dividem por camada só quando inevitável.
- Gate obrigatório: `npm test`, `npm run lint`, `npm run build` + `scripts/db/verify-migrations.sh` quando houver SQL.
- Todo PR referencia `RF-*`/`NFR-*` e segue o checklist DoD (§36).
- Merge pelo owner, ou pela IA com o ok do owner para aquele PR e CI verde (ADR-058).
