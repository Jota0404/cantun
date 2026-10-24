# Passagem de trabalho — leia antes de agir (2026-10-23)

Para qualquer agente ou sessão que continue o CANTUM. Autoridade: `CLAUDE.md`, `AI_CONTEXT.md`, Blueprint e ADRs `Accepted`. Este arquivo só diz **onde paramos** e o que já se aprendeu. Resumo leigo para o owner: `docs/STATUS_DO_PROJETO.md`.

## Estado em `origin/main` (`79ca901`, docs atualizados em 2026-10-23)
- **B0–B8 concluídos em código.** Migrations `db/migrations/0001–0027`, Dexie v21. Detalhe por bloco: `docs/blocks/00-INDICE.md`; specs com status e caixas em `docs/specs/`.
- **B6** sem a fatia 8 (upload de arquivos): adiada pelo owner (D10). Materiais só como link `https`; ADR-064 segue `Proposed`.
- **B7** fatias 1–7 + QA; D1–D6 do VS-06 decididas (2026-10-22). Depois: 0025 (uma sessão de Palco `lobby`/`live` por serviço; o create devolve a existente), 0026 (trocar de item zera o tom ao vivo), 0027 (serviço concluído não se exclui: 403 `service_completed`; a cascata da organização ainda apaga), "Realizados" em Meus serviços (#138).
- **Follow-ups já entregues:** #87 (timeout da sessão), #117 (`service.edit` nos casos de uso), #127 itens 1/3/4/5 (espelho de `services`/`repertoires`, pull periódico, código morto, `pullComplete`), #132 itens 1–5 (topo ao trocar, wake lock, tela cheia, Limpar anotação, 0026, rodapé), sync: ordem pai→filho na fila (#149), timeouts de requisição e `epoch` nos engines (#150), limpeza do que o membro perdeu acesso (#152), `signOut` para os engines antes de limpar (#146).

## Decisões já tomadas (não reabrir sem o owner)
D1–D7 do plano (`docs/DELIVERY_PLAN.md` §2); D1–D10 do VS-04/05; D1–D6 do VS-06; D1–D7 do VS-07; Palco congelado para features (D6 do plano); serviço concluído não se exclui; uma sessão de Palco aberta por serviço; sem lembrete automático nem Web Push na escala (ADR-054); ideias de importação e áudio adiadas (`docs/FUTURE_IDEAS_IMPORT_AND_AUDIO.md`: não propor, não criar spec/ADR).

## Abertos (issues reais)
- #127 itens 2 (posições duplicadas → 409 `failed`) e 6 (janela residual de `removeLocalByOwner` fora da transação).
- #132 item 6 (`ServiceStageMusicianPage` compartilhar componentes; muda markup visível).
- #42 (6 páginas com exceção de `react-hooks/set-state-in-effect` em `eslint.config.js`).
- #22 (Modo Passagem do Palco; congelado, D6). #54 (B10 Network, hipótese).
- Épicos #50 (B6) e #51 (B7) foram fechados em 2026-10-23.
- Sem issue (limites conhecidos, registrados nos PRs #136/#140/#150/#152): `declined` legível em `assignments` (D4 esconde só o evento); purga de 90 dias do log só roda quando a organização ganha evento; `GET /sync/activity_events` ignora a janela de 30 dias; corrida residual entre `transition_service` concluindo e um create de Palco; RPCs online abortadas por timeout podem já ter sido aplicadas; dados de organização perdida ficam no aparelho até descartar o item `failed` que os prende; três ajustes de UX do reauth de baixa severidade.
- Palco do serviço sem auto-scroll e transposição rápida (só no Palco avulso): é feature, decisão do owner.

## Pendências do owner (a IA não faz)
1. **Lançamento:** hospedagem no Brasil (preferência **AWS**, decidir perto do lançamento com ajuda de um amigo; `docs/HOSTING_OPTIONS_BR.md` §5) e novo ADR no lugar do ADR-060.
2. **Migrations 0007–0027 em produção** pelo `docs/GO_LIVE_CHECKLIST.md`: confirmar que só há dados de teste; dump + restore testado; migrations e servidor na mesma subida, **0019 antes do servidor novo** (ele lê `app.sessions.reauth_at`).
3. **Texto jurídico** (Política, Termos, menores, retenção, controlador): `docs/privacy/LEGAL_REVIEW_BRIEF.md`; depois, PR com nova versão de consentimento.
4. Registrar um restore de dump real em `docs/BACKUP_RECOVERY.md` §7.

## Como trabalhar
- **Worktree por fatia:** `git fetch && git worktree add ../s-<nome> -b <branch> origin/main`. Sempre parta de `origin/main` explícito: o `main` local deste clone está atrasado (`f434fa8`) e o worktree principal (`cantun/`) está numa branch antiga.
- **Gate:** `npm test && npm run lint && npm run build` (o build roda `tsc -b` também nos testes). SQL: `scripts/db/verify-migrations.sh` (banco descartável). Servidor: `cd server && npm run typecheck && npm test` (precisa de PostgreSQL).
- **Checks do CI:** `validate` (CANTUM CI, todo PR), `verify-migrations` (DB, quando o PR toca `db/` ou `scripts/db/`) e `test` (Server, quando toca `server/`, `db/` ou `scripts/db/`). Merge só com os checks que rodaram verdes.
- **Fluxo:** planner → backend → core → ui → `/ponytail:ponytail-review` → reviewer → qa → lead (gate + PR). Lead faz todo o Git; agentes não fazem add/commit/push/branch. Push e PR por fatia com gate + Revisor + QA verdes (ADR-061); merge e exclusão de branch só com o ok do Jota.
- Exclusivo do Jota: push forçado em `main`, settings/secrets do GitHub, qualquer ação em banco ou ambiente de produção.
- Conflito com ADR `Accepted`: pare e consulte o Jota.

## Armadilhas aprendidas
- **zsh:** `set -- $var` não divide por espaço (sem word splitting); use arrays (`${=var}` ou `read -A`).
- **Vitest:** a suíte inteira trava ou estoura tempo sob carga local; rode por pasta (`npx vitest run src/sync`); o CI roda tudo.
- Com `.env.local` presente, `src/platform/http.test.ts` falha localmente (lê `VITE_API_URL`); o CI não tem esse arquivo.
- **Servidor de teste e banco descartável:** banco local `cantum_teste`; `server/.env` copiado de `server/.env.example`; `.env.local` com `VITE_API_URL=http://localhost:8787` (use `localhost`, não `127.0.0.1`: o cookie exige o mesmo site). Migrations: `node server/src/migrate.ts` com `DATABASE_URL`.
- **Nunca leia nem peça `.env`, senhas, connection strings ou chaves** (ADR-050).
- **Estilo:** `src/styles/noLiteralColors.test.ts` reprova cor literal em CSS; use `var(--color-*)` de `src/styles/tokens.css` (`tokens.test.ts` confere os tokens e alvos de toque).
- Não adicione arquivos à lista de exceções de lint (#42). Dexie: só `version(N+1)` novo. SQL: só migration nova em `db/migrations/`, nunca editar aplicada.
- O GET `/sync` não pode ganhar limite/paginação sem um marcador de "pull completo" (invariante em `server/src/data.ts` e `src/platform/sync.ts`).
- `.claude/handoffs/b8-reauth-fatia9.md` é um modelo de prompts por papel; `.claude/agents/lead.md` fica fora do Git; para iniciar um novo lead use `.claude/handoffs/PROMPT-NOVO-LEAD.md`.
