# CANTUM

Aplicativo offline para músicos de igreja organizarem repertórios, armazenarem suas versões personalizadas de cifras e executarem músicas em um modo de palco otimizado para celular e tablet.

> Nome atual do projeto/aplicativo. A identidade visual e demais decisões de produto podem ser tratadas separadamente.

## Status

**MVP v0.1 — implementação concluída e validada.**

O MVP foi validado com testes automatizados, lint, build e validação em dispositivo real/offline.

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
- `docs/SALMODIA_PRODUCT.md` — requisitos e escopo do produto.
- `docs/SALMODIA_ARCHITECTURE.md` — arquitetura e decisões técnicas.
- `docs/adr/` — decisões arquiteturais individuais e seus motivos.

Os nomes dos arquivos documentais históricos `SALMODIA_*` são preservados para não alterar caminhos técnicos sem necessidade.

## Princípios

1. Simplicidade antes de abstração.
2. Offline-first no MVP.
3. O Modo Palco é uma experiência crítica do produto.
4. Claude pode sugerir, mas não altera decisões `Accepted` silenciosamente.
5. Você mantém o controle sobre Git, commits, testes e integração.
6. Funcionalidades são construídas em vertical slices.
