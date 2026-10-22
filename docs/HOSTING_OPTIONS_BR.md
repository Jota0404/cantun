# CANTUM — Opções de hospedagem de produção no Brasil

> Insumo para a decisão do owner que substitui o ADR-060 (Render + Neon Free, "fora do Brasil só até o primeiro usuário real"). Não é ADR.
> Base: ADR-049, ADR-059 §5–6, ADR-060, `docs/REALTIME_CONTRACT.md` §6, `docs/BACKUP_RECOVERY.md`, `docs/GO_LIVE_CHECKLIST.md`, `render.yaml`.
> Pesquisa web em **2026-10-22**. Preços em US$, sem impostos (no Brasil somam IOF/ISS/PIS-Cofins conforme o caso). `[NÃO CONFIRMADO]` = não achei em fonte oficial; confira no painel antes de contratar. `[JURÍDICO]` = depende de parecer.

## 1. Requisitos reais (do repositório)

| # | Requisito | Origem |
|---|---|---|
| R1 | Um processo Node 24 que serve `dist/` + `/auth`, `/rpc`, `/sync`, `/realtime` **na mesma origem** (cookie `SameSite=Lax`) | ADR-059 §5, ADR-060 item 1 |
| R2 | WebSocket longo (ping a cada 25 s) e **uma instância só**: presença e assinaturas ficam em memória; escala horizontal exige mudar o Realtime | REALTIME_CONTRACT §6.2, ADR-059 §6 |
| R3 | PostgreSQL 16 com **conexão direta** (sem pooler em modo transação): o Realtime usa `LISTEN/NOTIFY` | ADR-060 item 2 |
| R4 | Migrations próprias aplicadas na subida (`node src/migrate.ts`), roles `cantum_user`, RLS; nada específico de provedor | ADR-049, ADR-059 |
| R5 | Backup com restore testado (`pg_dump` + `scripts/ops/restore-test.sh`) e, idealmente, PITR gerenciado; RTO alvo 4 h | NFR-009, BACKUP_RECOVERY |
| R6 | Dados no Brasil antes do primeiro usuário real; operadores listados no DATA_MAP | ADR-060 item 8, B8 |
| R7 | Operável por um dev solo, deploy por `git push`, custo baixo com 5–20 igrejas (dezenas a poucas centenas de usuários, banco < 1 GB) | ADR-060 |

## 2. Comparativo

Legenda de esforço (migração / operação): B = baixo, M = médio, A = alto.

| Opção | Região BR | Postgres gerenciado e PITR | WebSocket, processo único | Esforço | Custo/mês (5–20 igrejas) | LGPD / transferência | Lock-in |
|---|---|---|---|---|---|---|---|
| **Render + Neon (atual)** | **Render: não** (Oregon, Ohio, Virginia, Frankfurt, Singapura). Neon: **sim**, `aws-sa-east-1` | Neon: histórico 6 h (Free), até 7 dias (Launch), até 30 dias (Scale) | Sim; Free dorme após 15 min | B / B | Free hoje; pago: Render Starter + Neon Launch, ~US$ 10–20 `[NÃO CONFIRMADO: preço Render]` | App processa dados nos EUA mesmo com banco em SP → transferência internacional permanente | Baixo (`render.yaml` só) |
| **Fly.io (gru) + Neon (sa-east-1)** | **Sim** (app `gru`, banco SP) | Neon Launch: até 7 dias de histórico, pago por uso | Sim; 1 Machine sempre ligada (`min_machines_running = 1`, sem autoescala) | M / B | Machine 512 MB ~US$ 3,69 (preço de `iad`; `gru` é mais caro `[NÃO CONFIRMADO]`) + Neon Launch ~US$ 5–15 → **~US$ 10–20** | Dados em SP; provedores americanos (DPA padrão) | Baixo (Dockerfile + `fly.toml`) |
| **Fly.io (gru) + Fly Managed Postgres (gru)** | Sim | MPG Basic US$ 38 (shared-2x, 1 GB, HA, backups, pooling) + US$ 0,28/GB; retenção/PITR `[NÃO CONFIRMADO]` | Sim; `LISTEN` exige o host `direct.` (PgBouncer em modo transação não suporta) | M / B | **~US$ 45** | Igual à linha anterior, um fornecedor só | Baixo |
| **AWS São Paulo** (EC2 ou ECS + RDS) | Sim, `sa-east-1` | RDS PostgreSQL 16, backups automáticos com PITR até 35 dias | Sim (EC2 com systemd/Docker; App Runner `[NÃO CONFIRMADO em sa-east-1]`) | A / M | RDS `db.t4g.micro` ~US$ 25 (agregador) + storage + EC2 pequena ~US$ 10–15 → **~US$ 45–60** | Dados em SP; DPA AWS; maior maturidade de certificações | Baixo no código; médio na operação (IAM, VPC) |
| **AWS Lightsail** | **Não confirmado**: a doc oficial não lista São Paulo | DB gerenciado US$ 15/30 (std/HA), snapshots | Sim | B / B | ~US$ 22–30 se existir em SP | — | Baixo |
| **Google Cloud** (Cloud Run + Cloud SQL, `southamerica-east1`) | Sim | Cloud SQL com PITR; `db-f1-micro` em SP ~US$ 12 de compute (agregador) + storage | Cloud Run aceita WebSocket, mas a requisição tem teto de tempo (60 min, `[NÃO CONFIRMADO nesta consulta]`) e precisa `max-instances=1` | M / M | **~US$ 25–40** | Dados em SP | Médio (Cloud Run, conector Cloud SQL) |
| **Azure Brazil South** (App Service + PG Flexible) | Sim | Flexible Server B1ms ~US$ 26 de compute (agregador), backup 7–35 dias com PITR | App Service com WebSocket ligado e 1 instância | M / M | **~US$ 45–70** `[NÃO CONFIRMADO: App Service B1 em BR]` | Dados em SP | Médio |
| **Oracle Cloud** (São Paulo / Vinhedo) | Sim | OCI PostgreSQL nos dois `[NÃO CONFIRMADO]`; Always Free = VM + Postgres próprio | Sim (VM) | M / A | US$ 0 (Always Free) | Dados em SP | Baixo |
| **Magalu Cloud** | Sim (empresa e dados no Brasil) | DBaaS PostgreSQL existe (ITForum); retenção, PITR e preços `[NÃO CONFIRMADO]` | Sim (VM/Kubernetes) | M / M | `[NÃO CONFIRMADO]` | Melhor narrativa de soberania: fornecedor brasileiro | Baixo |
| **Supabase** (só como Postgres, `sa-east-1`) | Sim | Pro US$ 25; backup diário 7 dias; PITR +US$ 100/mês | Banco só; app ficaria em outro host | B / B | US$ 25 (+100 com PITR) + app | Dados em SP | Contradiz o ADR-059 (saída do Supabase); não recomendado |
| **Railway** | **Não** (Califórnia, Virgínia, Amsterdã, Singapura) | — | — | — | — | Transferência | — |
| **VPS nacional + Postgres próprio** (Locaweb, Vultr SP, Magalu VM) | Sim | **Não gerenciado**: backup/PITR por conta própria (pg_dump agendado + WAL-G/pgBackRest em armazenamento externo) | Sim (systemd/Docker + Caddy) | A / A | Locaweb a partir de ~R$ 16 (512 MB, `[NÃO CONFIRMADO 2026]`); 2 GB útil ~R$ 40–60 | Dados no Brasil | Mínimo |

Observações:
- **Neon e regiões:** a região do projeto não muda depois de criada; ir para SP = projeto novo + `pg_dump`/`pg_restore`. Scale-to-zero após 5 min derruba o `LISTEN`; o servidor já reconecta e faz resync (REALTIME_CONTRACT §6.2). No Launch dá para desligar o scale-to-zero (custa compute 24 h).
- **Vultr Managed Database** tem SP, mas o menor plano é ~US$ 90/mês (agregador, mai/2026): fora do orçamento.
- **Brevo** continua em qualquer cenário: e-mail e nome vão para a UE (empresa francesa; localização exata dos dados `[NÃO CONFIRMADO]`). É transferência internacional, mas para destino com regime de proteção comparável; precisa constar no DATA_MAP e na Política `[JURÍDICO]`.
- **LGPD (art. 33):** hospedar em SP não elimina o operador estrangeiro (AWS, Neon, Fly são americanos), mas tira a transferência do caminho normal dos dados. Usar cláusulas-padrão da ANPD (Resolução CD/ANPD nº 19/2024) com quem transfere `[JURÍDICO]`.

## 3. Recomendação por cenário

| Cenário | Escolha | Por quê |
|---|---|---|
| **Começar barato** (recomendado agora) | **Fly.io `gru` + Neon Launch `aws-sa-east-1`** | ~US$ 10–20; mantém Neon (mesmo roteiro de dump/restore, mesmas strings diretas); app e banco em SP; 1 Machine sempre ligada sem partida a frio; deploy por `fly deploy` ou GitHub Action. |
| **Compliance forte** | **AWS `sa-east-1`: RDS PostgreSQL 16 + EC2 (ou ECS Fargate) com 1 tarefa** | PITR de até 35 dias, Multi-AZ opcional, DPA e certificações consolidadas, tudo em uma conta e região. Custa ~3× e exige IAM/VPC/segurança de rede: só quando houver contrato ou exigência de cliente. |
| **Menor esforço** | **Fly.io `gru` app + Fly Managed Postgres `gru`** | Um fornecedor, um painel, HA e backups inclusos. ~US$ 45. Ressalva: usar o host `direct.` para o servidor (LISTEN) e para migrations. |

Evitar por ora: Render pago (não resolve a região), Railway (sem BR), Supabase (contra o ADR-059), VPS com Postgres próprio (backup e PITR viram trabalho do dev solo; só se o custo for decisivo). Magalu Cloud é a alternativa nacional a reavaliar quando houver documentação de PITR e preço.

## 4. Plano de migração enxuto (cenário "começar barato")

Pré-condição: só dados de teste ou janela combinada. Quem executa em produção é o Jota (ADR-050/058); a IA só prepara arquivos e roteiro.

**No repositório (1 PR do `backend-engineer`, mais docs do `planner`):**
1. `Dockerfile` (Node 24, `npm ci --include=dev && npm run build && npm ci --prefix server --omit=dev`, `CMD` igual ao `startCommand` atual: `node src/migrate.ts && exec node src/index.ts`). Migration e servidor continuam na mesma subida (GO_LIVE §5).
2. `fly.toml`: `primary_region = "gru"`, `[http_service] internal_port`, `force_https = true`, `auto_stop_machines = "off"`, `min_machines_running = 1`, health check em `/health`, **sem** `[[scale]]` > 1 (R2).
3. Variáveis: as mesmas do `render.yaml`, com dois ajustes:
   - `APP_ORIGIN` e `VITE_API_URL` passam a ser explícitas (não existe `RENDER_EXTERNAL_URL`): `https://<app>.fly.dev` ou o domínio próprio. `VITE_API_URL` entra como build arg.
   - `TRUST_PROXY`: conferir os saltos do proxy da Fly no primeiro deploy (OPERATIONS §5) `[NÃO CONFIRMADO]`.
   - Secretas via `fly secrets set` digitadas pelo Jota: `DATABASE_URL` (string **direta** do Neon SP), `BREVO_API_KEY`, `MAIL_FROM`.
4. Remover `render.yaml` só depois do corte; atualizar `docs/OPERATIONS.md`, `docs/GO_LIVE_CHECKLIST.md`, `docs/BACKUP_RECOVERY.md` (onde fica o banco, histórico do Launch = 7 dias) e `docs/privacy/DATA_MAP.md` (operadores e países).
5. Novo ADR (próximo número livre) substituindo o ADR-060.

**Corte (Jota, ~1 h):**
1. Criar projeto Neon em `aws-sa-east-1` (Launch), PostgreSQL 16. Não rode migrations antes do restore: o dump já traz `app.schema_migrations`.
2. `scripts/ops/dump.sh` do Neon atual → `scripts/ops/restore-test.sh` local (restore comprovado) → `pg_restore --no-owner` no Neon SP. Conferir roles `cantum_user` no destino `[A CONFIRMAR com o lead: a role é criada pela migration ou precisa existir antes]`.
3. `fly launch --no-deploy`, `fly secrets set`, `fly deploy`. Ver `/health`, cadastro, login e Modo Palco com 2 aparelhos (WebSocket).
4. Nova origem = cookies e PWA novos: todo mundo entra de novo. Sem usuários reais, aceitável. Depois disso, apagar o projeto Neon de Virginia e o serviço do Render (registrar a data).
5. Brevo: nada muda no código; com domínio próprio, configurar SPF/DKIM e trocar `MAIL_FROM`.

**Riscos:** preço de `gru` acima do estimado; limite de conexões diretas no Neon (pool pequeno já previsto); escala horizontal continua bloqueada pelo Realtime em memória (não é problema para 5–20 igrejas).

## Fontes (consultadas em 2026-10-22)

- Render — regiões: https://render.com/docs/regions
- Neon — regiões (`aws-sa-east-1`, região fixa): https://neon.com/docs/introduction/regions · GA São Paulo: https://neon.tech/docs/changelog/2025-02-28 · Preços: https://neon.com/pricing
- Fly.io — regiões: https://fly.io/docs/reference/regions · Managed Postgres (planos, `gru`): https://docs.fly.io/mpg · https://fly.io/mpg · LISTEN/NOTIFY e host direto: https://fly.io/docs/mpg/client-configuration/ · Preços de Machines: https://docs.fly.io/about/pricing
- Railway — regiões: https://docs.railway.com/deployments/regions
- Supabase — regiões: https://supabase.com/docs/guides/platform/regions · Preços: https://supabase.com/pricing
- AWS — Lightsail regiões: https://docs.aws.amazon.com/lightsail/latest/userguide/understanding-regions-and-availability-zones-in-amazon-lightsail.html · Lightsail preços: https://aws.amazon.com/lightsail/pricing/ · RDS PostgreSQL preços: https://aws.amazon.com/rds/postgresql/pricing · `db.t4g.micro` SP (agregador): https://www.bytebase.com/dbcost/rds/instance/db.t4g.micro/
- Google Cloud SQL `db-f1-micro` (agregador): https://www.bytebase.com/dbcost/cloudsql/instance/db-f1-micro/
- Azure PostgreSQL Flexible: https://azure.microsoft.com/en-gb/pricing/details/postgresql/ · backup 7–35 dias: https://learn.microsoft.com/en-AU/azure/postgresql/flexible-server/concepts-compute-storage · B1ms BR (agregador): https://www.bytebase.com/dbcost/azure-flexible/instance/B1ms/
- Oracle — disponibilidade por região: https://www.oracle.com/br/cloud/distributed-cloud/service-availability/
- Magalu Cloud DBaaS (notícia): https://itforum.com.br/?p=9615863
- Vultr Managed Databases: https://www.vultr.com/products/managed-databases/ · preço mínimo (agregador): https://infratally.com/articles/vultr-vs-digitalocean-managed-databases-2026/
- Locaweb VPS (agregador): https://www.whtop.com/review/locaweb.com.br
