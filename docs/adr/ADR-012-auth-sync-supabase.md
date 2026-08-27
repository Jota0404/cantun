# ADR-012 — Autenticação e sincronização multidispositivo com Supabase

**Status:** Accepted  
**Data:** 2026-08-27

## Contexto

O produto passou a exigir que o mesmo usuário possa acessar músicas e repertórios em múltiplos dispositivos, mantendo funcionamento offline e sincronizando alterações quando a conexão retornar.

## Decisão

Adicionar Supabase como infraestrutura remota para:

- autenticação por e-mail e senha;
- PostgreSQL para músicas, repertórios e relações;
- RLS por `auth.uid()`;
- sincronização incremental entre IndexedDB e PostgreSQL;
- tombstones para exclusões offline;
- resolução simples de conflitos por `updatedAt`.

IndexedDB/Dexie permanece como armazenamento local e a aplicação continua local-first.

## Fluxo

```text
React
  ↓
Application / Repository
  ↓
IndexedDB ←→ Sync Queue ←→ Supabase
                              ↓
                         Auth + Postgres
```

## Offline

Operações locais são aplicadas imediatamente no IndexedDB. Alterações autenticadas entram em uma fila local e são enviadas quando houver conexão.

## Segurança

As tabelas remotas pertencem a um `user_id` derivado da sessão. RLS restringe leitura e escrita ao usuário autenticado. Nenhuma chave secreta/service role é enviada ao frontend; apenas a chave publicável é utilizada pelo cliente.

## Conflitos

A primeira estratégia é last-write-wins baseada em `updatedAt`, preservando alterações locais pendentes enquanto ainda estiverem na fila de sincronização.

## Consequências

- login e sincronização deixam de ser funcionalidades futuras;
- Supabase passa a ser dependência de infraestrutura;
- IndexedDB continua necessário para offline;
- exclusões exigem tombstones;
- futuras estratégias de merge podem substituir o LWW sem alterar o domínio principal.

## Decisões substituídas

Este ADR substitui, para o escopo de autenticação/sincronização, a restrição anterior de `ADR-010 — Sem Backend no MVP`. As demais decisões local-first, IndexedDB, Dexie e Repository Layer permanecem válidas.
