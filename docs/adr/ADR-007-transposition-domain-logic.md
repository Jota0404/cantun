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

## Nota (2026-10-15): tons menores

Sem mudança de decisão. O tom passa a ser **tônica + modo**: além de `C`, `Db`…`B`, são válidos os menores `Cm`, `C#m`, `Dm`… `Bm` (sufixo `m`). `originalKey` e `currentKey` aceitam os dois; a transposição preserva o modo, desloca a tônica pela mesma tabela de semitons e escolhe a grafia (sustenidos ou bemóis) pela tônica de saída (`F#m` e `Em` em sustenidos; `Bbm` e `Ebm` em bemóis). Não há conversão para o tom relativo. Os princípios acima (cifra base preservada, `originalKey` intacto, lógica fora da UI) continuam, e a spec [`FIX-01`](../specs/FIX-01-jornada-musical.md) cobre os testes. Não é necessário novo ADR.
