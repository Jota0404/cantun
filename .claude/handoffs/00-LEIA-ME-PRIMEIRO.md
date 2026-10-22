# Passagem de trabalho — leia antes de agir (2026-10-22)

Para qualquer agente ou sessão que continue o CANTUM. Fonte de verdade continua sendo `CLAUDE.md`, `AI_CONTEXT.md`, o Blueprint e os ADRs `Accepted`. Este arquivo só diz **onde paramos**.

## Estado em `main`
- B0–B6 e B8 concluídos. B6 completo em código (fatias 1–7, migrations até a **0022**), exceto a **fatia 8 (upload de arquivos)**, adiada pelo owner (D10, 2026-10-22): fora do MVP, materiais seguem como links https; ADR-064 continua `Proposed`.
- QA do #119 (reautenticação para excluir conta) feito com servidor e banco reais: ok; issue #101 fechada. Três ajustes de UX de baixa severidade ficaram **sem issue** por decisão do owner (mensagem de sessão expirada no reauth com sessão revogada, 429 do reauth que fala em "conexão", Enter no campo de senha não envia).
- QA do bloco B6 (dois usuários, offline, 375/768) feito: ok depois do #126.
- #126 corrigiu o sync (issue #116): deletes atômicos, o pull não ressuscita linha com delete pendente e espelha o servidor só em `serviceItems`, `repertoireItems`, `servicePositions` e `memberAvailability`. Follow-ups em **#127**. Invariante: o GET `/sync` não pode ganhar limite/paginação sem um marcador de "pull completo".
- **B7 Execução & Histórico** (VS-06) implementado nas fatias 1–7 (migrations **0023** registro da execução e **0024** log de atividade; "Registro da execução", "Realizados", histórico e repertórios relacionados na música, bloco "Atividade" no Início). Fatia 7 refatorou o `StagePage` solo (581→142 linhas, sem mudar comportamento, com 21 testes de caracterização); o Palco segue congelado para features. QA do bloco feito com servidores reais: ok; achados corrigidos (reuso da sessão de Palco em `startOrResumeStage`, autor nos eventos de serviço).
- **D1–D6 do VS-06 decididas pelo owner em 2026-10-22** (D1 tom efetivo, D2 bloquear concluir com Palco aberto de MD ativo, D3 só `confirmed`, D4 recusa/substituição só para quem gerencia a equipe, D5 log 90 dias e registro enquanto existir, D6 RF-HIS no Blueprint). Mudar é migration aditiva.
- Riscos/achados B7 sem correção: `stage_sessions` ganha índice único de sessão aberta na migration **0025** (outro PR: no máximo uma `lobby`/`live` por serviço; criar devolve a existente); "Meus serviços" ganha a seção "Realizados" do próprio membro (decidido, emenda VS-05 RN-02, a implementar); o status `declined` segue legível em `assignments` (D4 esconde só o evento); a purga de 90 dias só roda quando a organização ganha evento (levar ao B8/LGPD); `GET /sync/activity_events` ignora a janela de 30 dias.

## Ideias adiadas pelo owner (NÃO propor nem implementar sem ele retomar)
`docs/FUTURE_IDEAS_IMPORT_AND_AUDIO.md`: importação de músicas além do `.txt` (colar texto, PDF/Word, OCR; IA só com decisão) e áudio por música com player fora do Palco. Não crie spec/ADR delas.

## Pendências do owner (nada disto a IA faz)
1. **Produção:** aplicar as migrations 0007–0025 seguindo `docs/GO_LIVE_CHECKLIST.md`, com a **0019 antes do servidor novo** (o servidor seleciona `reauth_at`; sem a coluna vira 500). Confirmar antes que o banco só tem dados de teste; restore testado (BACKUP_RECOVERY).
2. **Texto jurídico** do B8 (D6): contato do controlador, bases legais, retenção, subprocessadores, validação dos 16 anos.
3. **Hospedagem de produção no Brasil:** decidir depois, antes do primeiro usuário real.

## Ambiente local (nada disto vai ao Git)
- Banco de teste `cantum_teste` no PostgreSQL local; `server/.env` (copiar de `server/.env.example`) e `.env.local` na raiz com `VITE_API_URL=http://localhost:8787` (use `localhost`, não `127.0.0.1`). Migrations: `node server/src/migrate.ts` com `DATABASE_URL`. Não peça nem leia segredos/`.env` (ADR-050).
- Com `.env.local` presente, `src/platform/http.test.ts` falha localmente (lê `VITE_API_URL`); o CI não tem esse arquivo.
- Em máquina sob carga a suíte inteira do vitest pode estourar tempo: rode por arquivo; o CI roda a completa.

## Follow-ups abertos
#127 (sync), #117 (use cases sem checagem local de `service.edit`), #87 (timeout de sessão com servidor travado), #54/#42 (ESLint set-state-in-effect), #22 (Modo Passagem do Palco; congelado até o fim da Fase 2, D6).

## Regras que valem aqui
- Quem coordena (lead) faz todo o Git; agentes **não** fazem add/commit/push/branch. Push e PR por fatia (ADR-061); merge e exclusão de branch só com o ok do Jota, **salvo autorização explícita dele na sessão**.
- Exclusivo do Jota: push forçado em `main`, settings/secrets do GitHub e qualquer ação em banco ou ambiente de produção.
- Esforço: engenheiros baixo, reviewer/qa alto (máximo em auth/RLS/migration/sync). Conflito com ADR `Accepted`: pare e consulte o Jota.
- `.claude/handoffs/b8-reauth-fatia9.md` guarda prompts por papel (modelo). `.claude/agents/lead.md` segue fora do Git.
