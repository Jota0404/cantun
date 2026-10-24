# CANTUM — Backup e recuperação

> NFR-009 · VS-07 RN-12, D5 · Base: ADR-059, ADR-063. Complementa `docs/OPERATIONS.md` §8 (histórico do Neon e `pg_dump` manual). Itens `[JURÍDICO]` dependem de decisão legal.

## 1. Resumo

| Item | Valor |
|---|---|
| O que é copiado | Todo o PostgreSQL do Neon (schemas `app` e `public`: contas, organizações, músicas, repertórios, serviços, escalas, ensaios, materiais por link, "preparado", registro da execução, log de atividade, consentimentos, log administrativo). Dexie (aparelho do usuário) não entra: é cópia local do que já está no banco. |
| Frequência | Dump diário **manual** (`scripts/ops/dump.sh`) até existir plano pago com backup automático. Também antes de cada mudança grande. |
| RPO (perda aceitável) | 24 h |
| RTO (tempo para voltar) | 4 h |
| Onde fica | Fora do Render e do Neon: disco do Jota **e** uma cópia em nuvem pessoal (Drive/iCloud) com a conta protegida por verificação em duas etapas. |
| Criptografia | O dump **não é criptografado** pelo `pg_dump`. Guarde só em disco com FileVault ligado e em pasta de nuvem com 2FA; se sair desses lugares (HD externo, pendrive), criptografe: `gpg --symmetric --cipher-algo AES256 arquivo.dump` (a senha vai no gerenciador de senhas, nunca junto do arquivo). |
| Retenção | Proposto: 30 dias de dumps diários; depois apague. `[JURÍDICO]` confirmar o prazo (ver §6). |
| Camada extra (automática) | Histórico de restauração do Neon (OPERATIONS §8.1): curto no plano gratuito. Serve para erro recente, não substitui o dump. |

O RPO de 24 h só vale se o dump for feito todo dia. Esquecer um dia amplia a perda possível; anote a data de cada dump no nome do arquivo (o script já faz).

## 2. Fazer a cópia (uma vez por dia)

Requisito único: `brew install postgresql@16` e deixar `pg_dump` no PATH (`export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"`).

1. Pegue a string **direta** do Neon (OPERATIONS §2) e informe sem mostrar na tela nem gravar no histórico:
   ```bash
   read -rs DATABASE_URL && export DATABASE_URL
   ```
2. Na pasta do projeto, rode (a pasta de destino é opcional):
   ```bash
   scripts/ops/dump.sh ~/cantum-backups
   ```
3. Confirme que o arquivo `cantum-AAAA-MM-DD-HHMM.dump` apareceu e tem tamanho maior que zero.
4. Copie o arquivo para a nuvem pessoal. Feche o Terminal (ou `unset DATABASE_URL`).
5. Apague dumps com mais de 30 dias, local e na nuvem.

## 3. Restaurar (teste, em banco local descartável)

Nunca restaure sobre o banco de produção por este roteiro. Ele cria um banco **novo e local**.

1. `unset DATABASE_URL` (o script recusa rodar com ela definida) e confirme que o PostgreSQL local está ligado: `brew services start postgresql@16`.
2. Rode, trocando o nome do arquivo:
   ```bash
   scripts/ops/restore-test.sh ~/cantum-backups/cantum-2026-10-18-0900.dump cantum_restore
   ```
   O script cria o banco `cantum_restore`, restaura e imprime: a última migration, o total de migrations e a contagem de linhas de cada tabela.
3. **Como saber que deu certo:**
   - O script terminou com "Restore concluído" e sem `ERROR`.
   - A última migration é a mais recente aplicada no banco de origem (em `main`, hoje `0027_block_completed_service_delete`; confira a lista em `db/migrations/`). Um dump anterior ao go-live pode parar antes (GO_LIVE_CHECKLIST §4).
   - `app.users` bate com o número de contas que você espera (inclui 1 linha de sistema, o usuário anônimo da ADR-063).
   - Tabelas centrais (`organizations`, `songs`, `services`) não estão zeradas se o app em produção tem dados.
4. **Teste de login (opcional):** o servidor local contra o banco restaurado ainda não tem roteiro neste repositório; peça ao lead para subir `server/` apontando para `cantum_restore` e entre com uma conta conhecida.
5. Limpe: `dropdb cantum_restore`.
6. **Registre o teste na tabela do §7** (data, arquivo, resultado). O B8 só fecha com pelo menos uma linha preenchida.

## 4. Restaurar de verdade (incidente)

Fora do teste; o Jota decide e acompanha com o lead. Em resumo: criar um banco novo no Neon (ou branch), restaurar nele com `pg_restore --no-owner --dbname "$DATABASE_URL" arquivo.dump`, apontar `DATABASE_URL` do Render para ele e redeployar. O roteiro detalhado será escrito e ensaiado quando houver o primeiro incidente real ou o plano pago; até lá, o item é `[pendente]` e o RTO de 4 h é alvo, não garantia.

## 5. Depois de restaurar

1. **Migrations pendentes:** se o dump é de antes de uma migration já em `main`, o deploy as aplica na subida (OPERATIONS §9). Para checar no teste: `scripts/db/migrate.sh cantum_restore`.
2. **Sessões:** o dump traz `app.sessions` antigas. Após restore real, invalide todas (`delete from app.sessions`) e peça novo login. Sessões criadas depois do dump não existem mais.
3. **Consentimentos:** `user_consents` volta ao estado do dump. Contas criadas depois do dump somem junto com seus aceites; essas pessoas precisam se cadastrar e aceitar de novo. Avise-as.
4. **Dados criados após o dump (até 24 h) estão perdidos.** Aparelhos com Dexie ainda guardam cópia local e a fila de sync pode reenviar; confira duplicatas.
5. **Exclusões de conta (§6): reaplique antes de reabrir o app.**

## 6. Exclusão de conta e backups

A exclusão (ADR-063, RN-03) apaga o dado pessoal do banco **na hora**, mas **não altera dumps já feitos**: o dado pessoal permanece nos arquivos até expirarem.

- **Prazo máximo no dump:** 30 dias após a exclusão (retenção do §1), mais o que existir no histórico do Neon (janela curta do plano). `[JURÍDICO]` confirmar se 30 dias é aceitável e se isso deve constar na Política (seção 5, hoje com `[JURÍDICO: prazo]`).
- **Nunca copie dumps para outros lugares** além dos dois do §1; isso multiplica o que precisa expirar.
- **Re-aplicar exclusões após restore:** quem excluiu a conta depois do dump volta a existir. Para evitar ressurreição de dados, é preciso uma lista de contas excluídas desde a data do dump. O banco não guarda isso hoje (`admin_events` registra a exclusão sem identificar o titular, por RN-09). **Decisão pendente do owner** `[JURÍDICO]`: manter, fora do banco, um registro mínimo de IDs excluídos (só o UUID, sem e-mail) pelo mesmo prazo de 30 dias, e apagar essas contas logo após qualquer restore real. Recomendação: sim. Sem esse registro, restaure só em ambiente de teste e trate o restore real caso a caso.

## 7. Registro de testes de restore

| Data | Quem | Arquivo (data do dump) | Resultado | Observações |
|---|---|---|---|---|
| _preencher_ | Jota | | | |

Restore: o `pg_restore` não dispara o trigger da 0027 (só `DELETE` o faz), então restaurar serviços concluídos funciona; limpar um banco restaurado exige excluir a organização (cascata), como em OPERATIONS §9.

Teste de integridade dos scripts feito pelo planner em 2026-10-18 contra um PostgreSQL local descartável (migrations 0001–0015, sem dados reais; a 0016 entrou depois): dump e restore OK. **Não substitui** o teste com dump real do Neon.
