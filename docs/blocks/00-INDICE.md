# CANTUM — Blocos de entrega: índice

> v1.0 · 2026-10-01 · Base técnica: `main` @ `ef82afd` + PRs #37–#40
> Fonte de verdade de produto: `docs/CANTUM_PROJECT_BLUEPRINT.md`. Plano consolidado: `docs/DELIVERY_PLAN.md`.

Cada bloco tem um documento próprio com: objetivo, estado atual no código, requisitos do Blueprint, escopo, entregáveis por PR, mudanças de dados, critérios de aceite, testes, riscos e dependências.

| Bloco | Documento | Fase | Depende de | Status |
|---|---|---|---|---|
| B0 | `B0-fundacao.md` | 0 | — | ▶ próximo |
| B1 | `B1-portabilidade-postgres.md` | 0 (ADR-049 A) | B0 + dump de produção | aguardando dump |
| B2 | `B2-equipe-vs01.md` | 1 | B0 | spec em revisão |
| B3 | `B3-servico-vs02.md` | 1 | B2 | — |
| B4 | `B4-escala-vs03.md` | 1 | B3 | — |
| B5 | `B5-navegacao-design-system.md` | 1 | B0 (paralelo ao B2) | — |
| B6 | `B6-musica-ensaio-materiais.md` | 2 | B4 | — |
| B7 | `B7-execucao-historico.md` | 2/3 | B6 | — |
| B8 | `B8-privacidade-minima.md` | 0/1 | B2 | antes de usuários reais |
| B9 | `B9-backend-proprio.md` | ADR-049 B | B1 + Fase 1 | — |
| B10 | `B10-network.md` | 5 | validação do core | hipótese |

**MVP-Operacional:** B0 + B2 + B3 + B4 + B5 + B8.

## Decisões vigentes (D1–D7)

| # | Decisão |
|---|---|
| D1 | Nome do produto: **CANTUM** (ADR-011). O repositório continua `Jota0404/cantun` |
| D2 | Papéis em dois níveis: organização `owner`/`admin`/`member`; equipe `leader`/`member` |
| D3 | `ServicePosition` (vaga: função + quantidade) + `Assignment` (pessoa na vaga). Estados: `invited`, `confirmed`, `declined`, `replacement_needed`, `cancelled` |
| D4 | Supabase é transitório (ADR-049): SQL novo usa `app.current_user_id()`; sem recurso exclusivo do Supabase sem ADR |
| D5 | Dados locais isolados por usuário (ADR-048) |
| D6 | Stage congelado para features novas até o fim da Fase 2 |
| D7 | Arrangement não é persistido; Network fora do caminho crítico |

## Numeração reservada de ADRs

| ADR | Tema | Bloco |
|---|---|---|
| 050 | Revisão do ADR-009 (Claude Code com controle humano) | B0 |
| 051 (Proposed) | Papéis em dois níveis e matriz de permissões | B2 |
| 052 | Service operacional (equipe, estados, itens genéricos) | B3 |
| 053 | Vagas e atribuições | B4 |
| 054 | Canal de notificação | B4 |
| 055 | Design system | B5 |
| 056 | Materiais e storage | B6 |
| 057 | Política de consistência por entidade (LWW × autoridade × online-only) | B4 |

## Fluxo padrão de cada bloco

```text
Spec (docs/specs/) → ADR (Proposed → Accepted pelo owner) → migration (harness) → domínio + testes
→ application + testes → Dexie/sync → UI + testes → gate → PR pequeno → merge pelo owner
```
