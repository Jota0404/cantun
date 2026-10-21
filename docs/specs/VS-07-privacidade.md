# Feature Spec — Privacidade mínima (LGPD) e recuperação

- **Status:** Aprovada (decisões D1–D7 do Jota, 2026-10-17; D6 depende do jurídico)
- **Bloco:** B8 (`docs/blocks/B8-privacidade-minima.md`)
- **Fatia vertical:** VS-07
- **Autor / data:** planner, 2026-10-17
- **ADR:** ADR-063 (Accepted) · Base: ADR-059, ADR-060, ADR-062, ADR-050, ADR-051

## Feature
Política e termos com aceite versionado, exclusão de conta, exportação do titular, regra de menores, remoção/anonimização de membro, log administrativo sem conteúdo e backup com restore testado.

## Objetivo
Liberar uso por igrejas reais com transparência e recuperação (Blueprint §30, NFR-006/008/009). Filiação a igreja é dado sensível (LGPD art. 11) e há adolescentes (art. 14). Este documento é material técnico; **a decisão legal é do owner com assessoria**.

## User Stories
- Como visitante, leio Política e Termos sem login e aceito a versão vigente ao me cadastrar.
- Como usuário, excluo minha conta e meus dados pessoais, sabendo o que acontece com o conteúdo do Ministério.
- Como usuário, exporto meus dados em JSON.
- Como Owner/Admin, removo um membro da equipe sem apagar a conta dele.
- Como Owner, tenho log das ações críticas sem conteúdo privado.
- Como owner do produto, restauro um backup em ambiente de teste e sei RPO/RTO.

## Regras de negócio
- RN-01 Cadastro (e login, se a versão mudou) exige aceite de Política e Termos da versão vigente; registro em `user_consents` (`user_id`, `document`, `version`, `accepted_at`), append-only.
- RN-02 Páginas `/privacidade` e `/termos` são públicas, funcionam sem sessão e mostram versão e data. Conteúdo vem de `docs/privacy/` (revisado pelo jurídico).
- RN-03 Excluir conta (ADR-063): bloqueia se for o único Owner de uma organização; conteúdo da organização (cópias de música, repertórios, serviços) é **reatribuído ao usuário anônimo**, não apagado; conteúdo pessoal, vínculos, atribuições, sessões e tokens são apagados.
- RN-04 Exclusão exige confirmação digitada e **reautenticação com senha nos 5 minutos anteriores, na mesma sessão** (ADR-065, fatia 9; o banco recusa sem ela); encerra todas as sessões; no cliente apaga o banco Dexie do usuário (ADR-048) e a fila de sync.
- RN-05 Estado do Palco ativo: se o excluído é o MD, o MD é liberado (`md_user_id` nulo, já `set null`); a sessão não é apagada.
- RN-06 Todas as atribuições do excluído (futuras e passadas) são apagadas em cascata (D3, apagar na hora); a vaga (`service_position`) fica aberta e o histórico passado deixa de listar a pessoa. Não há `replacement_needed` nem aviso ao Líder (decisão do lead, 2026-10-17); avisar o Líder quando a vaga abrir por exclusão de conta é follow-up (B4/B6).
- RN-07 `team_member.remove`: Owner/Admin e Líder ativo da equipe (não removem Líder; o Líder só remove `member`); apaga vínculo e atribuições futuras, mantém autoria e conta. Registra evento.
- RN-08 Exportação inclui só dados do próprio titular; sem tokens, hashes nem dados de terceiros (nomes de outros membros fora). Cópias de música, repertórios e serviços de **autoria do titular dentro de um Ministério** ficam fora do export: o conteúdo pertence à organização (ADR-062); o export traz as músicas e os repertórios pessoais, vínculos, atribuições e disponibilidade (decisão do lead, 2026-10-17).
- RN-09 `admin_events` registra: remoção de membro, mudança de papel, exclusão de conta, exportação. Campos sem conteúdo (sem e-mail, título, letra); append-only; leitura só Owner/Admin da organização; na exclusão o titular vira nulo.
- RN-10 Menores (D1 revisada, 2026-10-18): **idade mínima de 16 anos para ter conta própria** (ECA Digital, Lei 15.211/2025, em vigor desde 17/03/2026: contas de menores de 16 anos exigem vínculo a responsável legal; LGPD art. 14; Código Civil). O cadastro exige a declaração de que a pessoa tem 16 anos ou mais (Termos e formulário) e o servidor recusa o cadastro sem ela. **Não existe 'participante sem conta' no primeiro corte**: menores de 16 não entram no produto e o Líder não os adiciona. Contas de 16 e 17 anos são normais, com e-mail não exposto a quem não é Líder/Admin. A autodeclaração é provisória: a aferição confiável de idade depende da regulamentação da ANPD (jurídico, D6).
- RN-11 Logs do servidor não gravam corpo de requisição de música/repertório/e-mail (NFR-008).
- RN-12 `docs/BACKUP_RECOVERY.md`: RPO alvo 24 h, RTO alvo 4 h (proposto; D5), cópia fora do Render/Neon, restore executado e registrado com data.

- RN-13 Reautenticação (fatia 9, ADR-065): `POST /auth/reauth {password}` (sessão válida, `authLimit`) confere a senha e grava `app.sessions.reauth_at = now()` **só na sessão do cookie**. `asUser` repassa o valor ao banco (`app.session_reauth_at`). `delete_my_account()` exige `now() - reauth_at <= 5 min`; senão `insufficient_privilege` 'recent authentication required', que o servidor devolve como 403 `reauth_required`. Sem sessão deslizante; o login não preenche `reauth_at`; sessões antigas (nulas) precisam reautenticar. Exportar e outras ações ficam fora (sem reauth).
- NFR-RN13 Nenhuma regra de recência em TypeScript: o servidor só repassa o fato; a senha nunca vai ao SQL nem aos logs.

## Acceptance Criteria
- [ ] Cadastro sem aceite é recusado no servidor (não só na UI); com aceite grava `user_consents` com a versão vigente.
- [ ] Subir a versão da política força novo aceite no próximo login.
- [ ] `/privacidade` e `/termos` abrem deslogados e offline após o primeiro acesso (PWA).
- [ ] Excluir conta: `app.users` do titular, `sessions`, `email_tokens`, vínculos, atribuições (futuras e passadas, a vaga fica aberta) e músicas/repertórios pessoais deixam de existir (teste SQL).
- [ ] Após a exclusão, cópias de música do Ministério continuam existindo, com autoria "Ex-membro", e outros membros as leem.
- [ ] Único Owner não consegue excluir a conta (erro claro, nada alterado).
- [ ] Exclusão do MD durante Palco ativo não derruba o Stage dos demais.
- [ ] Exportação devolve JSON só do titular; teste prova ausência de dados de outro usuário.
- [ ] `team_member.remove` conforme RN-07; casos negativos abaixo negados.
- [ ] `admin_events` gravado nas ações de RN-09 e sem campos de conteúdo; Membro não lê.
- [ ] Restore documentado e executado ao menos uma vez; data e resultado no `BACKUP_RECOVERY.md`.
- [ ] Regra de menores implementada conforme decisão registrada.
- [ ] (Fatia 9) `delete_my_account` sem reauth recente na sessão é recusada pelo banco e nada muda; com `POST /auth/reauth` correto e a exclusão dentro de 5 min, funciona.
- [ ] (Fatia 9) A UI pede a senha, reutiliza a reautenticação na janela e reabre o passo ao receber `reauth_required`; senha errada mostra erro sem excluir.

### Fatia 9 — casos negativos obrigatórios (SQL/servidor/UI)
| # | Caso | Esperado |
|---|---|---|
| R1 | Excluir sem nunca ter reautenticado (`reauth_at` nulo) | 403 `reauth_required`, conta intacta |
| R2 | `/auth/reauth` com senha errada | 401 genérico; `reauth_at` inalterado; excluir segue negado |
| R3 | `/auth/reauth` anônimo ou sessão revogada/expirada | 401 |
| R4 | Reauth do usuário A não vale para B (cada sessão/usuário tem o seu) | B segue negado |
| R5 | Janela expirada (> 5 min, `reauth_at` antigo no teste SQL) | 403 `reauth_required` |
| R6 | Reauth na sessão do dispositivo 1; excluir pela sessão do dispositivo 2 do mesmo usuário | negado |
| R7 | Cliente tenta forjar `app.session_reauth_at` (parâmetro de RPC ou SET via `/rpc`) | sem efeito; teste SQL como `cantum_user` |
| R8 | Anônimo chama `delete_my_account` | negado (N1 mantém) |
| R9 | Rate limit: 11 tentativas/min em `/auth/reauth` | 429 |
| R10 | Sentinela "Ex-membro" / usuário sem senha em `/auth/reauth` | nunca passa |
Testes: SQL (`scripts/db`) R1, R5, R7 e caminho feliz, definindo `app.session_reauth_at` por `set_config`; servidor (integração) R2–R4, R6, R9; core `reauth` e mapeamento de `reauth_required`; UI (`getByLabelText('Senha')`) fluxo feliz, senha errada e reabertura.

## Casos negativos de permissão
| # | Caso | Esperado |
|---|---|---|
| N1 | Anônimo chama `delete_my_account` / `export_my_data` | negado |
| N2 | Usuário A tenta excluir ou exportar dados de B (id forjado) | impossível: a RPC não recebe id, usa `app.current_user_id()` |
| N3 | Membro comum chama `team_member.remove` | negado |
| N4 | Líder remove membro de outra equipe ou de outra organização | negado |
| N5 | Líder `inactive` remove | negado |
| N6 | Líder remove Líder, ou Admin remove Owner | negado |
| N7 | Membro lê `admin_events`; Owner de outra organização lê | negado |
| N8 | Usuário `inactive` exclui a própria conta | **permitido** (direito do titular) |
| N9 | Cliente grava ou apaga `user_consents` / `admin_events` direto | negado (só via RPC) |
| N10 | Usuário anônimo-sentinela faz login ou aparece em listas de membros | impossível |

## Requisitos
| ID | Descrição | Origem |
|---|---|---|
| RF-PRIV-01 | Páginas públicas de Política e Termos | Blueprint §30 |
| RF-PRIV-02 | Aceite versionado (`user_consents`) | §30, LGPD |
| RF-PRIV-03 | Exclusão de conta com anonimização de autoria | §30.1, ADR-062 |
| RF-PRIV-04 | Exportação JSON do titular | LGPD art. 18 |
| RF-PRIV-05 | `team_member.remove` | PERMISSIONS §ponto 4 |
| RF-PRIV-06 | Regra de menores | LGPD art. 14 |
| NFR-006 | Minimização e finalidade | Blueprint |
| NFR-008 | Log administrativo sem conteúdo | Blueprint |
| NFR-009 | Backup, retenção e restore testado | Blueprint |
| NFR-005 | Autorização no banco | Blueprint |

## Impacto

### Domínio
Novo contexto `privacy` (versão de documentos, elegibilidade de exclusão). Autoria de conteúdo da organização pode ser "ex-membro" (UI trata nulo/sentinela). Respeita Access Role ≠ Função Musical.

### Arquitetura
ADR-063. `server/` só adiciona RPCs à allowlist; sem regra de permissão em TS. Cliente via `src/platform`, nada de `src/lib/supabase`.

### Dados
- **SQL (`db/migrations/NNNN_privacy.sql`, aditiva):** `user_consents`, `admin_events` (RLS, sem policy de escrita direta); sentinela; RPCs `record_consent`, `delete_my_account`, `export_my_data`, `team_member_remove`; trocar `songs.user_id` para tolerar reatribuição (a RPC reatribui antes do delete, sem mudar a FK); permissão `team_member.remove` em `PERMISSIONS.md`.
- **Dexie:** sem versão nova esperada; exclusão chama `db.delete()` do usuário (ADR-048). Se guardar versão de aceite local, nova `version(N+1)`.
- **Sync / Realtime:** exclusão encerra WebSocket e fila; remoção de membro revalida acesso (ciclo de 60 s do Palco).
- **RLS:** `user_consents`: dono lê o próprio; `admin_events`: Owner/Admin da organização lê.

## Fatias e PRs
| # | Fatia | Tipo | Branch | Dono | Depende |
|---|---|---|---|---|---|
| 1 | `docs/privacy/` + `BACKUP_RECOVERY.md` (rascunho) + restore testado | doc/ops | `docs/b8-privacy-backup` | planner + Jota executa | — |
| 2 | Páginas `/privacidade` e `/termos` (estáticas) | cliente | `feat/b8-legal-pages` | ui-engineer | 1 (texto) |
| 3 | `user_consents` + `record_consent` + exigência no cadastro | SQL + cliente | `feat/b8-consent` | backend, core, ui | 2 |
| 4 | `admin_events` + `team_member.remove` | SQL + UI mínima | `feat/b8-member-remove` | backend, ui | — |
| 5 | `delete_my_account` + sentinela (ADR-063 Accepted) | SQL + servidor | `feat/b8-delete-account` | backend | 4, D2 |
| 6 | UI de exclusão + limpeza local | cliente | `feat/b8-delete-ui` | core, ui | 5 |
| 7 | `export_my_data` + botão | SQL + cliente | `feat/b8-export` | backend, ui | — |
| 8 | Idade mínima de 16 anos (declaração no cadastro, validação no servidor, Termos e Política) | SQL + servidor + UI | `feat/b8-minors` | backend, ui | D1 revisada (aprovada) |
| 9 | Reautenticação com senha antes de excluir a conta (RN-13, ADR-065 Accepted, issue #101) | SQL + servidor + cliente + UI | `feat/b8-reauth-delete` | backend, core, ui | 5, 6 |

Fatias 4 e 7 são independentes das demais. Só SQL: parte de 4, 5, 7. Só doc: 1.

## Fora do escopo
Perfil público e moderação (B10); transferência automática de propriedade; DPO/portal de titulares; anonimização de logs de infraestrutura do Render/Neon; cookies/analytics (não existem); notificações por e-mail.

## Teste de fronteira (§40)
Organiza/prepara serviço? Não diretamente: é infraestrutura de confiança exigida por §30. Não cria chat, CRM, doações nem gestão da igreja. Coleta nada novo além do já existente. Aprovado como requisito de produção, sem ampliar o produto.

## Plano de testes
- **Domínio/application:** elegibilidade de exclusão (único Owner), comparação de versão de aceite.
- **Repositórios:** limpeza do Dexie do usuário após exclusão.
- **UI:** cadastro bloqueado sem aceite (`getByRole checkbox`); confirmação digitada; páginas públicas deslogadas.
- **SQL/RLS (`scripts/db`):** matriz N1–N10; exclusão preserva cópias do Ministério; `export_my_data` sem dados alheios; `admin_events` sem conteúdo.
- **Manual:** restore do dump em banco local (OPERATIONS §8.3), exclusão com Palco aberto em 2 aparelhos, offline.

## Decisões do Jota (jurídico/produto)
Aprovadas em 2026-10-17, como recomendado:
- D1 Menores: **revisada em 2026-10-18 pelo Jota**: idade mínima de **16 anos** para conta própria, sem 'participante sem conta' no primeiro corte (substitui a opção (c) com 13/14). Motivo: ECA Digital (contas de menores de 16 vinculadas a responsável e aferição de idade), LGPD art. 14 e Código Civil. Fica para depois, se a igreja precisar, o 'participante sem conta' (só nome e função, visível ao Líder, com consentimento do responsável registrado). Validação final com o jurídico (D6): se o app é de 'acesso provável' por menores e se a autodeclaração basta até a ANPD detalhar a aferição.
- D2 Autoria na saída: anonimizar ("Ex-membro"), não transferir ao Owner.
- D3 Retenção pós-exclusão: apagar na hora, sem janela de desfazer.
- D4 Único Owner: bloquear a exclusão até transferir a propriedade.
- D5 RPO 24 h / RTO 4 h: dump diário manual até um plano pago.
- D6 Contato do controlador, bases legais e subprocessadores (Render, Neon, provedor de e-mail): **texto final é do jurídico**; a implementação usa texto provisório marcado como tal.
- D7 Nova versão da política: exigir novo aceite no próximo login.

## Riscos
| Risco | Mitigação |
|---|---|
| Interpretação jurídica errada | Fatias 1 e 8 aguardam revisão; código parametrizado por versão |
| Exclusão apaga conteúdo do Ministério | Reatribuição antes do delete + teste dedicado (ADR-062) |
| `restrict` em `services.created_by_user_id` quebra a exclusão | Reatribuir ao sentinela na RPC; teste |
| Sentinela vazar em listas ou login | Excluir em consultas de membros; sem credencial; teste N10 |
| Backup nunca restaurado | Fatia 1 só fecha com restore executado e registrado |
| Janela curta de histórico no Neon free | Dump manual fora do Render (OPERATIONS §8) |
| Dado pessoal em dumps após exclusão | Definir retenção de dumps (ex.: 30 dias) no BACKUP_RECOVERY |

## Issues
- [ ] #<n> — uma por fatia 1–8
