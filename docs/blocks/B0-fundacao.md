# B0 — Fundação

> Fase 0 · Esforço: ~1 semana · Depende de: — · Bloqueia: todos os outros

## Objetivo
Deixar o repositório pronto para entregar features com segurança e rastreabilidade: governança da IA, templates de spec, issue e PR, lint íntegro, plano versionado e o preparo do baseline do banco.

## Estado atual
- PRs abertos: **#37** (CI/deploy em `main`, segredos fora do código, ADRs renumerados), **#38** (Blueprint versionado, README, AI_CONTEXT, CLAUDE.md), **#39** (isolamento de dados locais, ADR-048), **#40** (portabilidade PostgreSQL, ADR-049).
- O ADR-009 diz que a IA não opera Git, mas o fluxo real agora é o Claude Code abrindo PRs com aprovação.
- `react-hooks/set-state-in-effect` está desligado globalmente em `eslint.config.js`.
- `docs/TASK_*.md` está em formato antigo; não existem `docs/specs/`, templates de issue nem de PR.
- O índice `docs/adr/README.md` (do #37) não lista o ADR-048 (#39) nem o ADR-049 (#40).
- 18 branches antigas no remoto, todas contidas em `main` ou superadas.

## Requisitos do Blueprint
§33 Fase 0 (consolidar arquitetura, manter testes, revisar documentação) · §34.1 (Feature Spec) · §35 (rastreabilidade) · §36 (DoD) · §37 (uso com IA) · §45 (versionar o Blueprint e transformar o roadmap em issues).

## Escopo

**Entra:**
1. Merge dos PRs #37 → #40 (feito pelo owner). Antes do #37, criar as variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` em Actions → Variables.
2. `docs/DELIVERY_PLAN.md` e `docs/blocks/*.md` (estes documentos) versionados.
3. **ADR-050**: a IA pode criar branch, commitar, fazer push e abrir PR com aprovação do owner. Merge, force-push em `main`, exclusão de branches e alteração de settings do repositório continuam exclusivos do owner. Marcar o ADR-009 como *Amended by ADR-050*; ajustar `AI_CONTEXT.md` §10 e a seção Git do `CLAUDE.md`.
4. `docs/adr/README.md` com ADR-048, 049 e 050 e o próximo número livre.
5. `docs/specs/_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/feature.md`, `.github/ISSUE_TEMPLATE/bug.md`, `.github/pull_request_template.md`.
6. Reabilitar `react-hooks/set-state-in-effect`, com exceções explícitas por arquivo, e abrir uma issue de débito.
7. `scripts/db/export-production-schema.md`: instruções para o owner gerar o dump de schema e a lista de migrations aplicadas (PowerShell e Bash), salvando fora do repositório.
8. Issues/Epics no GitHub, uma por bloco (B1–B8), com link para o documento do bloco.
9. Remoção das branches antigas, executada pelo owner ou com aprovação explícita.

**Não entra:** nenhum código de produto, migration ou mudança de UI.

## Entregáveis por PR

| PR | Branch | Conteúdo |
|---|---|---|
| 1 | `docs/foundation-governance` | itens 2, 3, 4, 5 e 7 |
| 2 | `chore/lint-set-state-in-effect` | item 6 + issue de débito |
| — | (GitHub) | item 8 (issues/epics) e item 9 (branches), com aprovação |

### Conteúdo mínimo dos templates
- **Spec** (§34.1): Feature · Objetivo · User Stories · Regras · Acceptance Criteria · Requisitos `RF-*`/`NFR-*` · Impacto em domínio, arquitetura e dados · Fora do escopo · Plano de testes · Issues.
- **Issue feature:** problema, bloco, requisito `RF-*`, acceptance criteria, link da spec.
- **Issue bug:** passos, esperado, obtido, ambiente (celular/tablet/desktop, online/offline).
- **PR:** resumo, requisitos, decisões/ADRs, testes executados, checklist DoD §36 (requisito atendido, testes, UX revisada, mobile/tablet, offline, segurança/permissão, docs, diff revisado, escopo respeitado).

## Critérios de aceite
- `main` contém #37–#40 e está verde (test, lint, build).
- ADR-050 `Accepted` e refletido em `AI_CONTEXT.md` e `CLAUDE.md`.
- Abrir uma issue ou PR no GitHub mostra os templates.
- O lint roda com a regra ligada; as exceções estão listadas e há uma issue aberta.
- O plano de blocos está em `docs/`.
- O owner tem o roteiro para gerar o dump.

## Testes
Só o gate (nenhum código de produto). Verificar o lint com a regra reativada.

## Riscos
- Esquecer as variáveis antes do merge do #37: o deploy sai sem login. Mitigação: checklist no PR.
- Conflito de numeração de ADR entre PRs paralelos: usar a tabela de reserva do índice.

## Próximo
B1/A0 assim que o dump existir; spec e ADR do B2.
