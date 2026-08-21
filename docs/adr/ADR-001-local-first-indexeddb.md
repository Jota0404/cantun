# ADR-001 — Local-first com IndexedDB

## Status

Accepted

## Contexto

O MVP precisa funcionar sem internet e não terá backend nem autenticação.

## Decisão

O armazenamento principal do MVP será local, utilizando IndexedDB.

## Motivos

- permite funcionamento offline;
- suporta dados estruturados melhor que `localStorage`;
- atende ao uso em tablet/celular;
- deixa aberta a possibilidade de sincronização futura.

## Consequências

### Positivas

- autonomia offline;
- persistência local;
- nenhuma dependência de backend no MVP.

### Negativas

- os dados ficam vinculados ao dispositivo até existir uma estratégia de backup/sincronização;
- limpeza dos dados do navegador pode causar perda de dados.

## Alternativas consideradas

- `localStorage`: simples demais para o domínio previsto.
- backend desde o início: complexidade desnecessária para o MVP.

## Data

2026-08-21
