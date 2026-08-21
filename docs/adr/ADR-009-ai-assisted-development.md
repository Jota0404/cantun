# ADR-009 — Desenvolvimento assistido por IA com controle humano

## Status

Accepted

## Contexto

O desenvolvimento utilizará Claude, especialmente a versão gratuita, sem assumir acesso operacional direto ao Git/GitHub.

## Decisão

Claude atua como assistente técnico: analisa, sugere, gera e revisa código. O desenvolvedor continua responsável por aplicar alterações, executar testes, revisar diffs, fazer commits, push, abrir PRs e integrar mudanças.

Claude pode sugerir mudanças de produto ou arquitetura livremente, mas não deve substituir silenciosamente uma decisão `Accepted`.

## Motivos

- preservar controle humano sobre o repositório;
- aproveitar IA sem transformar o projeto em caixa-preta;
- economizar contexto/tokens;
- manter decisões arquiteturais rastreáveis.

## Consequências

O fluxo de desenvolvimento exige uma etapa manual entre o código gerado e o commit.

## Data

2026-08-21
