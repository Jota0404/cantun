# ADR-008 — Não utilizar Redux no MVP

## Status

Accepted

## Contexto

O estado compartilhado previsto para o MVP não justifica a complexidade de uma biblioteca global dedicada.

## Decisão

Não utilizar Redux no MVP.

Priorizar React state e hooks. Uma biblioteca adicional só poderá ser introduzida se surgir uma necessidade concreta durante a evolução do projeto.

## Motivos

- reduzir dependências;
- reduzir complexidade;
- manter o projeto fácil de compreender;
- evitar overengineering.

## Consequências

Se o estado global crescer significativamente no futuro, uma nova decisão arquitetural poderá ser registrada.

## Data

2026-08-21
