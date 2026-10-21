# B8 fatia 9 — reautenticação para excluir conta (#101): prompts dos chats

Branch: `feat/b8-reauth-delete` (a partir de `main`; ADR-065 Accepted + VS-07 fatia 9 já commitados). Migration: próximo número livre em `db/migrations/` (conferir). Um chat novo por papel, em ordem: backend → core → ui → reviewer (xhigh) → qa. Cada um responde em UMA linha (reviewer/qa: relatório).
Esforço: engenheiros baixo (backend médio, auth/RLS novo); reviewer xhigh; qa alto. Modelo Sonnet.

Contexto comum (cole no início de cada chat):

> Projeto CANTUM. Leia `CLAUDE.md`, `AI_CONTEXT.md`, `docs/adr/ADR-065-reautenticacao-acoes-destrutivas.md` e a fatia 9 de `docs/specs/VS-07-privacidade.md` (RN-04, RN-13, matriz de negativos R1–R10). Issue #101.
> Desenho: `app.sessions.reauth_at` (nulo no login); `POST /auth/reauth {password}` (com `authLimit`) confere a senha e faz `reauth_at = now()` na sessão atual; `asUser` passa `reauth_at` ao banco por `set_config('app.session_reauth_at', …, true)`; `delete_my_account()` exige recência ≤ 5 min, senão erro `42501` "recent authentication required", que o servidor mapeia para `403 reauth_required`; sem sessão deslizante; só a exclusão de conta exige reauth.
> Você NÃO pode: git add, commit, push, stash, switch, reset, checkout, rebase, criar branch ou mexer fora do seu escopo. Rode testes focados. O lead faz todo o Git. Não peça nem leia segredos/.env.

## 1) backend-engineer
Escopo: nova migration em `db/migrations/`, `db/tests/` (R1, R5, R7 e caminho feliz), `scripts/db`, `server/src/db.ts` (`asUser`, `fromPgError`), `server/src/auth.ts` (`/auth/reauth`, `userIdForSessionHash` devolvendo `reauth_at`), `server/src/app.ts`/`data.ts` (repassar `reauth_at` no `/rpc`), testes do servidor (R2–R4, R6, R9), doc de contrato. Proibido: `src/`.
Migration aditiva: coluna + `create or replace` de `delete_my_account` (corpo da 0013 + checagem), `security definer`, `set search_path = ''`, `app.current_user_id()`. Nada de recurso exclusivo de provedor.
Resposta: uma linha com resultado e o que NÃO conseguiu verificar (o `verify-migrations.sh` roda no CI).

## 2) core-engineer — só depois do backend commitado
Escopo: `reauth(password)` em `src/platform` e `src/auth` (`authContext.ts`, `AuthContext.tsx`), `src/application/privacy/deleteMyAccount.ts` mapeando `reauth_required` (+ testes). Proibido: pages, components, db/, server/.

## 3) ui-engineer — só depois do core
Escopo: `src/pages/Navigation/MorePage.tsx` + `.css` + `.test.tsx`. Campo "Senha" no fluxo de exclusão, erro de senha errada, reabertura do passo ao receber `reauth_required`; pt-BR; testes por papel/label; alvos ≥ 44 px, foco visível.

## 4) reviewer (xhigh) — 1 vez, depois dos 3 engenheiros
Somente leitura. `git diff main...HEAD`. Foco: auth/RLS/migration: reauth da sessão de outro dispositivo não vale; janela expirada; senha errada; outro usuário; anônimo; `set_config` local à transação (sem vazamento entre requisições do pool); falha fechada se o contexto faltar; brute-force/`authLimit`; mensagens sem enumeração de usuário; migration aditiva e idempotente; `asUser` em todos os caminhos (/rpc, /sync, /realtime); ADR-065 respeitado; testes negativos R1–R10 realmente cobrem. Saída: bloqueia / corrigir / sugestão com arquivo:linha, ou OK por categoria.

## 5) qa (alto) — depois do reviewer OK e gate verde
Com o servidor e o banco de TESTE local (`cantum_teste`; não ler `.env`). Cenários: excluir conta sem reautenticar (bloqueia), com senha errada, com senha certa dentro de 5 min, depois de 5 min, com sessão de outro dispositivo; limite de tentativas; mobile 375×812; console/rede. Use conta fictícia criada pela UI; não excluir contas reais.
