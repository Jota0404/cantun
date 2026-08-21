# ADR-006 — Arquitetura em camadas leves

## Status

Accepted

## Contexto

O projeto precisa de separação suficiente para permanecer sustentável, mas é pequeno demais para justificar uma arquitetura enterprise pesada.

## Decisão

Utilizar uma arquitetura em camadas leves:

```text
Presentation
    ↓
Application
    ↓
Domain
    ↓
Infrastructure
```

## Motivos

- manter responsabilidades claras;
- facilitar testes;
- evitar acoplamento entre UI e regras de negócio;
- evitar overengineering.

## Consequências

A estrutura pode crescer conforme a necessidade real, sem criar abstrações antecipadas.

## Regra

Não criar patterns, factories, services ou abstrações genéricas apenas por antecipação.

## Data

2026-08-21
