# CANTUM — Blocos de entrega: índice

> v1.0 · 2026-10-01 · status atualizado em 2026-10-23 (`main` @ `826eafa`; migrations 0001–0027)
> Fonte de verdade de produto: `docs/CANTUM_PROJECT_BLUEPRINT.md`. Plano consolidado: `docs/DELIVERY_PLAN.md`.

Cada bloco tem um documento próprio com: objetivo, estado atual no código, requisitos do Blueprint, escopo, entregáveis por PR, mudanças de dados, critérios de aceite, testes, riscos e dependências.

| Bloco | Documento | Fase | Depende de | Status |
|---|---|---|---|---|
| B0 | `B0-fundacao.md` | 0 | — | ✅ concluído |
| B1 | `B1-portabilidade-postgres.md` (backend próprio) | 0/1 (ADR-059) | B0 | ✅ concluído |
| B2 | `B2-equipe-vs01.md` | 1 | B0; SQL após baseline do B1 | ✅ concluído |
| B3 | `B3-servico-vs02.md` | 1 | B2 | ✅ concluído |
| B4 | `B4-escala-vs03.md` | 1 | B3 | ✅ concluído |
| B5 | `B5-navegacao-design-system.md` | 1 | B0 (paralelo ao B2) | ✅ concluído |
| B6 | `B6-musica-ensaio-materiais.md` | 2 | B4 | ✅ fatias 1–7 (#108–#125; 0017, 0018, 0020–0022) + QA; fatia 8 (upload) adiada pelo owner (D10): fora do MVP, materiais só por link |
| B7 | `B7-execucao-historico.md` | 2/3 | B6 | ✅ fatias 1–7 (#129–#137; 0023, 0024) + QA; D1–D6 decididas; depois 0025–0027 e "Realizados" (#138–#151) |
| B8 | `B8-privacidade-minima.md` | 0/1 | B2 | ✅ em código (0011–0016, 0019); pendente do owner: texto jurídico e restore de dump real |

Migrations em produção (0007–0027) e hospedagem no Brasil: com o owner (`docs/GO_LIVE_CHECKLIST.md`).
| B9 | `B9-backend-proprio.md` | — | — | absorvido pelo B1 |
| B10 | `B10-network.md` | 5 | validação do core | hipótese |

**MVP-Operacional:** B0 + B2 + B3 + B4 + B5 + B8.

## Decisões vigentes (D1–D7)

| # | Decisão |
|---|---|
| D1 | Nome do produto: **CANTUM** (ADR-011). O repositório continua `Jota0404/cantun` |
| D2 | Papéis em dois níveis: organização `owner`/`admin`/`member`; equipe `leader`/`member` |
| D3 | `ServicePosition` (vaga: função + quantidade) + `Assignment` (pessoa na vaga). Estados: `invited`, `confirmed`, `declined`, `replacement_needed`, `cancelled` |
| D4 | Supabase sai de uma vez no B1: PostgreSQL + backend próprio em Node.js (ADR-049 + ADR-059); SQL usa `app.current_user_id()` |
| D5 | Dados locais isolados por usuário (ADR-048) |
| D6 | Stage congelado para features novas até o fim da Fase 2 |
| D7 | Arrangement não é persistido; Network fora do caminho crítico |

## Numeração reservada de ADRs

| ADR | Tema | Bloco |
|---|---|---|
| 052 | Service operacional (equipe, estados, itens genéricos) — Accepted | B3 |
| 053 | Vagas e atribuições — Accepted | B4 |
| 054 | Canal de notificação — Accepted | B4 |
| 055 | Design system — Accepted | B5 |
| 056 → 064 | Materiais e storage (escrito como ADR-064, `Proposed`; upload adiado, D10) | B6 |
| 057 | Política de consistência por entidade — Accepted | B4 |

Sem reservas abertas; próximo número livre em `docs/adr/README.md`.

## Fluxo padrão de cada bloco

```text
Spec (docs/specs/) → ADR (Proposed → Accepted pelo owner) → migration (harness) → domínio + testes
→ application + testes → Dexie/sync → UI + testes → gate → PR pequeno → merge (owner, ou IA com ok do owner: ADR-058)
```
