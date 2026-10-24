# CANTUM — Operação (Render + Neon + Brevo)

> Decisão: [ADR-060](adr/ADR-060-hospedagem-render-neon.md) · Configuração: [`render.yaml`](../render.yaml)
> Quem executa: **só o owner** (ADR-050/058). A IA prepara os arquivos, mas não mexe nos painéis nem nos dados de produção.
> **Escopo (2026-10-23):** este roteiro vale para o ambiente atual de **teste** (Render + Neon, EUA, ADR-060 `Proposed`). A produção no Brasil ainda será escolhida pelo owner (preferência: AWS; `docs/HOSTING_OPTIONS_BR.md` §5); quando decidir, este documento é reescrito para o provedor escolhido. Schema atual: migrations 0001–0027.

Este roteiro é para quem nunca usou nenhum desses serviços. Você não precisa saber Docker nem usar a linha de comando, exceto para o backup manual (seção 8).

## 1. Como funciona

- **Render** roda o CANTUM: um único serviço gratuito serve as telas do app e a API no mesmo endereço (`https://<nome>.onrender.com`).
- **Neon** guarda o banco de dados PostgreSQL 16 (plano gratuito, região AWS us-east-1).
- **Brevo** envia os e-mails de confirmação de conta e de troca de senha.
- A cada envio (push) na branch `main` do GitHub, o Render baixa o código, monta o app, atualiza o banco (migrations) e reinicia, sem você fazer nada.

## 2. Neon: criar o banco e copiar a conexão DIRETA

1. Crie uma conta em <https://neon.tech> (pode entrar com o GitHub).
2. **Create project**:
   - *Project name*: `cantum`;
   - *Postgres version*: **16**;
   - *Region*: **AWS US East 1 (N. Virginia)**, a mesma região do Render, para o app ficar rápido;
   - *Database name*: `cantum`.
3. No painel do projeto, clique em **Connect**.
4. Desligue a opção **Connection pooling**. Isso é importante: o Modo Palco usa um recurso do PostgreSQL (`LISTEN/NOTIFY`) que não funciona pelo pooler.
5. Confira a string que aparece: o endereço depois do `@` **não pode** ter `-pooler`.
   - Certo: `postgresql://usuario:senha@ep-nome-123456.us-east-1.aws.neon.tech/cantum?sslmode=require`
   - Errado: `...@ep-nome-123456-pooler.us-east-1.aws.neon.tech/...`
6. Copie a string inteira (com a senha). Ela vai no Render, na variável `DATABASE_URL` (seção 4). **Não** cole em arquivo, chat, e-mail nem no GitHub.

Na primeira subida, o próprio CANTUM cria as tabelas e os papéis de acesso. Você não precisa rodar nada no Neon.

## 3. Brevo: remetente e chave de API

1. Crie uma conta gratuita em <https://www.brevo.com>.
2. Cadastre o remetente: menu **Senders, Domains & Dedicated IPs → Senders → Add a sender**. Use um e-mail que você lê (por exemplo, o seu Gmail). O Brevo manda um e-mail de confirmação: clique no link.
3. Crie a chave: menu **SMTP & API → API Keys → Generate a new API key**, com o nome `cantum-render`. Copie a chave na hora (ela começa com `xkeysib-`): o Brevo só mostra uma vez.
4. Os valores que vão para o Render:
   - `BREVO_API_KEY`: a chave copiada;
   - `MAIL_FROM`: `CANTUM <o-email-que-voce-verificou@exemplo.com>`.

Sem domínio próprio, alguns provedores podem mandar esses e-mails para o spam. Avise quem for testar.

## 4. Render: conectar o repositório pelo Blueprint

1. Crie uma conta em <https://render.com> entrando com o GitHub e autorize o acesso ao repositório do CANTUM.
2. No painel, clique em **New → Blueprint**.
3. Escolha o repositório. O Render lê o arquivo `render.yaml` e mostra um serviço web chamado `cantum` (plano Free, região Virginia).
4. Ele pede três valores secretos. Cole:

   | Variável | Valor |
   |---|---|
   | `DATABASE_URL` | a string **direta** do Neon (seção 2) |
   | `BREVO_API_KEY` | a chave do Brevo (seção 3) |
   | `MAIL_FROM` | `CANTUM <seu-email-verificado>` |

5. Clique em **Apply** (ou **Deploy Blueprint**).

As demais variáveis já vêm do `render.yaml` e não precisam de mudança:
- `NODE_ENV=production`, `NODE_VERSION=24`, `HOST=0.0.0.0` e `TRUST_PROXY=1` (confira no passo 4 da seção 5);
- `APP_ORIGIN` e `VITE_API_URL`: se ficarem vazias, valem a URL do próprio serviço (`RENDER_EXTERNAL_URL`), que é o certo neste caso.

## 5. Primeiro deploy e conferência

1. Acompanhe em **Events** e **Logs**. O build leva alguns minutos. No início do serviço, aparecem linhas como `aplicada  0001_baseline` e, por fim, `migrations em dia`.
2. Quando o status ficar **Live**, abra a URL do serviço (no topo da página, algo como `https://cantum.onrender.com`).
3. Confira:
   - `https://<sua-url>/health` mostra `{"ok":true}`;
   - criar uma conta funciona e o e-mail de confirmação chega (olhe o spam);
   - o link do e-mail abre o CANTUM e confirma a conta.
4. **Confira o IP visto pelo servidor** (uma vez, no primeiro deploy). Esse IP é o que conta para o limite de tentativas de login, e um ajuste errado deixa esse limite burlável.
   1. Descubra o seu IP público: abra <https://api.ipify.org> no mesmo aparelho.
   2. Abra `https://<sua-url>/health`.
   3. Em **Logs**, procure a linha mais recente com `"url":"/health"`. Ao lado, aparece `"ip"`: é o IP do visitante que o servidor usa no limite de tentativas. (O `"remoteAddress"` é o do proxy do Render, sempre interno, e não serve para esta conferência.)
   4. Se for o seu IP público, está certo: deixe `TRUST_PROXY=1`.
   5. Se o `"ip"` for um endereço interno (começando com `10.`, `172.` ou `192.168.`) ou de outra empresa (por exemplo, uma CDN) em vez do seu, há mais um proxy na frente: troque para `TRUST_PROXY=2` em **Environment** e repita. Nunca use um número maior que o necessário.

## 6. Logs

- No serviço: aba **Logs**. Dá para filtrar por texto, como `erro` ou `realtime`.
- Por segurança, os logs nunca mostram senha, cookie, token, link de e-mail nem o conteúdo das músicas (NFR-008).
- Erros comuns:

  | Mensagem | O que fazer |
  |---|---|
  | `produção exige BREVO_API_KEY e MAIL_FROM` | Preencha as duas em **Environment** e clique em **Save, rebuild and deploy**. |
  | `migration ... falhou` | Copie a mensagem e abra uma issue. Não mexa no banco. |
  | `password authentication failed` ou `getaddrinfo` | `DATABASE_URL` errada: copie de novo a string **direta** do Neon. |
  | `Brevo recusou o envio (HTTP 401)` | Chave do Brevo errada ou apagada: gere outra (seção 3). |
  | `Brevo recusou o envio (HTTP 400)` | Remetente de `MAIL_FROM` não verificado no Brevo. |
  | O build para em `test -n "$VITE_API_URL"` | Em **Environment**, crie `VITE_API_URL` com a URL do serviço (`https://...onrender.com`) e refaça o deploy. |

## 7. Partida a frio (o app "dorme")

- Depois de **15 minutos sem acesso**, o Render desliga o serviço. O próximo acesso o religa, e essa primeira abertura leva **cerca de 1 minuto**. Isso é proposital: assim o plano gratuito não acaba, e o Neon também fica parado fora de uso.
- **Antes do culto, abra o CANTUM uns minutos antes** para ele já estar acordado.
- Durante o uso do Modo Palco, a conexão do palco mantém o serviço acordado.
- O Neon também suspende sozinho alguns minutos depois que o serviço dorme. O primeiro acesso depois disso leva alguns segundos a mais.

## 8. Backup

São duas camadas: o histórico do Neon (automático, de curto prazo) e uma cópia manual (sua, fora do Render). **Um backup só vale depois de um restore testado** (NFR-009).

### 8.1 Histórico de restauração do Neon (automático)

- O Neon guarda o histórico recente do banco. No plano gratuito, a janela é curta: confira o valor atual em **Settings → Storage / History retention**.
- Para voltar o banco a um momento: **Branches → (branch principal) → Restore**, escolha a data e a hora.
- Para só consultar dados antigos sem mexer no banco do app, crie uma **branch** a partir de um horário passado.

### 8.2 Cópia manual com `pg_dump` (recomendado toda semana e antes de mudanças grandes)

No seu Mac, uma vez só:

```bash
brew install postgresql@16
```

Para gerar a cópia, abra o Terminal e rode os dois comandos abaixo. O primeiro pede a string **direta** do Neon sem mostrá-la na tela e sem guardá-la no histórico:

```bash
read -rs DATABASE_URL && export DATABASE_URL
```

```bash
/opt/homebrew/opt/postgresql@16/bin/pg_dump "$DATABASE_URL" --format=custom --no-owner --file "cantum-$(date +%F).dump"
```

Guarde o arquivo `.dump` fora do computador também (Google Drive, iCloud, HD externo). Ele contém dados pessoais: não compartilhe.

### 8.3 Testar o restore (obrigatório pelo menos uma vez)

Restaure a cópia num banco local, sem tocar no Neon:

```bash
/opt/homebrew/opt/postgresql@16/bin/createdb cantum_restore
```

```bash
/opt/homebrew/opt/postgresql@16/bin/pg_restore --no-owner --dbname cantum_restore cantum-AAAA-MM-DD.dump
```

```bash
/opt/homebrew/opt/postgresql@16/bin/psql cantum_restore -c "select count(*) from app.users"
```

O número de contas tem de bater com o do app. Anote a data do teste.

## 9. Atualizações

- **Automático:** todo push (ou merge de PR) na branch padrão do repositório (`main`) dispara um novo deploy. As migrations novas rodam sozinhas na subida, antes do servidor aceitar acessos.
- **Desfazer um deploy ruim:** no serviço, **Events → (deploy anterior) → Rollback**. Atenção: o rollback volta o código, mas **não** desfaz migrations já aplicadas no banco. Se a falha for no banco, restaure pelo Neon (8.1) e abra uma issue.
- **Limpeza manual de dados de teste em produção:** um `DELETE` direto de serviço concluído é bloqueado pelo trigger da 0027, até pelo dono do banco. Exclua a organização (cascata) ou use `set session_replication_role = replica` só em manutenção supervisionada.
- **Pausar os deploys automáticos:** **Settings → Build & Deploy → Auto-Deploy → Off**.

## 10. Segurança

- Segredos (`DATABASE_URL`, `BREVO_API_KEY`) só no painel do Render. Nunca no Git, em chat ou em print.
- Se um segredo vazar:
  - **Neon:** em **Roles → Reset password**, gere uma senha nova e atualize `DATABASE_URL` no Render;
  - **Brevo:** apague a chave e gere outra.
- Região fora do Brasil: aceita **só com dados de teste**. Antes do primeiro usuário real, migre para o Brasil (gatilho do ADR-060, junto com o B8).

## 11. Limites do plano gratuito (confira nos painéis)

| Serviço | Limite | Onde ver |
|---|---|---|
| Render | 750 h/mês por workspace; dorme após 15 min sem acesso | **Billing / Usage** |
| Neon | cota mensal de computação e 0,5 GB de armazenamento | **Billing / Usage** do projeto |
| Brevo | cota diária de e-mails do plano gratuito | **Usage** |

Se algum limite acabar com frequência, é o sinal do ADR-060 para migrar para hospedagem paga.
