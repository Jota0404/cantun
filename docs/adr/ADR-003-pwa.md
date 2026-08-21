# ADR-003 — Aplicação como PWA

## Status

Accepted

## Contexto

O usuário principal utilizará o aplicativo em tablets e celulares. Desejamos uma experiência próxima à de um aplicativo instalável sem manter bases de código separadas para cada plataforma no MVP.

## Decisão

O Salmodia será desenvolvido como Progressive Web App.

## Motivos

- instalação na tela inicial;
- mesma base para web e dispositivos móveis;
- integração natural com o modelo offline-first;
- possibilidade de evolução futura para alternativas nativas se necessário.

## Consequências

Determinadas capacidades dependentes de plataforma podem ter limitações específicas do navegador.

## Data

2026-08-21
