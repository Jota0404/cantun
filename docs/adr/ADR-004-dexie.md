# ADR-004 — Dexie como abstração do IndexedDB

## Status

Accepted

## Contexto

O MVP precisa usar IndexedDB, mas acesso direto à API nativa aumenta a complexidade e reduz a legibilidade.

## Decisão

Utilizar Dexie como camada de acesso ao IndexedDB.

## Motivos

- API mais simples;
- boa adequação a múltiplas entidades e consultas;
- reduz boilerplate sem esconder completamente o modelo de dados.

## Consequências

Dexie passa a ser uma dependência de infraestrutura do MVP.

## Data

2026-08-21
