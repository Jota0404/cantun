# CANTUM — Briefing de hospedagem e lançamento (para quem vai ajudar o Jota)

> Escrito em 2026-10-24 a partir do repositório (`main` @ `5e47ece`) e de pesquisa web feita no mesmo dia.
> **Este documento não decide nada.** O que o Jota prefere aparece como "preferência"; o que foi pesquisado aparece como "hipótese a validar". A escolha da hospedagem será dele, com a sua ajuda.
> Marcações: **[a confirmar]** = não consegui verificar; **[não confirmado]** = não achei em fonte oficial.

## Glossário rápido

| Termo | Em uma frase |
|---|---|
| PWA | Site que se instala no celular como app e abre mesmo sem internet. |
| Offline/local-first | O app grava primeiro no aparelho e envia ao servidor quando há rede. |
| WebSocket | Conexão que fica aberta para o servidor avisar o celular na hora (usado no Modo Palco). |
| Migration | Script numerado que cria/altera as tabelas do banco, sempre na mesma ordem. |
| RLS | Regra dentro do PostgreSQL que decide quem vê cada linha; a segurança mora no banco. |
| PITR | Backup que permite voltar o banco a um minuto específico do passado. |
| RPO / RTO | Quanto dado se aceita perder (24 h) / em quanto tempo se volta ao ar (4 h). |
| LGPD | Lei brasileira de proteção de dados pessoais. |

---

## 1. A ideia do app

O **CANTUM** é uma ferramenta para **equipes de louvor de igrejas**, pensada para igrejas pequenas e médias, em que um líder acumula o trabalho de organizar tudo (Blueprint §1, §4).

Hoje esse líder usa planilha para a escala, WhatsApp para confirmar, Drive para material e PDF para cifra. O CANTUM junta isso num fluxo só:

```text
organizar a equipe → planejar o culto → escalar → preparar → ensaiar → tocar → registrar
```

- **Para quem:** líder do ministério, líderes de banda, músicos e quem opera o telão/palco.
- **O que faz:** organiza pessoas e funções musicais, monta cultos ("serviços") e escalas, prepara o repertório e o ensaio, e mostra a cifra durante o culto no **Modo Palco** (tela escura, a banda inteira segue quem conduz, em tempo real).
- **O que NÃO é** (Blueprint §3.2 e §24; regra do projeto): não é chat nem rede social, não tem feed, não é calendário genérico, não faz onboarding de voluntários nem devocionais, não tem IA dentro do produto, não cobra nem paga ninguém, não é sistema de recrutamento e não é sistema de gestão da igreja (membros, finanças, doações).

Isso importa para a hospedagem: o volume é pequeno (texto, sem upload de arquivos, sem vídeo) e o pico acontece em horários de culto.

## 2. O que já faz hoje

O código do MVP está completo (detalhe: `docs/STATUS_DO_PROJETO.md`, `docs/blocks/00-INDICE.md`).

| Bloco | Em linguagem simples |
|---|---|
| B0 Fundação | Testes automáticos e revisão a cada mudança (interno). |
| B1 Servidor próprio | Servidor e banco próprios, sem depender de plataformas fechadas (interno). |
| B2 Equipe | Criar o ministério e as bandas, convidar por e-mail ou link, papéis (Dono, Admin, Líder, Membro) e funções musicais. |
| B3 Serviço | Criar o culto com data e local, montar a ordem (músicas, oração, avisos) e acompanhar o estado (rascunho → pronto → em andamento → concluído/cancelado). |
| B4 Escala | Abrir vagas por função, convidar (chega e-mail), confirmar/recusar, pedir substituição, informar indisponibilidade, "Meus serviços". |
| B5 Navegação | Menu principal, tema escuro, tela inicial com próximo culto e pendências, acessível a teclado e toque. |
| B6 Música e ensaio | Repertório aplicado ao culto, tom por culto, reprise/medley, tela do músico, "preparado", ensaio e links (YouTube, Drive). Upload de arquivo ficou para depois, por decisão do Jota. |
| B7 Execução e histórico | Registro do que foi tocado, em que tom e por quem; atividade recente só leitura; culto concluído não se apaga. |
| B8 Privacidade | Aceite de Política e Termos, idade mínima 16 anos, exportar meus dados, excluir conta (pede a senha de novo), remover membro, roteiro de backup. Textos legais ainda são rascunho. |
| Modo Palco | Cifra em tela cheia com a banda seguindo o condutor em tempo real, tolerante a internet ruim. |

**Offline:** é uma PWA. Biblioteca, repertórios, cultos e o Palco funcionam sem rede com os dados já baixados no aparelho; as alterações ficam numa fila e sobem quando a internet volta. O que precisa de rede: login, convites, e-mails e a sincronização em tempo real do Palco entre aparelhos.

## 3. O que ainda precisa ser resolvido (código e qualidade)

Fonte: issues abertas no GitHub (consultadas em 2026-10-24) e `.claude/handoffs/00-LEIA-ME-PRIMEIRO.md`.

**Bugs / limites conhecidos (nenhum bloqueia o lançamento, segundo o status do projeto):**
- #127: dois casos raros de sincronização ainda geram "alteração não enviada" que o usuário precisa descartar.
- Sem issue: purga do log de atividade só roda quando a organização tem evento novo; uma corrida rara entre concluir o culto e abrir o Palco; chamadas online que estouram o tempo podem já ter sido aplicadas; dados de uma organização perdida ficam no aparelho até descartar o item preso; três ajustes pequenos de UX na reautenticação.

**Melhorias internas (sem efeito para o usuário):** #132 item 6 e #42 (organização de código).

**Decisões do Jota:**
- Palco do culto sem rolagem automática e troca rápida de tom (existem só no Palco avulso). O Palco está congelado para recursos novos.
- #22 (Modo Passagem no Palco) e #54 (Network, encontrar músicos de fora): futuro.

**O que ainda não foi testado (seja cético aqui):**
- Nada rodou em **servidor de produção**; só no ambiente de teste gratuito (Render + Neon, EUA).
- Não há registro de teste em **celular real** com várias pessoas no mesmo culto em produção. Está previsto um QA ponta a ponta depois de subir.
- **Restore de backup com dados reais nunca foi feito** (a tabela de registro em `docs/BACKUP_RECOVERY.md` §7 está vazia; só houve teste com banco descartável em 2026-10-18).
- Não há **monitoramento automático** no código; existe só o endereço `/health`.

---

## 4. Hospedagem (a parte em que o Jota precisa de você)

### 4.1 Como o app é montado hoje

| Peça | Em uma frase |
|---|---|
| Front (PWA) | Arquivos estáticos (HTML/JS/CSS) gerados pelo Vite; o próprio servidor os entrega. |
| Servidor Node.js | **Um processo só** que entrega o front e responde à API (`/auth`, `/rpc`, `/sync`) e ao WebSocket (`/realtime`), tudo no mesmo endereço. |
| PostgreSQL 16 | Guarda tudo; as regras de permissão estão no banco (RLS). As 27 migrations rodam sozinhas quando o servidor sobe. |
| Brevo | Serviço que envia os e-mails (confirmação de conta, troca de senha, convite de escala). |
| Ambiente de teste | Render (servidor, plano gratuito, Virginia/EUA) + Neon (banco, plano gratuito, EUA). Só dados de teste. |

Não há Dockerfile hoje: o deploy no Render usa `render.yaml` (instala, gera o front, roda migrations, sobe o servidor). Para outro provedor, um Dockerfile está previsto, mas não foi escrito (`docs/HOSTING_OPTIONS_BR.md` §4).

### 4.2 Requisitos reais

| # | Requisito | De onde vem |
|---|---|---|
| R1 | Dados no Brasil antes do primeiro usuário real (LGPD). Hoje, EUA só com dados de teste. | ADR-060 §8 e "Gatilho"; `docs/OPERATIONS.md` §10 |
| R2 | Front e API no **mesmo site** (cookie de sessão `SameSite=Lax`). | ADR-059 §5; ADR-060 §1 |
| R3 | WebSocket de longa duração (o celular manda ping a cada 25 s). | `docs/REALTIME_CONTRACT.md` §1; ADR-060 §5 |
| R4 | **Uma instância só** do servidor: presença e assinaturas ficam em memória; mais de uma exige mudar o código. | ADR-059 §6; `REALTIME_CONTRACT.md` §6.2 |
| R5 | PostgreSQL 16 com **conexão direta** (sem pooler em modo transação), porque o tempo real usa `LISTEN/NOTIFY`. | ADR-060 §2; `docs/OPERATIONS.md` §2 |
| R6 | Migrations próprias, sem recurso exclusivo de provedor; o banco precisa permitir criar os papéis `cantum_anon`/`cantum_user` (a migration 0001 os cria). | ADR-049; ADR-059 §2; `db/migrations/0001_baseline.sql` |
| R7 | Backup com **restore testado**; RPO 24 h, RTO 4 h; ideal PITR gerenciado. | NFR-009; `docs/BACKUP_RECOVERY.md` §1 |
| R8 | Deploy simples, operável por uma pessoa (o Jota), idealmente "push no GitHub e sobe". | ADR-060 §9; `docs/HOSTING_OPTIONS_BR.md` R7 |
| R9 | Custo baixo no início: 5–20 igrejas (dezenas a poucas centenas de usuários, banco menor que 1 GB). | `docs/HOSTING_OPTIONS_BR.md` R7; `docs/STATUS_DO_PROJETO.md` |
| R10 | Sem amarração a provedor: trocar de host muda configuração, não código. | ADR-049; ADR-060 §10 |
| R11 | Node.js 24 ou mais novo no servidor. | `server/package.json` (`engines`) |
| R12 | Segredos digitados só pelo Jota no painel do provedor; produção e banco são exclusivos dele. | ADR-050; ADR-058 |

### 4.3 O que o Jota gostaria de fazer (preferências, não decisões)

- **Prefere AWS em São Paulo**, por confiança na marca e na maturidade, mas **não sabe como montar** (rede, permissões, servidor, banco).
- Quer **decidir perto do lançamento**, não agora.
- Quer **começar barato** e só pagar mais quando houver igrejas usando.
- Quer **sua ajuda para escolher** e, se possível, para montar.
- **Hipótese pesquisada:** a opção mais barata encontrada com dados no Brasil é **Fly.io (São Paulo) + Neon (São Paulo)**. Ela existe como alternativa, não como escolha.
- O e-mail continua no Brevo em qualquer cenário (trocar para Amazon SES exigiria mudar código e não é necessário).

### 4.4 Comparativo neutro

Base: `docs/HOSTING_OPTIONS_BR.md` (pesquisa de 2026-10-22), reconferida em **2026-10-24**. Preços em US$/mês, sem impostos brasileiros (IOF etc.). Onde a fonte é um agregador e não o site oficial, está indicado.

| Opção | Região BR | Banco e backup | Esforço para 1 pessoa | Custo aprox. (5–20 igrejas) | Riscos / observações |
|---|---|---|---|---|---|
| **Render + Neon** (teste atual) | Render: **não** (só EUA, Frankfurt, Singapura). Neon: sim | Neon: histórico de 6 h (Free) ou até 7 dias (Launch) | Baixo | US$ 0 hoje (só teste) | Não atende R1: o servidor processa dados nos EUA. Plano gratuito dorme após 15 min. |
| **Fly.io `gru` + Neon `aws-sa-east-1`** (hipótese mais barata) | Sim | Neon Launch: histórico/restore até 7 dias | Médio para montar, baixo para operar | Doc-fonte: ~US$ 10–20. **Recalculado hoje: ~US$ 25–30** (ver nota 1) | Preço da máquina em São Paulo não publicado; dois fornecedores americanos. |
| **Fly.io `gru` + Fly Managed Postgres** | Sim (MPG lista São Paulo) | Basic US$ 38 (1 GB RAM) + US$ 0,28/GB; backups inclusos, **retenção/PITR não informados** | Médio / baixo | ~US$ 40–45 | Um fornecedor só. Precisa usar o host de conexão direta para o `LISTEN`. |
| **AWS São Paulo: EC2 + RDS** (preferência do Jota) | Sim | RDS PostgreSQL 16 com backup automático e PITR até 35 dias (doc-fonte; não reconferido hoje) | Alto para montar (rede, permissões, TLS), médio para operar | **~US$ 50–60 sem load balancer; ~US$ 70–80 com** (ver nota 2) | Mais caro; exige alguém que conheça AWS no início. Maior maturidade de certificações. |
| **AWS Lightsail São Paulo** | **Sim** (listado na doc oficial da AWS em 2026-10-24; o doc-fonte `HOSTING_OPTIONS_BR.md` ainda dizia que não) | Banco gerenciado US$ 15 (1 GB) / US$ 30 (HA); backup/PITR e versão 16 em SP **[não confirmado]** | Baixo / baixo | ~US$ 22–30 (instância US$ 7–12 + banco US$ 15), preço regional de SP **[não confirmado]** | "AWS simplificada": pode atender a preferência pela AWS com menos esforço. Merece verificação. |
| **Google Cloud** (Cloud Run + Cloud SQL, São Paulo) | Sim | Cloud SQL com PITR | Médio / médio | ~US$ 25–40 (doc-fonte, agregador) | WebSocket do Cloud Run tem teto de 60 min por conexão (confirmado) e exige limitar a 1 instância. |
| **Azure Brazil South** | Sim | PG Flexible, backup 7–35 dias com PITR | Médio / médio | ~US$ 45–70 (doc-fonte; App Service BR **[não confirmado]**) | Sem vantagem clara para o perfil. |
| **Oracle Cloud** (SP / Vinhedo) | Sim | Always Free = VM + Postgres instalado por você; Postgres gerenciado em SP **[não confirmado]** | Médio / alto | US$ 0 | Já descartada uma vez: o cadastro recusou o cartão do Jota (ADR-060). |
| **Magalu Cloud** | Sim (empresa brasileira) | PostgreSQL gerenciado existe; preço, retenção e PITR **[não confirmado]** | Médio / médio | **[não confirmado]** | Melhor narrativa de soberania; documentação não encontrada hoje. |
| **VPS nacional + Postgres próprio** | Sim | Backup por sua conta | Alto / alto | ~R$ 40–60 (2 GB) **[não confirmado]** | Barato, mas backup/PITR viram trabalho manual do Jota. |
| Supabase / Railway | Supabase tem SP; Railway não | — | — | — | Supabase contraria a decisão de sair dele (ADR-059); Railway sem Brasil. |

**Nota 1 — Fly + Neon.** Máquina de 512 MB custa US$ 3,69 na região mais barata (iad); a Fly avisa que o preço varia por região e não publica o de São Paulo. O Neon Launch cobra US$ 0,106 por CU-hora e US$ 0,35/GB-mês. O servidor faz um `select 1` a cada 30 s na conexão do tempo real (`server/src/realtime.ts`), então o banco provavelmente **nunca "dorme"**: com o menor tamanho (0,25 CU, **[a confirmar]**) ligado 24 h, o compute sai ~US$ 19/mês. Por isso a faixa de US$ 10–20 do doc-fonte parece otimista. **Estimativa minha, a validar.**

**Nota 2 — AWS.** RDS `db.t4g.micro` em SP ~US$ 25 (agregador Bytebase; em Virginia ~US$ 12). EC2 `t4g.small` em SP US$ 0,0268/h ≈ US$ 19,60 (agregador aws-pricing.com; o doc-fonte estimava US$ 10–15). Somam-se armazenamento do RDS e IPv4 público (valores de SP **[não confirmado]**). Load balancer (ALB) é opcional: dá para terminar o HTTPS na própria EC2 (ex.: Caddy); o preço por hora do ALB em SP **[não confirmado]**. Confirmar tudo na calculadora da AWS.

Outros fatos reconferidos hoje:
- Neon: São Paulo suportado; **a região de um projeto não muda depois de criado** (mudar = projeto novo + dump/restore). Free: 100 CU-h e 1 GB por projeto, histórico de 6 h.
- Fly MPG: planos Basic US$ 38, Starter US$ 72; PostgreSQL 16 e 17; São Paulo listado entre as regiões ativas.
- Brevo gratuito: 300 e-mails/dia com a marca Brevo; pago a partir de ~US$ 9/mês (fontes de terceiros).
- LGPD: hospedar em SP não elimina o fornecedor estrangeiro (AWS, Neon, Fly são americanos) nem o Brevo (europeu); isso vai para a revisão jurídica (`docs/privacy/LEGAL_REVIEW_BRIEF.md` §3).

### 4.5 Perguntas abertas para você

1. Dado o perfil do Jota (sozinho, leigo em infra, orçamento curto, preferência pela AWS), **qual opção você recomenda** e por quê? Lightsail em SP resolve a vontade de "estar na AWS" com menos trabalho?
2. Qual a **arquitetura mínima** que você montaria (servidor, banco, HTTPS, rede) e o **custo mensal** real, com impostos?
3. Precisamos de load balancer ou o HTTPS pode ficar na própria máquina? Se houver um, como garantir WebSocket e tempo ocioso maior que 25 s?
4. **Domínio e DNS:** onde registrar (registro.br?) e onde gerenciar o DNS?
5. **E-mail:** como configurar SPF, DKIM (e DMARC) do domínio para o Brevo não cair no spam?
6. **Backups:** qual retenção do backup automático, se o PITR do provedor basta ou se mantemos o dump diário manual, e como **testar o restore** antes do primeiro usuário?
7. **Monitoramento:** qual o mínimo (alerta quando `/health` cai, logs com retenção) e com que ferramenta?
8. **Segurança e acesso:** quem tem acesso ao painel e ao banco, 2FA, banco sem IP público, como guardar os segredos (Secrets Manager/Parameter Store ou equivalente)?
9. **Migração do ambiente de teste:** banco novo do zero (as migrations criam tudo) ou dump/restore dos dados de teste? E o redirecionamento do endereço antigo (GitHub Pages aponta hoje para `cantum.onrender.com`)?
10. **Deploy:** como fica o "push e sobe" (GitHub Actions, CLI do provedor)? Você escreveria o Dockerfile ou prefere que o Jota peça à IA do projeto?
11. **Quem opera no dia a dia** (atualizações, alertas, incidentes)? O Jota consegue sozinho com um roteiro?
12. **O que você precisa do Jota** (contas, cartão, acessos, decisões)?
13. **Prazo e esforço** estimados para deixar a produção pronta.
14. O papel de login do banco gerenciado consegue criar os papéis `cantum_anon`/`cantum_user` (a migration 0001 faz isso)? Em RDS/Lightsail isso exige permissão de criar roles.

### 4.6 Lançamento em alto nível

Resumo do `docs/GO_LIVE_CHECKLIST.md` (escrito para o ambiente atual; em outro provedor a lógica é a mesma e os passos de painel mudam):

1. **Escolher a hospedagem** e registrar a decisão num ADR novo (substitui o ADR-060).
2. **Domínio** próprio e e-mail Brevo com remetente do domínio (SPF/DKIM).
3. **Banco de produção** em SP com backup automático ligado.
4. Se for migrar dados de teste: **dump → restore testado em banco local → só então seguir**. Banco novo vazio: as migrations criam tudo do zero.
5. **Subir migrations e servidor juntos**, na mesma subida: o servidor roda as migrations e só depois aceita acessos. A **migration 0019 tem de estar aplicada antes do servidor novo** (ele lê um campo que ela cria); a 0016 muda o cadastro, então servidor antigo com banco novo também quebra.
6. **Verificar:** `/health`, cadastro com aceite e idade, e-mail chegando, login, exportar dados, criar música/repertório/culto, Modo Palco com dois aparelhos, excluir conta pedindo senha.
7. **Alerta de queda** no `/health`.
8. **Antes do primeiro usuário real:** o **texto jurídico ainda é rascunho** (Política, Termos, menores, retenção, controlador); depois da revisão do advogado, um PR troca o texto e pede novo aceite. Também: contato de privacidade, rotina de backup diário e um restore registrado.

---

## 5. Anexo técnico

**Repositório:** GitHub `Jota0404/cantun`. Branch principal `main`. Para rodar localmente:

```bash
npm ci && npm run dev                     # front (Vite)
createdb cantum && scripts/db/migrate.sh cantum
cd server && cp .env.example .env && npm ci && npm run dev   # API em http://127.0.0.1:8787
```
Detalhes: `server/README.md`. Gate de qualidade: `npm test && npm run lint && npm run build`; servidor: `cd server && npm run typecheck && npm test` (precisa de PostgreSQL).

**Variáveis de ambiente (só nomes):**
- Servidor: `DATABASE_URL`, `APP_ORIGIN`, `PORT`, `HOST`, `NODE_ENV`, `TRUST_PROXY`, `BREVO_API_KEY`, `MAIL_FROM`. Em produção, sem `BREVO_API_KEY` e `MAIL_FROM` o servidor não sobe. `TRUST_PROXY` = número de proxies na frente (conferir no primeiro deploy, `docs/OPERATIONS.md` §5).
- Build do front: `VITE_API_URL` (entra no build). `PREVIEW_HTTPS_KEY`/`PREVIEW_HTTPS_CERT` são só para teste local.
- Testes do servidor: `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`.

**Componentes:**

```text
 Celular / tablet / PC (PWA + dados locais IndexedDB)
            │  HTTPS (mesma origem)        WebSocket /realtime
            ▼                                   │
   ┌────────────────────────────────────────────┴───┐
   │ Servidor Node.js 24 (um processo)              │
   │  /  (front estático)  /auth  /rpc  /sync       │
   │  /realtime (WS)       /health                  │──► Brevo (API de e-mail)
   └───────────────┬────────────────────────────────┘
                   │ conexão DIRETA (pool + LISTEN/NOTIFY)
                   ▼
          PostgreSQL 16 (RLS, migrations 0001–0027)
```

**Saúde:** `GET /health` → `{"ok":true}` (faz `select 1` no banco; serve para health check e alerta).

**Portas:** servidor escuta `PORT` (padrão 8787) em `HOST` (padrão `127.0.0.1`; em produção `0.0.0.0`). O Vite de desenvolvimento usa a porta própria dele.

**Migrations (`db/migrations/`, 27 arquivos, conferido no disco):** 0001_baseline, 0002_auth, 0003_stage_realtime, 0004_team_roles, 0005_service_ops, 0006_scheduling, 0007_song_copies, 0008_sync_reliability, 0009_personal_repertoire, 0010_stage_current_key, 0011_member_remove, 0012_export_my_data, 0013_delete_account, 0014_org_membership_writes, 0015_user_consents, 0016_minimum_age, 0017_service_item_key, 0018_service_item_reprise, 0019_session_reauth, 0020_service_preparations, 0021_rehearsals, 0022_materials_links, 0023_execution_history, 0024_activity_events, 0025_stage_open_unique, 0026_stage_key_reset, 0027_block_completed_service_delete. Aplicadas por `server/src/migrate.ts` (na subida) ou `scripts/db/migrate.sh`; controle em `app.schema_migrations`.

**Backup e restore:** `scripts/ops/dump.sh` (pg_dump formato custom, arquivo com permissão 600) e `scripts/ops/restore-test.sh` (restaura só em banco local novo e confere). Roteiro: `docs/BACKUP_RECOVERY.md`.

**CI (GitHub Actions):** `cantum-ci.yml` (front), `server.yml` (servidor com PostgreSQL), `db-portability.yml` (migrations em PostgreSQL puro), `deploy-pages.yml` (só redireciona o endereço antigo do GitHub Pages).

**Para aprofundar:**
- `docs/HOSTING_OPTIONS_BR.md`: comparativo e plano de migração.
- `docs/GO_LIVE_CHECKLIST.md`, `docs/OPERATIONS.md`, `docs/BACKUP_RECOVERY.md`: roteiros de operação.
- `docs/REALTIME_CONTRACT.md` §6: como o tempo real funciona no servidor.
- `docs/CANTUM_ARCHITECTURE.md`; ADR-049, ADR-059, ADR-060 em `docs/adr/`.
- `docs/privacy/LEGAL_REVIEW_BRIEF.md` e `docs/privacy/DATA_MAP.md`: dados pessoais e fornecedores.
- `render.yaml`: o deploy atual, bom ponto de partida para outro provedor.

## Fontes web (consultadas em 2026-10-24)

- Render, regiões: https://render.com/docs/regions
- Neon, preços: https://neon.com/pricing · regiões: https://neon.com/docs/introduction/regions
- Fly.io, preços: https://docs.fly.io/about/pricing · Managed Postgres: https://docs.fly.io/mpg · https://fly.io/mpg · preço por região (fórum): https://community.fly.io/t/region-specific-machines-pricing/20690
- AWS Lightsail, regiões: https://docs.aws.amazon.com/lightsail/latest/userguide/understanding-regions-and-availability-zones-in-amazon-lightsail.html · preços: https://aws.amazon.com/lightsail/pricing/
- AWS RDS `db.t4g.micro` (agregador): https://www.bytebase.com/dbcost/rds/instance/db.t4g.micro/ · página oficial: https://aws.amazon.com/rds/postgresql/pricing
- AWS EC2 `t4g.small` (agregador): https://aws-pricing.com/t4g.small.html
- Google Cloud Run e WebSocket: https://docs.cloud.google.com/run/docs/triggering/websockets
- Brevo plano gratuito (terceiros): https://www.sender.net/reviews/brevo/pricing/free-plan · https://dreamlit.ai/blog/brevo-review
- Demais preços (Azure, Google Cloud SQL, Oracle, Magalu, VPS): fontes listadas em `docs/HOSTING_OPTIONS_BR.md`, não reconferidas hoje.
