# ADR-058 — Emenda ao ADR-050: merge e limpeza de branches pela IA

## Status

Accepted

## Contexto

O ADR-050 reservou ao owner o merge de PRs e a exclusão de branches. Na prática, o owner passou a pedir essas ações diretamente ao Claude Code (2026-10-08), e o ADR-050 exige novo ADR para ampliar os poderes da IA.

## Decisão

O ADR-050 é **emendado**. Com aprovação explícita do owner **para cada ação**, a IA também pode:

- **fazer merge de um PR**, desde que o CI esteja verde e o gate local tenha passado. Usa merge commit (`gh pr merge --merge`), o padrão do repositório;
- **excluir branches** já mescladas em `main` ou cujo PR foi fechado. Antes, registra o SHA de cada uma (no PR, na issue ou na resposta ao owner) para permitir recuperação.

Continuam **exclusivos do owner**: push forçado em `main`, rebase de branch compartilhada, settings do repositório, secrets e variables do GitHub, e qualquer ação em banco ou ambiente de produção.

A aprovação vale para a ação pedida e não se estende a outros PRs, branches ou sessões. Um PR aberto pela IA não é mesclado por ela sem o ok do owner para aquele PR.

## Consequências

- `CLAUDE.md` (seção Git) e `AI_CONTEXT.md` §10 refletem esta emenda.
- Os princípios do ADR-009 e do ADR-050 continuam: controle humano, rastreabilidade e nenhuma decisão `Accepted` alterada em silêncio.

## Data

2026-10-08
