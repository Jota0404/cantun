# ADR-065 — Reautenticação com senha para ações destrutivas (exclusão de conta)

- **Status:** Proposed
- **Data:** 2026-10-21
- **Bloco / spec:** B8 · `docs/specs/VS-07-privacidade.md` (RN-04, fatia 9) · issue #101
- **Relaciona-se a:** ADR-059 (servidor próprio), ADR-063 (exclusão de conta), ADR-049 (autorização no banco), Blueprint NFR-005
- **Decisão do owner:** opção A (2026-10-21)

## Contexto
A VS-07 RN-04 exige "sessão recente" para excluir a conta, mas hoje `delete_my_account()` só confere `app.current_user_id()`. Uma sessão de 30 dias roubada, ou um aparelho emprestado, apaga a conta sem a senha. A exclusão é irreversível (ADR-063, D3). O banco é quem autoriza (ADR-059); o servidor só abre a transação como `cantum_user` com `app.user_id`. Hoje o banco não sabe nada sobre a sessão, só sobre o usuário.

## Decisão
1. `app.sessions.reauth_at timestamptz` (nulo ao criar). Migration nova, aditiva. Sessões existentes ficam nulas e precisam reautenticar uma vez. O login não preenche o campo: a reautenticação é um passo explícito, mesmo logo após o login (simples, sem exceção a testar).
2. `POST /auth/reauth {password}`: exige sessão válida, usa `authLimit`, confere a senha com `verifyPassword` (resposta 401 genérica se errada; usuário sem senha/sentinela nunca passa) e faz `update app.sessions set reauth_at = now()` **só na sessão do cookie atual**. Resposta 204.
3. `asUser` ganha um terceiro contexto opcional da sessão e executa `set_config('app.session_reauth_at', <iso ou ''>, true)` junto com `app.user_id`. O servidor obtém `reauth_at` na mesma consulta que valida a sessão (`userIdForSessionHash` devolve também `reauth_at`) e o guarda no request. Chamadas sem esse contexto (Realtime, sync) passam vazio.
4. `public.delete_my_account()` lê `nullif(current_setting('app.session_reauth_at', true), '')::timestamptz` e exige `now() - reauth_at <= 5 min`. Nulo, vazio ou expirado: `raise exception 'recent authentication required' using errcode = 'insufficient_privilege'`. `fromPgError` mapeia esse par (42501 + mensagem) para `HttpError(403, 'reauth_required')`, distinto do 403 genérico `acesso negado`; o cliente usa o código para abrir o passo de senha.
5. Sem sessão deslizante: `reauth_at` não é renovado por uso. Janela fixa de 5 min a partir da senha. A janela vale só para a sessão que reautenticou (não para outros dispositivos do mesmo usuário).
6. Fora do escopo: exigir reauth em exportação ou em outras ações; troca de senha; MFA.

### Relação com outros ADRs
- **ADR-059:** continua valendo (autorização no banco, servidor só abre transação). O `asUser` passa a **propagar contexto de sessão** (`app.session_reauth_at`) além do usuário. O servidor não decide nada: só repassa um fato (quando a sessão reautenticou) e o banco aplica a regra. A confiança é a mesma do `app.user_id`: o valor é `set_config` local à transação, definido só por `asUser` no servidor, e `cantum_user` não tem como forjá-lo via `/rpc` (parâmetros de RPC não alteram configurações). Não substitui o ADR.
- **ADR-063:** não substituído. A RPC mantém todo o comportamento (único Owner, reatribuição, apagar na hora) e ganha só a pré-condição de recência.
- Convenção que fica: contexto de sessão que o banco precisa vira `app.session_*` via `set_config(..., true)`, nunca parâmetro de RPC.

## Alternativas descartadas
- **B — senha como parâmetro de `delete_my_account(password)`:** o hash scrypt está no servidor/Node (parâmetros OWASP, `maxmem` alto); verificar no SQL exigiria extensão ou reimplementar scrypt, quebrando portabilidade (ADR-049), ou levar a senha ao SQL e ao log de queries. Rejeitada.
- **C — janela por `created_at` da sessão (login recente):** não prova posse da senha na hora da ação e obriga logout/login, UX ruim; sessão roubada recente ainda passa. Rejeitada.
- **Token de reauth separado do cookie:** mais uma tabela/credencial sem ganho sobre a coluna na sessão. Rejeitada.

## Consequências
- Migration `db/migrations/NNNN_session_reauth.sql` (próximo número livre): coluna + `create or replace` de `delete_my_account` (corpo da 0013 + checagem). Teste no job `db`.
- `server/src/db.ts` (`asUser`), `server/src/auth.ts` (rota, retorno de `reauth_at`), `server/src/app.ts` (request), `fromPgError`, doc de contrato.
- Cliente: nova chamada `reauth(password)` em `src/platform`/`src/auth`; a UI de exclusão pede senha e, ao receber `reauth_required`, reabre o passo.
- Contas sem senha usável não existem hoje (cadastro exige senha); se surgir login social, este ADR precisa de revisão.

## Riscos
- Esquecer de propagar o contexto em um caminho novo de `asUser`: falha fechada (nulo = nega), mas pode bloquear a exclusão; teste cobre o caminho `/rpc`.
- Relógio: a comparação usa `now()` do banco nos dois lados (`reauth_at = now()`), sem depender do relógio do Node.
- Brute-force da senha em `/auth/reauth`: mitigado por `authLimit` (10/min por IP); sessão roubada ainda pode tentar; aceitável, igual ao login.
- 5 min é parâmetro proposto; ajustável em migration futura.
