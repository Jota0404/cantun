# CANTUM — Checklist de go-live (primeira vez em produção)

> Para o Jota, passo a passo. Base: `docs/OPERATIONS.md`, `docs/BACKUP_RECOVERY.md`, ADR-059, ADR-060, ADR-063.
> Em cada passo: **Veja** = o que deve aparecer. **Se der errado** = pare e chame o lead; não tente consertar sozinho.
> `[A CONFIRMAR]` = não foi possível validar contra os scripts do repositório; confira com o lead antes.
> Nada aqui foi executado contra Neon ou Render. Reserve cerca de 1 hora, sem pressa.

## 0. Regras

1. **Nunca** cole senha, connection string ou chave em chat, e-mail, print ou arquivo (ADR-050). Só no terminal, pelo `read -rs` dos comandos abaixo.
2. Trabalhe **só no terminal do seu Mac** e nos painéis do Render e Neon. O lead e a IA não tocam em produção.
3. Comandos `select` são só leitura. Se um comando não estiver neste guia, não rode.
4. Dúvida em qualquer passo: pare. Nada aqui tem pressa.

## 1. Preparação

Tenha à mão:
- login do Render e do Neon (e do GitHub);
- a connection string **DIRETA** do Neon (OPERATIONS §2: sem `-pooler` depois do `@`). Fica só no terminal.
- o projeto baixado e atualizado no Mac.

Instale e prepare o terminal (uma vez):

```bash
brew install postgresql@16
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
psql --version && pg_dump --version
```
**Veja:** duas linhas com `16`. **Se der errado:** pare.

```bash
cd /Users/joao.barcelos/Documents/Projetos/cantun && git checkout main && git pull
read -rs DATABASE_URL && export DATABASE_URL
```
(cole a string direta e tecle Enter; nada aparece na tela, é normal.)

Teste a conexão:
```bash
psql "$DATABASE_URL" -tA -c "select 'conectou'"
```
**Veja:** `conectou`. **Se der errado:** `password authentication failed` ou `could not translate host` = string errada. Pare.

Se o Neon estiver dormindo, a primeira conexão demora alguns segundos. É normal.

## 2. Confirmar que o banco só tem dados de teste

```bash
psql "$DATABASE_URL" -c "select
 (select count(*) from app.users) as usuarios,
 (select count(*) from public.organizations) as organizacoes,
 (select count(*) from public.songs) as musicas,
 (select count(*) from public.services) as servicos"
```
Lembrete: `app.users` inclui 1 conta de sistema (anônimo, ADR-063); depois da 0013 inclui também o "Ex-membro". Ignore essas.

Veja os e-mails (só leitura) para reconhecer se são todos seus ou de testes:
```bash
psql "$DATABASE_URL" -c "select email, created_at from app.users order by created_at"
```
**Critério:**
- **Pode seguir:** todas as contas são suas ou de pessoas de teste que você conhece, e você aceita perder as músicas/repertórios/serviços que aparecem.
- **PARE:** aparece e-mail de gente que você não reconhece, ou alguém que você não avisou usando o app, ou qualquer dado que você não aceita perder. A 0007 e a 0008 apagam itens (passo 4).

## 3. Dump de segurança ANTES de qualquer mudança

```bash
mkdir -p ~/cantum-backups
scripts/ops/dump.sh ~/cantum-backups
ls -l ~/cantum-backups
```
**Veja:** `Cópia criada: .../cantum-AAAA-MM-DD-HHMM.dump (N bytes)` com N maior que zero e o arquivo na lista.
**Se der errado:** `pg_dump: command not found` = refaça o `export PATH` do passo 1. Erro de versão (`server version mismatch`) = pare. Não siga sem dump.

Guarde: copie o `.dump` para a nuvem pessoal (Drive/iCloud, com verificação em duas etapas). Não compartilhe (tem dados pessoais).

Teste que restaura, em banco **local** (isso é o "restore real" que o B8 exige):
```bash
unset DATABASE_URL
brew services start postgresql@16
scripts/ops/restore-test.sh ~/cantum-backups/cantum-AAAA-MM-DD-HHMM.dump cantum_restore
```
(troque o nome do arquivo pelo real.) **Veja:** termina com `Restore concluído em 'cantum_restore'`, sem `ERROR`, mostra a última migration e as linhas por tabela. `app.users` tem de bater com o passo 2. Limpe:
```bash
dropdb cantum_restore
```
**Se der errado:** `ERROR` ou números diferentes: pare. Sem restore comprovado, não migre.

**Registre** o resultado na tabela do `docs/BACKUP_RECOVERY.md` §7 (data, quem, arquivo, resultado). O lead faz o commit se você mandar a linha pronta (sem segredo). Depois, volte a ter a conexão:
```bash
read -rs DATABASE_URL && export DATABASE_URL
```

## 4. Quais migrations estão pendentes

```bash
psql "$DATABASE_URL" -c "select version, applied_at from app.schema_migrations order by version"
```
Compare com a lista abaixo. As que **não** aparecem são as pendentes. Se aparecer até `0027_block_completed_service_delete`, está tudo aplicado e o passo 5 só publica o código. Se o Render estiver com **Auto-Deploy ligado**, parte delas já pode ter rodado sozinha no último push em `main` (OPERATIONS §9). `[A CONFIRMAR]` qual é a última aplicada em produção; é o que este comando mostra.

| Migration | O que faz | Apaga dados? |
|---|---|---|
| 0007 song_copies | Música do Ministério passa a ser uma cópia da música pessoal. | **SIM:** apaga **todos** os itens de repertório e os itens de serviço que têm música; zera a música atual do Palco. Músicas pessoais ficam. |
| 0008 sync_reliability | Ordem do repertório mais segura; proíbe música repetida no mesmo serviço; Líder pode iniciar o Palco. | **SIM:** música repetida no mesmo serviço (fica a de menor posição) e as escalas ligadas ao item removido. |
| 0009 personal_repertoire | Repertório pessoal e importação para a organização. | Não. |
| 0010 stage_current_key | Palco do serviço usa o tom escolhido. | Não. |
| 0011 member_remove | Remover membro de equipe; log administrativo. | Não (remove escalas futuras só quando alguém é removido). |
| 0012 export_my_data | Exportar meus dados. | Não. |
| 0013 delete_account | Excluir a própria conta; cria o usuário "Ex-membro". | Não ao aplicar (cria 1 usuário sentinela). |
| 0014 org_membership_writes | **Corrige furo de segurança urgente:** um Admin podia se promover a dono ou apagar o dono; e quem não era membro podia mexer em vínculos. | Não. **Não adie esta.** |
| 0015 user_consents | Aceite de Política e Termos (versão `2026-10-17`, texto ainda rascunho). | Não. |
| 0016 minimum_age | Declaração de 16 anos no cadastro. **Muda a assinatura de `accept_consents`.** | Não. |
| 0017 service_item_key | Tom da música por serviço; o Palco do serviço usa esse tom. | Não (só acrescenta coluna). |
| 0018 service_item_reprise | Itens de reprise e medley no serviço. | Não ao aplicar (depois, excluir a música do serviço apaga suas reprises/medleys). |
| 0019 session_reauth | Excluir a conta exige ter digitado a senha nos últimos 5 minutos. **O servidor novo lê `reauth_at` das sessões: esta tem de estar aplicada ANTES do servidor novo subir.** | Não. |
| 0020 service_preparations | Cria tabela: marcar "preparado" por serviço. | Não. |
| 0021 rehearsals | Cria tabelas de ensaio e músicas em foco. | Não. |
| 0022 materials_links | Cria tabela de materiais (links https). | Não ao aplicar (depois, excluir uma música apaga os materiais dela). |
| 0023 execution_history | Registro do serviço concluído (músicas, tom, equipe confirmada). Concluir fica bloqueado enquanto houver Palco aberto do serviço. **Não gera registro para serviços já concluídos antes dela.** Decisões D1–D3 `[A CONFIRMAR]` com você. | Não. |
| 0024 activity_events | Log de atividade somente leitura. Guarda 90 dias. | Não ao aplicar (depois, eventos com mais de 90 dias são apagados automaticamente). Decisões D4/D5 `[A CONFIRMAR]`. |
| 0025 stage_open_unique | No máximo uma sessão de Palco aberta por serviço. | **SIM (pouco):** encerra (não apaga) sessões de Palco abertas duplicadas do mesmo serviço; fica a ao vivo ou a mais recente. |
| 0026 stage_key_reset | Trocar de item no Palco zera o tom ao vivo. | Não. |
| 0027 block_completed_service_delete | Trigger que impede excluir serviço concluído (preserva o registro da execução). | Não. |

Como só há dados de teste, as perdas da 0007/0008 foram aceitas (ADR-059 §1, decisão de 2026-10-16). Se o passo 2 deixou dúvida, não siga.

## 5. Aplicar migrations e publicar servidor + front, juntos

**Por que juntos:** a 0016 troca a assinatura de `accept_consents` (servidor **antigo** + migration **nova** = o cadastro quebra) e o servidor novo lê `app.sessions.reauth_at`, que só existe depois da 0019 (servidor **novo** + banco **antigo** = login/sessão quebra). O servidor novo só funciona com o banco na 0027. Por isso a ordem é migration e servidor na mesma subida, janela curta.

**O caminho recomendado não usa o `migrate.sh` na mão:** o `startCommand` do Render roda `node src/migrate.ts` e só depois sobe o servidor (render.yaml). Então um único deploy aplica as migrations e o servidor novo, nessa ordem. Rodar `scripts/db/migrate.sh` antes seria deixar o servidor antigo com a migration nova. Use o `migrate.sh` só se o lead pedir (aí, imediatamente antes do deploy, na mesma janela).

Passos:
1. No Render, serviço `cantum`: **Settings → Build & Deploy → Auto-Deploy**. Se estiver **Off**, o deploy é manual (passo 4). Se estiver **On**, o último merge em `main` já pode ter disparado o deploy; veja **Events**.
2. Confira que o `main` do GitHub tem o código que você quer (último merge, CI verde). `git log -1 --oneline` no Mac e a aba **Actions** do GitHub.
3. Avise quem testa que o app ficará fora do ar por alguns minutos. Faça fora do culto.
4. Render → serviço `cantum` → **Manual Deploy → Deploy latest commit**.
5. Acompanhe em **Logs**. **Veja**, nesta ordem: linhas `aplicada  0007_song_copies` … `aplicada  0027_block_completed_service_delete` (só as que faltavam), depois `migrations em dia`, depois o status **Live**.
6. Teste `https://<sua-url>/health`. **Veja:** `{"ok":true}`.

**Se der errado:** `migration ... falhou` nos Logs = cada migration roda em uma transação, então a que falhou não fica pela metade, mas as anteriores ficam aplicadas. Não mexa no banco. Pare e mande ao lead a mensagem (sem segredos). `getaddrinfo` ou `password authentication failed` = `DATABASE_URL` do Render errada (OPERATIONS §6).

**Front:** o front vai no mesmo serviço do Render (`dist/` é construído no deploy). O GitHub Pages (workflow `Redirect GitHub Pages to Render`) só redireciona para a URL do Render a cada push em `main`; não há deploy separado de front. Confira que o endereço antigo do Pages abre o Render (`[A CONFIRMAR]` que o redirecionamento aponta para a URL certa; abra e veja a barra de endereço). Se o build parar em `test -n "$VITE_API_URL"`, siga OPERATIONS §6.

## 6. Verificação depois (use uma janela anônima do navegador)

Marque cada item:
- [ ] `/health` mostra `{"ok":true}`.
- [ ] `/privacidade` e `/termos` abrem sem login e mostram o aviso de rascunho.
- [ ] Cadastro: sem marcar a idade (16+) e o aceite de Política e Termos, **não** cria a conta. Marcando, cria, e o e-mail de confirmação chega (olhe o spam). Se o cadastro falhar com erro, **pare**: sinal clássico de servidor antigo com migration nova (ver rollback).
- [ ] Confirmar o e-mail pelo link e entrar (login).
- [ ] Sair e entrar de novo.
- [ ] Exportar meus dados baixa um arquivo JSON, sem senha dentro. `[A CONFIRMAR]` onde fica o botão na tela (Conta/Privacidade).
- [ ] Criar uma música, um repertório e um serviço com a música.
- [ ] Abrir o serviço e entrar no **Modo Palco**: abre, troca de música, volta.
- [ ] Segurança (0014): com uma conta Admin que não é a dona, tentar se promover a dona ou remover a dona não funciona. `[A CONFIRMAR]` o roteiro de UI; se não conseguir testar, peça ao QA.
- [ ] Conferir as migrations: `psql "$DATABASE_URL" -tA -c "select max(version) from app.schema_migrations"` mostra `0027_block_completed_service_delete`.
- [ ] Tabelas novas existem (só leitura; cada uma devolve um número, sem `ERROR`): `psql "$DATABASE_URL" -tA -c "select (select count(*) from public.service_preparations), (select count(*) from public.rehearsals), (select count(*) from public.materials), (select count(*) from public.service_executions), (select count(*) from public.activity_events)"`.
- [ ] 0025: nenhum serviço com duas sessões de Palco abertas: `psql "$DATABASE_URL" -tA -c "select count(*) from (select service_id from public.stage_sessions where status in ('lobby','live') group by service_id having count(*) > 1) d"` mostra `0`.
- [ ] No app: definir o tom de uma música no serviço e abrir o Palco nesse tom; criar um ensaio e um material (link); marcar "preparado"; concluir o serviço (com o Palco encerrado) e ver o registro. `[A CONFIRMAR]` o roteiro de UI; se não conseguir, peça ao QA.
- [ ] Excluir conta pede a senha de novo (0019). Teste com uma conta descartável.

Depois: `unset DATABASE_URL` e feche o Terminal.

### Rollback (voltar atrás)

Quando: o cadastro ou login não funciona, ou os dados ficaram errados e não tem conserto rápido.
- **Só código ruim** (banco ok): Render → **Events → (deploy anterior) → Rollback**. Cuidado: o rollback **não** desfaz migrations. Voltar o código antigo com o banco na 0027 **quebra o cadastro** (0016) e a exclusão de conta (0019). Então prefira corrigir para frente (novo deploy) ou restaurar o banco.
- **Voltar o banco ao dump:** `[A CONFIRMAR]`, o roteiro detalhado de restore em produção ainda não foi ensaiado (BACKUP_RECOVERY §4). Em resumo, o lead acompanha: criar um banco/branch novo no Neon, `pg_restore --no-owner --dbname "$DATABASE_URL" arquivo.dump`, trocar a `DATABASE_URL` no Render e redeployar com o **código antigo** compatível com a migration do dump. Alternativa mais simples para o Neon: **Branches → Restore** para um horário antes do passo 5 (OPERATIONS §8.1; confira a janela de histórico do plano).
- **O que se perde:** tudo o que foi criado entre o dump e a restauração (contas, músicas, serviços; limite de 24 h do RPO). Depois de restaurar, invalide sessões e peça novo login (BACKUP_RECOVERY §5).

## 7. Antes de convidar o primeiro usuário real

Nada disso está feito; é bloqueio de go-live com usuário real (não confundir com este teste só com dados de teste):
- [ ] **Texto jurídico final** da Política e dos Termos (trechos `[JURÍDICO]` em `docs/privacy/`), remover a linha `> RASCUNHO`, e **subir a versão do consentimento** no mesmo PR: nova migration com `create or replace function app.current_consent_version()`, `src/domain/privacy/consent.ts` e os textos (`docs/privacy/README.md`). O lead prepara; você aprova o texto.
- [ ] **Hospedagem definida:** a região atual (EUA) vale só com dados de teste. Antes do primeiro usuário real, decidir e migrar para hospedagem no Brasil (gatilho do ADR-060, junto com o B8). Decisão sua.
- [ ] **Quem recebe e-mails e avisos:** remetente verificado do Brevo (`MAIL_FROM`) é um e-mail que você lê; decidir um contato de privacidade para a Política e o responsável por responder pedidos de titulares (acesso, exclusão).
- [ ] **Backup diário:** rodar `scripts/ops/dump.sh` todo dia (RPO de 24 h), guardar 30 dias, apagar os antigos; decidir o registro de contas excluídas para reaplicar após restore (BACKUP_RECOVERY §6, recomendação: sim). Sem plano pago, é manual e depende de você.
- [ ] Repetir o teste de restore (passo 3) com um dump feito depois do go-live e registrar no §7 do BACKUP_RECOVERY.
