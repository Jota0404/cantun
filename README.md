# Salmodia

Aplicativo offline para músicos de igreja organizarem repertórios, armazenarem suas versões personalizadas de cifras e executarem músicas em um modo de palco otimizado para celular e tablet.

> Nome provisório. A identidade e o nome comercial definitivos ainda não foram definidos.

## Status

**MVP v0.1 — planejamento concluído / implementação ainda não iniciada.**

O projeto começa deliberadamente pela documentação. Nenhum código de aplicação deve ser iniciado antes do primeiro estado documental ser versionado no Git.

## Stack do MVP

- React
- TypeScript
- Vite
- PWA
- IndexedDB + Dexie
- React Router
- Vitest
- React Testing Library
- Git + GitHub

## Documentação

- `AI_CONTEXT.md` — contexto operacional e regras para uso com IA.
- `docs/SALMODIA_PRODUCT.md` — o que o produto é, seu MVP, fluxos e critérios.
- `docs/SALMODIA_ARCHITECTURE.md` — como o sistema é construído e suas decisões técnicas.
- `docs/adr/` — decisões arquiteturais individuais e seus motivos.

## Princípios

1. Simplicidade antes de abstração.
2. Offline-first no MVP.
3. O Modo Palco é uma experiência crítica do produto.
4. Claude pode sugerir, mas não altera decisões `Accepted` silenciosamente.
5. Você mantém o controle sobre Git, commits, testes e integração.
6. Funcionalidades são construídas em vertical slices.

## Primeiro ciclo de desenvolvimento

O primeiro vertical slice de código será o gerenciamento básico de músicas:

```text
criar → salvar → listar → abrir → editar → excluir
```

A aplicação deverá persistir a música em IndexedDB.

## Desenvolvimento local

Os comandos concretos serão definidos na inicialização do projeto. Este README não antecipa comandos que ainda não foram executados.
