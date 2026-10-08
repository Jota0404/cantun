# ADR-050 — Revisão do ADR-009: Claude Code sob controle humano

## Status

Accepted · emendado pelo [ADR-058](ADR-058-ai-merge-and-branch-cleanup.md) (merge e limpeza de branches pela IA com ok do owner)

## Contexto

O ADR-009 (2026-08-21) assumia uma IA sem acesso operacional ao Git/GitHub: o desenvolvedor aplicava alterações, fazia commits, push e abria PRs manualmente. O fluxo real mudou: o Claude Code opera no repositório local e na CLI `gh`, e já preparou PRs revisados pelo owner (#37–#40). O ADR-009 deixou de descrever a prática e precisa ser ajustado sem perder o controle humano.

## Decisão

O ADR-009 é **emendado**. Os princípios dele (decisões `Accepted` não são substituídas silenciosamente; o desenvolvedor mantém o controle; rastreabilidade) permanecem.

### A IA pode, com aprovação explícita do owner para cada ação

- criar branch a partir de `main` atualizada;
- alterar arquivos, rodar testes, lint e build;
- criar commits (Conventional Commits);
- fazer `git push` da própria branch;
- abrir PR com `gh pr create`;
- criar issues e labels quando o owner pedir.

A aprovação vale para a ação pedida; não se estende a outras ações nem a outras sessões.

### Exclusivo do owner

- merge de PRs;
- force-push em `main` (e rebase de branch compartilhada);
- exclusão de branches (locais ou remotas);
- alteração de settings do repositório;
- criação ou alteração de secrets e variables do GitHub;
- aplicação de migrations em produção.

### Salvaguardas

- Antes de cada PR, a IA apresenta o plano (arquivos a criar ou alterar) e aguarda o ok.
- O gate (`npm ci`, `npm test`, `npm run lint`, `npm run build`) roda antes de cada push e o resultado é mostrado.
- A IA não pede, lê nem manipula senhas, connection strings ou chaves privadas.
- Conflito com decisão `Accepted`: a IA para, explica o impacto e aguarda decisão.
- A descrição do PR traz resumo, requisitos atendidos, testes executados e checklist DoD (Blueprint §36).

## Motivos

- alinhar a decisão registrada à prática real;
- reduzir trabalho mecânico mantendo o owner como único ponto de integração e de mudança de infraestrutura;
- manter as ações irreversíveis ou de produção sob decisão humana.

## Consequências

- `AI_CONTEXT.md` §10 e a seção Git do `CLAUDE.md` refletem este fluxo.
- Mudanças de permissão do Claude Code (settings locais) devem respeitar a lista "exclusivo do owner".
- Qualquer ampliação futura dos poderes da IA exige novo ADR.

## Data

2026-10-01
