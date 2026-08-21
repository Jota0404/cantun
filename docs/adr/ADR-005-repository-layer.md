# ADR-005 — Repository Layer

## Status

Accepted

## Contexto

A UI e a lógica da aplicação não devem depender diretamente da implementação do banco local.

## Decisão

O acesso persistente será encapsulado por repositories, por exemplo `SongRepository`.

## Motivos

- separação entre domínio/aplicação e infraestrutura;
- testabilidade;
- possibilidade de trocar ou complementar IndexedDB no futuro;
- redução de acoplamento.

## Consequências

Será necessário manter uma pequena camada adicional entre os casos de uso e o banco.

## Data

2026-08-21
