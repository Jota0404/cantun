# ADR-007 — Transposição como lógica de domínio

## Status

Accepted

## Contexto

A mudança de tom é uma funcionalidade central do produto e não deve depender de componentes React específicos.

## Decisão

A lógica de parsing/transposição será independente da UI e tratada como lógica de domínio.

## Princípios

- a cifra base não deve ser degradada por múltiplas transposições;
- `originalKey` deve ser preservado;
- `currentKey` representa o tom utilizado;
- letra e conteúdo textual devem ser preservados quando aplicável;
- a implementação inicial prioriza os formatos comuns de cifras de igreja.

## Consequências

O algoritmo terá testes unitários próprios e poderá ser reutilizado em diferentes interfaces.

## Data

2026-08-21
