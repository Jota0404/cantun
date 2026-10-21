# Passagem de trabalho — leia antes de agir (2026-10-21)

Para qualquer agente ou sessão que continue o CANTUM em outra máquina. Fonte de verdade continua sendo `CLAUDE.md`, `AI_CONTEXT.md`, o Blueprint e os ADRs `Accepted`. Este arquivo só diz **onde paramos**.

## Estado em `main`
- B0–B5 e B8 concluídos; B6 com fatias 1–3 (reprise/medley, #115, migration 0018). Próxima: **B6 fatia 4** (spec `docs/specs/VS-04-05-preparacao.md`).
- **B8 fatia 9** (reautenticação para excluir conta, ADR-065 `Accepted`, VS-07, issue #101) foi mesclada no #119 (migration 0019), com CI verde e reviewer sem bloqueios, **mas o QA de ponta a ponta com servidor e banco reais NÃO foi feito**.

## Pendência 1 — QA do #119 (fazer primeiro)
Cenários (conta fictícia criada pela UI, nunca conta real):
1. Excluir conta sem reautenticar: a UI sempre pede a senha; sem reauth em dia o servidor responde `403 reauth_required`.
2. Senha errada: "Senha incorreta.", nada é apagado, senha limpa e foco no campo.
3. Senha certa: `/auth/reauth` 204 e a exclusão acontece dentro da janela de 5 min; depois de 5 min o passo da senha reabre.
4. Sessão de outro dispositivo/aba do mesmo usuário não herda o reauth.
5. Sessão expirada/revogada: mostra "Sua sessão expirou. Entre novamente.", **não** "Senha incorreta." (era o achado nº 2 do reviewer).
6. Limite de 10 req/min em `/auth/reauth` (429); console e rede sem 5xx; mobile 375×812 (alvos ≥ 44 px, foco visível).
Se achar bug: abrir issue/PR de correção; auth/RLS/migration volta ao reviewer.
Depois do QA ok, **fechar a issue #101** (foi deixada aberta de propósito).

## Pendência 2 — ambiente local (nada disto vai ao Git)
- Banco de teste `cantum_teste` no PostgreSQL 16/17 local e `server/.env` (copiar de `server/.env.example`; `DATABASE_URL`, `APP_ORIGIN=http://localhost:5173`, `PORT=8787`). `.env.local` na raiz com `VITE_API_URL=http://localhost:8787` (use `localhost`, não `127.0.0.1`).
- `npm ci` na raiz e `npm ci --prefix server`; migrations: `node server/src/migrate.ts` com `DATABASE_URL` definida (0001–0019).
- **Atenção:** com `.env.local` presente, `src/platform/http.test.ts` falha localmente (lê `VITE_API_URL`). Para o gate completo, renomeie o `.env.local` só durante a execução; o CI não tem esse arquivo.
- Não peça nem leia segredos/`.env` (ADR-050). O usuário cria esses arquivos sozinho.

## Pendência 3 — follow-ups abertos (priorizar #116)
- **#116** sync: delete offline ressuscita e o pull não remove linhas apagadas em outro aparelho (mexe no `TargetSyncEngine`, ADR-026; precisa de reviewer e QA com banco real). Fazer antes do primeiro usuário real.
- **#117** use cases de serviço sem checagem local de `service.edit` (o banco já barra).
- #87 timeout de sessão com servidor travado; #54/#42 débito de ESLint (`set-state-in-effect`, #42); #22 Modo Passagem (congelado, D6).
- Hardening pequeno ainda sem issue: validação do body de `/auth/reauth` e limite exato de 5:00 nos testes; um IP por teste de rate limit no `server/src/app.test.ts`.

## Deploy / go-live (lembrete)
- **Aplicar a 0019 ANTES de publicar o servidor novo**: o servidor novo seleciona `reauth_at` em toda requisição autenticada (sem a coluna vira 500). Ver `docs/go-live-checklist*`.
- Hospedagem de produção ainda sem decisão do owner. Migrations 0007–0010+ em produção só depois de confirmar que há apenas dados de teste.

## Regras que valem aqui
- Quem coordena (lead) faz todo o Git; agentes **não** fazem add/commit/push/branch. Push e PR por fatia (ADR-061); **merge e exclusão de branch só com o ok do Jota**.
- Um agente por vez; chat novo por fatia; esforço: engenheiros baixo, reviewer/qa alto (xhigh em auth/RLS/migration).
- Conflito com ADR `Accepted`: pare e consulte o Jota.
- `.claude/handoffs/b8-reauth-fatia9.md` guarda os prompts por papel usados na fatia 9 (modelo para as próximas).
- `.claude/agents/lead.md` segue **fora do Git**, aguardando decisão do Jota.
