# CANTUM — Briefing para revisão jurídica (LGPD, Política e Termos)

> **Rascunho técnico para o advogado. NÃO é aconselhamento jurídico** nem texto ao titular. Descreve o que o sistema faz hoje (código em `main`, migrations até a 0025) e o que falta decidir. Bases legais aqui são **sugestões a confirmar**; nada foi validado juridicamente. Itens marcados "a confirmar" são suposições ou fatos não verificados.
> Fontes no repo: `docs/privacy/DATA_MAP.md`, `privacy-policy.md`, `terms.md`, `docs/BACKUP_RECOVERY.md`, ADR-060, ADR-063, ADR-065, `db/migrations/`, Blueprint §18.10, §30, §50.

## 0. O produto em uma linha

Ferramenta para equipes de louvor de igrejas organizarem pessoas, funções musicais, escalas, repertórios, ensaios e a execução das músicas no culto (Modo Palco). Fora do produto: chat, feed, pagamentos, gestão geral da igreja, IA, recrutamento (Blueprint §3, §40). Ainda **sem usuários reais**; o go-live depende desta revisão.

Partes: o **operador do CANTUM** (Jota, pessoa física hoje; a confirmar se haverá PJ) e as **organizações** (igrejas/ministérios) que criam espaços e convidam membros. Quem é controlador de quê (CANTUM vs. igreja) é a pergunta P1.

## 1. Dados coletados, finalidade, base sugerida, retenção, acesso

| Dado | Onde | Finalidade | Base legal SUGERIDA (a confirmar) | Retenção implementada | Quem acessa |
|---|---|---|---|---|---|
| E-mail, nome de exibição, hash de senha (scrypt) | `app.users` | criar conta, autenticar | execução de contrato (art. 7º, V) | até a exclusão da conta; apagado na hora | o titular; nome visível a membros das mesmas organizações |
| Sessão (hash do token, criação, expiração, `reauth_at`) | `app.sessions` | manter login; reautenticar antes de excluir conta (ADR-065) | execução de contrato / segurança | expira em 30 dias; apagada na exclusão. Não há purga de sessões expiradas (a confirmar se precisa) | só o servidor |
| Tokens de e-mail (hash) | `app.email_tokens` | confirmar e-mail, redefinir senha | execução de contrato | expiram; apagados na exclusão | só o servidor |
| Vínculos: organização, equipe, papel, funções musicais | `*_memberships` | controle de acesso e escala | contrato + **dado sensível potencial** (art. 11), ver §4.5 | até remoção do vínculo ou exclusão | membros da organização; papéis de gestão |
| Convites de organização (e-mail do convidado, que pode ainda não ter conta) | `organization_invites` | convidar pessoa | legítimo interesse do convidante? (a confirmar) | **sem purga**: fica até a organização ser excluída (a confirmar se aceitável) | Owner/Admin da organização |
| Escala (atribuições, resposta, substituição) e indisponibilidade | `assignments`, `member_availability` | montar escalas | execução de contrato | apagadas na exclusão (passadas e futuras); remover membro apaga só as futuras (ADR-063 §3) | gestores da equipe; membros veem a escala |
| "Preparado" por serviço | `service_preparations` | o membro marca que se preparou | execução de contrato | apagado na exclusão; entra na exportação | o próprio, Owner/Admin, Líder da equipe |
| Conteúdo pessoal (músicas, repertórios sem organização) | `songs`, `repertoires` | biblioteca pessoal | execução de contrato | apagado na exclusão | só o titular |
| Conteúdo da organização (músicas, repertórios, serviços, ensaios, materiais por link) | várias | operar o ministério | execução de contrato com a organização (a confirmar) | permanece com a organização; autoria vira "Ex-membro" (sentinela, ADR-063) | membros da organização |
| Registro de execução (serviço concluído: músicas, tons, quem tocou) | `service_executions*` (0023) | histórico do ministério | legítimo interesse da organização (a confirmar) | enquanto o serviço/organização existir; na exclusão da conta, o usuário vira nulo ("Ex-membro") | membros ativos da organização |
| Log de atividade (só ids + tipo de evento) | `activity_events` (0024) | transparência operacional, somente leitura | legítimo interesse (a confirmar) | **90 dias** (purga a cada inserção, por organização); leitura mostra 30 dias; ator vira nulo na exclusão | membros da organização; recusas/substituições só para gestores |
| Log administrativo (remover membro, excluir conta, exportar) | `admin_events` (0011/0013) | auditoria de ações críticas | legítimo interesse / obrigação legal? (a confirmar) | **sem prazo de purga**; ator/alvo viram nulos na exclusão | Owner/Admin da organização |
| Consentimento: `privacy`, `terms`, `age` (versão + data) | `user_consents` (0015/0016) | prova do aceite e da declaração de idade | cumprimento de obrigação / exercício de direitos (a confirmar) | **apagado na exclusão** (cascata); ver P8 | o titular (leitura) |
| Logs do servidor (método, rota sem query, status, tempo, **IP do cliente** e do proxy) | painel do Render | operação e segurança, rate limit | legítimo interesse | conforme o Render (prazo a confirmar). **Divergência:** `DATA_MAP.md` §1 não cita o IP, mas `server/src/app.ts` o registra | operador (Jota) |
| Cópias de segurança (`pg_dump` do banco inteiro) | disco do Jota + nuvem pessoal com 2FA | recuperação | legítimo interesse / segurança | **30 dias (proposto, manual)**; dump não criptografado por padrão | operador (Jota) |
| Cópia local no aparelho (IndexedDB) | navegador do titular | uso offline | execução de contrato | apagada no logout e na exclusão (ADR-048) | o titular |

Não coletados: data de nascimento, documento, localização, contatos, cookies de analytics/publicidade, dados de pagamento. Único cookie: sessão (`cantum_session`, httpOnly).

## 2. O que já está implementado e onde

| Direito / controle | Como funciona | Onde |
|---|---|---|
| Exclusão de conta | RPC `delete_my_account()`: bloqueia o único Owner de organização; reatribui conteúdo da organização ao sentinela "Ex-membro"; apaga na hora conta, conteúdo pessoal, vínculos, escalas, sessões, tokens, consentimentos. Irreversível | `db/migrations/0013_delete_account.sql`, `0019_session_reauth.sql`; ADR-063 |
| Reautenticação | excluir a conta exige senha nos últimos 5 min, só na sessão atual | `0019`, `server/src/auth.ts`; ADR-065 |
| Anonimização | autoria de conteúdo da organização e referências em execução/log viram sentinela ou nulo; UI mostra "Ex-membro" | `0013`, `0023`, `0024` |
| Exportação | RPC `export_my_data()` devolve JSON do próprio titular (perfil, vínculos, músicas/repertórios próprios, escalas, preparações, consentimentos), sem dados de terceiros nem tokens; registra `account.export` | `0012`, `0013`; tela "Mais" |
| Consentimento versionado | aceite de Política e Termos gravado com versão e data no cadastro; versão nova exige novo aceite no login | `0015`; `src/domain/privacy/consent.ts` (`CONSENT_VERSION = '2026-10-17'`) |
| Idade mínima 16 anos | autodeclaração obrigatória no cadastro, gravada como `age`; sem verificação, sem data de nascimento | `0016`; `src/domain/privacy/age.ts` |
| Remoção de membro | apaga vínculo e escalas futuras; registra em `admin_events` | `0011` |
| Isolamento por organização | permissões no banco (RLS + funções `security definer`) | ADR-049, ADR-051, ADR-059; `docs/PERMISSIONS.md` |
| Logs sem conteúdo | servidor redige cookie, token, corpo e query string | `server/src/app.ts` (`LOG_REDACT`, `LOG_SERIALIZERS`) |

**Não implementado:** canal de atendimento ao titular para direitos além de exportar/excluir (correção é feita pelo próprio app quando cabe; demais pedidos sem canal); procedimento de incidente; correção por terceiros; verificação de idade; registro de contas excluídas para reaplicar após restore (§4.7).

## 3. Subprocessadores e transferência internacional

Confirmado no código/ADR:

| Operador | Uso no código | Dados recebidos | Região |
|---|---|---|---|
| **Render** (web service Free) | hospeda o `server/` e o front, mesma origem (ADR-060) | todo o tráfego em trânsito; logs de acesso com IP | fora do Brasil (ADR-060 §8); região exata a confirmar no painel |
| **Neon** (PostgreSQL Free) | banco de dados (ADR-060; `server/src/migrate.ts`) | todos os dados armazenados (§1) | fora do Brasil; região a confirmar |
| **Brevo** (API de e-mail) | `server/src/mailer.ts` (`api.brevo.com/v3/smtp/email`) | e-mail e nome do destinatário, link; **e, no convite de escala, função musical, nome do serviço e data/hora** (`server/src/schedule.ts`). **Divergência:** `DATA_MAP.md` §2 diz que o Brevo não recebe escalas | a confirmar (empresa francesa; armazenamento a confirmar) |
| Nuvem pessoal do operador (Drive/iCloud) para dumps | `docs/BACKUP_RECOVERY.md` §1 | cópia integral do banco | a confirmar; a confirmar se conta como operador |

Não encontrados no repo: analytics, APM, CDN externa, armazenamento de arquivos (upload adiado, ADR-064). GitHub Pages hospedou o front no passado; hoje o front sai pelo Render (a confirmar se o Pages ainda está publicado).

ADR-060 §8 aceita região fora do Brasil **só até o primeiro usuário real** e prevê migrar para hospedagem no Brasil no go-live. Decisão pendente: migrar ou manter com mecanismo do art. 33 (P6).

## 4. Lacunas que exigem decisão jurídica

1. **Controlador e encarregado (DPO):** sem nome/razão social, contato nem encarregado nos textos (`[JURÍDICO]` na Política §1 e Termos §1, §7). Papel da igreja (controladora? co-controladora?) indefinido.
2. **Bases legais:** nenhuma definida (Política §3). Sugestões na tabela do §1 são técnicas, não jurídicas.
3. **Retenção:** log de atividade 90 dias (implementado); `admin_events` e convites sem prazo; logs do Render sem prazo conhecido; backups 30 dias (proposto, manual); prova de consentimento apagada junto com a conta.
4. **Menores:** mínimo 16 anos por autodeclaração (0016). Confirmar se 16 é o corte adequado frente à LGPD art. 14, ao ECA Digital e à orientação da ANPD, se a autodeclaração basta e qual o procedimento com o responsável legal (Política §7 é provisória). Equipes de louvor costumam ter adolescentes (a confirmar com o produto).
5. **Dado sensível (art. 11):** o sistema não pergunta religião, mas o vínculo com um ministério de igreja permite inferir convicção religiosa. Precisa de base do art. 11 (consentimento específico? art. 11, II?) ou do entendimento de que não é tratamento de dado sensível.
6. **Direitos do titular e canal:** exportar e excluir estão no app; faltam canal (e-mail?) e prazo de resposta para acesso, correção, informação sobre compartilhamento, revogação, oposição e portabilidade.
7. **Registro de UUIDs excluídos por 30 dias:** para não "ressuscitar" contas ao restaurar um backup, propõe-se guardar fora do banco só o UUID de contas excluídas, pelo prazo de retenção dos dumps (BACKUP_RECOVERY §6). Recomendação técnica: sim. Precisa de base legal e menção na Política.
8. **Prova de consentimento após exclusão:** hoje apagada. Manter (e por quanto tempo) para defesa em processo?
9. **Direitos autorais:** usuários cadastram letras e cifras de terceiros (Termos §3 só tem "você declara ter o direito"). Falta: responsabilidade do usuário, notificação e retirada, licenças (ex.: CCLI, ECAD; a confirmar aplicabilidade). Upload de áudio/arquivos está **adiado** (ADR-064, ideia de áudio adiada pelo owner): não precisa de texto agora, mas o desenho dos Termos deve comportá-lo.
10. **Incidente/vazamento:** sem procedimento de comunicação à ANPD e aos titulares (art. 48).
11. **Transferência internacional:** ver §3.
12. **Termos gerais:** limitação de responsabilidade, SLA (serviço gratuito que "dorme", ADR-060), suspensão, foro, lei aplicável.
13. **Divergências a corrigir no `DATA_MAP.md`** (técnicas, não jurídicas): IP nos logs do servidor; dados de escala enviados ao Brevo.

## 5. Perguntas para o advogado

1. Quem é o controlador: o operador do CANTUM, cada igreja/organização, ou ambos (co-controladoria)? O CANTUM é operador em relação aos dados que a igreja insere?
2. Pessoa física pode figurar como controlador, ou recomenda-se constituir PJ antes do go-live?
3. É obrigatório nomear encarregado nesse porte (Resolução CD/ANPD nº 2/2022 sobre agentes de pequeno porte; a confirmar aplicabilidade)? Qual contato publicar?
4. Qual a base legal para cada finalidade da tabela do §1?
5. O vínculo a um ministério de louvor configura tratamento de dado sensível (art. 11)? Se sim, qual base, e precisamos de consentimento específico e destacado no cadastro?
6. Manter Render/Neon/Brevo fora do Brasil é viável com que mecanismo do art. 33 (cláusulas-padrão, termos dos provedores)? Ou a migração para o Brasil é necessária?
7. A idade mínima de 16 anos e a autodeclaração são suficientes? Como tratar membros de 12 a 15 anos que as igrejas queiram escalar (o líder não pode cadastrá-los hoje)?
8. Devemos guardar a prova de consentimento após a exclusão da conta? Por quanto tempo e com quais dados?
9. Prazos de retenção aceitáveis: logs do servidor, `admin_events`, log de atividade (90 dias), convites pendentes, backups (30 dias)?
10. O registro de UUIDs de contas excluídas por 30 dias (§4.7) é permitido e deve constar na Política?
11. O registro de execução (quem tocou em cada culto) pode permanecer com a organização após a exclusão, já anonimizado? A anonimização implementada (UUID trocado por nulo/sentinela) é suficiente nos termos do art. 12?
12. O que os Termos precisam dizer sobre letras e cifras de terceiros (responsabilidade, notificação e retirada, licenças)? E o que preparar para upload de áudio, se vier?
13. Qual canal e prazo de resposta para os direitos do art. 18? A exportação em JSON atende a portabilidade?
14. Qual o procedimento mínimo de incidente (prazo, conteúdo da comunicação à ANPD e aos titulares)?
15. A reautenticação + exclusão imediata e irreversível é adequada, ou deve haver período de arrependimento?
16. Quais cláusulas de limitação de responsabilidade, disponibilidade e foro são cabíveis num serviço gratuito?

## 6. Onde está o texto vigente e o que muda quando o texto final chegar

- Textos públicos (rascunho): `docs/privacy/privacy-policy.md` e `docs/privacy/terms.md`, importados pelo cliente em `src/pages/Legal/LegalPage.tsx`. Enquanto a linha `> RASCUNHO` existir no topo, a página mostra o aviso de rascunho.
- Versão do aceite hoje: `2026-10-17` (rascunho). Ao receber o texto final, **um único PR** (sem editar migrations aplicadas):
  1. substituir os dois `.md` pelo texto final e remover a linha `> RASCUNHO`;
  2. nova migration `db/migrations/NNNN_consent_version.sql` com `create or replace function app.current_consent_version()` devolvendo a nova versão (padrão da 0015);
  3. atualizar `CONSENT_VERSION` em `src/domain/privacy/consent.ts` e testes;
  4. atualizar `docs/privacy/README.md`, `DATA_MAP.md` (incluindo as divergências do §4.13) e `BACKUP_RECOVERY.md` com os prazos decididos;
  5. se o advogado alterar idade mínima: `src/domain/privacy/age.ts` e `app.minimum_account_age()` (nova migration);
  6. se mudar retenção do log de atividade (90 dias) ou criar purga de `admin_events`/convites/sessões: nova migration.
- Efeito: todo usuário existente precisa aceitar de novo no próximo login (`app.consent_pending`).
- Pré-requisitos de go-live que não dependem do texto: decisão de região (§3), registro de UUIDs excluídos (§4.7), procedimento de incidente (§4.10).
