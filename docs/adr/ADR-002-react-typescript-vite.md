# ADR-002 — React + TypeScript + Vite

## Status

Accepted

## Contexto

O CANTUM é uma aplicação client-side com interface rica, uso offline e possibilidade de instalação como PWA.

## Decisão

O frontend utilizará React, TypeScript e Vite.

## Motivos

- React atende bem ao modelo de UI da aplicação;
- TypeScript reduz erros de modelagem e integração;
- Vite oferece uma fundação simples para uma SPA/PWA;
- não existe necessidade de SSR ou infraestrutura server-side no MVP.

## Consequências

A aplicação será essencialmente client-side no MVP e poderá evoluir posteriormente sem exigir troca imediata de stack.

## Alternativa considerada

Next.js não é necessário para o escopo atual.

## Data

2026-08-21
