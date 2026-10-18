# CANTUM — Permissões

> Aceito · 2026-10-01 · Bloco B2 (VS-01) · Decisão: [ADR-051](adr/ADR-051-papeis-dois-niveis-e-permissoes.md) (Accepted)
> Base: Blueprint §5, §49, §50, §53 · ADR-016 (papel de acesso ≠ função musical) · ADR-049 (portabilidade PostgreSQL).
> Este documento é a **fonte única da matriz de permissões**. A função SQL `app.has_permission` e o espelho `domain/access/permissions.ts` devem refletir exatamente a tabela da seção 3.

## 1. Papéis

| Nível | Papéis | Onde mora | Observação |
|---|---|---|---|
| Organização | `owner`, `admin`, `member` | `organization_memberships.role` | Um Owner por organização no primeiro escopo. |
| Equipe | `leader`, `member` | `team_memberships.role` (novo no B2) | Papel **por equipe**: a mesma pessoa pode ser Líder numa equipe e Membro em outra. |
| Status do membro | `active`, `inactive` (persistidos) | `team_memberships.status` (novo no B2) | `pending_invite` (Blueprint §53) **não é persistido**: é derivado de `organization_invites` (convite não aceito, sem `user_id`) e só aparece como estado de leitura/UX. |

Papel de acesso **não** é função musical (ADR-016). Funções (`team_musical_functions`) não concedem nenhuma capacidade.

## 2. Regras gerais

1. **O banco decide.** Toda capacidade é verificada no PostgreSQL (RLS e RPCs `security definer`) por `app.has_permission(p_organization_id, p_team_id, p_capability)`. Negação por padrão: capacidade desconhecida ou contexto inconsistente retorna `false`.
2. **O espelho TypeScript (`permissions.ts`) serve só para UX** (mostrar ou esconder ações, desabilitar botões, mensagens). Ele nunca substitui a verificação do banco, e a UI nunca é a única barreira (Blueprint §49, §50; NFR-005).
3. **Escopo.** Cada capacidade tem um escopo: *organização*, *equipe* ou *próprio recurso*. Ser Líder de uma equipe não concede nada em outra equipe.
4. **Recurso próprio.** "Próprio" significa criado pelo usuário (`songs.user_id`, `repertoires.created_by_user_id`). As capacidades `*_own` só valem para o recurso criado por quem age; a checagem do dono do recurso fica na política/RPC, não em `app.has_permission`. A autoria (e a organização) é **imutável**: trigger barra a mudança por `update`, senão quem edita viraria dono e ganharia `*.delete_own`.
5. **Regras que dependem do alvo** (por exemplo, o papel do membro que sofre a ação) ficam na RPC, que escolhe a capacidade adequada (ver `team_member.set_status` × `team_member.set_leader_status`).
6. **Membro `inactive`.** Quem está `inactive` em uma equipe não exerce nenhuma capacidade nela e não pode ser editado pelo Líder dela. Detalhes na seção 4.
7. **Identidade.** SQL usa `app.current_user_id()`, nunca `auth.uid()` (ADR-049). Nenhuma permissão é lida de claims do token.
8. **Cache local não é autorização** (Blueprint §50.3). Mutações offline sobem pela fila e são validadas no servidor. Exceção: papel, status e funções musicais de outros mudam **só online**, por RPC, sem fila (erro de rede não altera a tela).
9. **`role` e `status` são protegidos por trigger.** RLS não compara valor antigo; por isso `team_memberships.role` e `.status` só mudam por RPC `security definer` (trigger `before insert or update` barra o resto) e o **criador da equipe vira Líder no servidor** (trigger em `teams`), nunca por escrita do cliente. Reforço por coluna: `cantum_user` só grava `id, team_id, user_id, created_at, updated_at` em `team_memberships`. Ver ADR-051.

## 3. Capacidades e matriz papel × capacidade

Legenda: ✅ permitido · ❌ negado · **L** = permitido ao Líder **ativo da equipe do contexto** · **L\*** = permitido ao Líder ativo de **alguma** equipe da organização · **P** = só no próprio recurso.

### 3.1 Organização

| Capacidade | Escopo | Owner | Admin | Líder | Membro | Notas |
|---|---|:-:|:-:|:-:|:-:|---|
| `organization.edit` (renomear) | organização | ✅ | ✅ | ❌ | ❌ | Decisão 1. Hoje só o Owner atualiza. |
| `organization.delete` | organização | ✅ | ❌ | ❌ | ❌ | Só o Owner exclui. |

**Vínculo de organização (`organization_memberships`, issue #99, `0014_org_membership_writes.sql`).** Não há escrita direta: `cantum_user` só tem SELECT e a policy `ALL` de Owner e Admin caiu. O vínculo nasce e muda só por função `security definer`: `create_organization` (Owner), `accept_organization_invite` (member ou admin do convite), `update_organization_member_role` (só `admin` ou `member`; nunca vira nem deixa de ser `owner`) e `remove_organization_member` (nunca remove o Owner), ambas só para Owner e Admin **da própria organização**: quem não tem vínculo nela, mesmo com o uuid do vínculo, recebe `not authorized` (a checagem tratava papel nulo como permitido até a 0014) e `delete_my_account` (bloqueia o único Owner, D4). Logo a organização nunca fica sem Owner, e nenhum papel vira `owner` fora de uma troca de Owner (seção 6). O cliente só lê o vínculo (sync pull). Os cascades de organização e usuário rodam como dono da tabela.

### 3.2 Equipes e pessoas

| Capacidade | Escopo | Owner | Admin | Líder | Membro | Notas |
|---|---|:-:|:-:|:-:|:-:|---|
| `team.create` | organização | ✅ | ✅ | ❌ | ❌ | Decisão 2. O criador vira `leader` da equipe criada, **criado pelo servidor** (trigger em `teams`), nunca por escrita do cliente. |
| `team.rename` | equipe | ✅ | ✅ | **L** | ❌ | Decisão 2. |
| `team.delete` | equipe | ✅ | ✅ | ❌ | ❌ | Decisão 2. |
| `team_member.add` | equipe | ✅ | ✅ | **L** | ❌ | Adiciona como `member`, e só quem **já é membro da organização** (quem não é entra por convite). Tornar Líder exige `team_member.set_role`. Também lista os convites pendentes da equipe. |
| `team_member.set_status` | equipe | ✅ | ✅ | **L** | ❌ | Inativar e reativar **membros não Líderes**. Decisão confirmada. |
| `team_member.set_leader_status` | equipe | ✅ | ✅ | ❌ | ❌ | Inativar e reativar um **Líder**. Um Líder inativo só é reativado por Owner ou Admin. |
| `team_member.set_role` | equipe | ✅ | ✅ | ❌ | ❌ | Promover e rebaixar Líder. Decisão 3. |
| `team_member.set_functions` | equipe | ✅ | ✅ | **L** | ❌ | Funções de **qualquer membro** da equipe. Decisão 5. |
| `team_member.set_own_functions` | equipe | ✅ | ✅ | **L** | **P** | Funções do próprio vínculo. Decisão 5. |
| `team_member.remove` | equipe | ✅ | ✅ | **L** | ❌ | B8 (VS-07 RN-07, ADR-063). Apaga o vínculo e as atribuições **futuras** da equipe; mantém conta e autoria; grava `admin_events`. O Líder remove só `member` (Líder só por Owner ou Admin); ninguém remove a si mesmo (sair é a exclusão de conta); Admin não remove Owner, e o Líder não remove quem é Owner/Admin da organização. RPC `team_member_remove`. `admin_events` é apagado em cascata com a organização; a remoção apaga escalas futuras em qualquer status. O delete direto de `team_memberships` foi revogado na 0011 (policy e grant); os cascades de equipe, organização e usuário seguem. |

### 3.3 Biblioteca, repertório e execução

| Capacidade | Escopo | Owner | Admin | Líder | Membro | Notas |
|---|---|:-:|:-:|:-:|:-:|---|
| `song.create` | organização | ✅ | ✅ | ✅ | ✅ | Decisão 4. Criar música pessoal é livre; `song.create` é exigido para **copiar** uma música pessoal para a organização (`copy_song_to_organization`; a cópia é uma música **da organização**, ADR-062). A música pessoal é só do dono. Na cópia: `song.edit` (Owner, Admin, L\*) ou o autor editam; `song.delete` (Owner, Admin) ou o autor excluem. |
| `song.edit` | organização | ✅ | ✅ | **L\*** | ❌ | Qualquer música da organização. O Líder **edita** a biblioteca como Owner e Admin, mas não exclui o que é de outra pessoa. |
| `song.edit_own` | próprio recurso | ✅ | ✅ | ✅ | **P** | |
| `song.delete` | organização | ✅ | ✅ | ❌ | ❌ | Só Owner e Admin excluem o que é de outra pessoa (decisão do Jota). O Líder exclui só o que criou (`song.delete_own`). |
| `song.delete_own` | próprio recurso | ✅ | ✅ | ✅ | **P** | |
| `repertoire.create` | organização | ✅ | ✅ | ✅ | ✅ | Decisão 4. |
| `repertoire.edit` | organização | ✅ | ✅ | **L\*** | ❌ | Inclui itens do repertório. |
| `repertoire.edit_own` | próprio recurso | ✅ | ✅ | ✅ | **P** | |
| `repertoire.delete` | organização | ✅ | ✅ | ❌ | ❌ | Mesma regra de `song.delete`. |
| `repertoire.delete_own` | próprio recurso | ✅ | ✅ | ✅ | **P** | |
| `repertoire.import_personal` | organização | ✅ | ✅ | **L\*** | ❌ | Copia um **repertório pessoal do próprio usuário** para a organização, criando cópias das músicas para a organização (reaproveita a cópia que já existir; ADR-062). Só online, por RPC. Nada fica ligado à origem. |
| `stage.run` | organização | ✅ | ✅ | ✅ | ✅ | Executar o Modo Palco. A autorização do operador (MD) do Stage não muda neste bloco. |
| `stage.start` | equipe | ✅ | ✅ | **L** | ❌ | Iniciar o Palco do serviço (`create_target_stage_session`). Decisão D4 do Jota, 2026-10-15: antes só Owner e Admin; agora também o **Líder ativo da equipe do serviço**. O Membro executa o Palco, mas não o inicia. |

**Capacidade do próprio titular (fora da matriz):** `export_my_data` — qualquer usuário autenticado exporta em JSON só os próprios dados (perfil, vínculos, músicas e repertórios pessoais, escalas, disponibilidade). Sem parâmetro: usa `app.current_user_id()`; anônimo negado. Fora do export: senha, sessões, tokens, dados de outras pessoas e cópias do Ministério (conteúdo da organização). Só online (RPC). Grava `account.export` em `admin_events` (um por organização do titular, sem conteúdo).

**Aceite de Política e Termos** (B8 fatia 3, `0015_user_consents.sql`, RN-01/D7, N9): `user_consents` é append-only; o dono lê só o próprio aceite (RLS) e `cantum_user` não tem INSERT, UPDATE nem DELETE (N9). `record_consent(document, version)` (`privacy` ou `terms`; qualquer usuário autenticado; anônimo negado) é idempotente por usuário+documento+versão e recusa versão que não é a vigente (`app.current_consent_version()`). O cadastro (`POST /auth/signup`) exige `consentVersion` e grava os dois documentos na mesma transação por `app.accept_consents` (sem EXECUTE para `cantum_user`): sem aceite ou com versão errada o servidor responde 400 e não cria a conta. `app.consent_pending` alimenta `user.consentRequired` em `/auth/login` e `/auth/session`; com versão nova, a UI pede o re-aceite (D7) antes de abrir o app. O re-aceite (D7) é barreira de UI: o servidor não bloqueia `/rpc` nem `/sync` para versão desatualizada, e o Palco (`/stage/*`) nunca é barrado. Uma aba já aberta só vê `consentRequired` no próximo `/auth/session` ou login. A exclusão da conta apaga o aceite em cascata.

**Idade mínima de 16 anos** (B8 fatia 8, `0016_minimum_age.sql`, RN-10/D1): a constante vive em `app.minimum_account_age()` (espelhada em `src/domain/privacy/age.ts`). O cadastro exige a autodeclaração `ageDeclared: true`; ela é gravada em `user_consents` como documento `age` (versão vigente), junto de `privacy` e `terms`, por `app.accept_consents(user, version, age_declared)` na mesma transação do cadastro (sem EXECUTE para `cantum_user`; `record_consent` não aceita `age`). Sem a declaração, `/auth/signup` responde 400 e não cria a conta. Não há data de nascimento nem verificação de idade, e `consent_pending` ignora `age`: contas existentes não são barradas e a versão do consentimento não sobe. Convites não contornam a regra (conta nova passa pelo mesmo cadastro). Sem “participante sem conta” de menor: o Líder não adiciona menores de 16 anos.

**Exclusão da própria conta** (B8 fatia 5, ADR-063): `delete_my_account()`, sem parâmetro (usa `app.current_user_id()`; anônimo negado; `cantum_anon` sem EXECUTE). Vale para qualquer usuário autenticado, inclusive membro `inactive` (N8). Só online (RPC). Grava `account.delete` em `admin_events` (um por organização do titular, sem conteúdo).
- **Bloqueio (D4):** o único Owner de qualquer organização não exclui; erro `sole owner of an organization: transfer ownership first`, nada é alterado. A checagem trava os Owners da organização para que dois Owners não saiam ao mesmo tempo.
- **Reatribuído ao sentinela "Ex-membro" (D2, `app.deleted_user_id()`):** cópias de música do Ministério (inclusive apagadas logicamente; `source_song_id` zerado e `updated_at` novo), repertórios e serviços da organização (inclusive concluídos). A autoria continua imutável para `cantum_user`; só o dono da tabela (funções `security definer`) a troca.
- **Apagado na hora (D3):** o usuário e o e-mail, músicas e repertórios pessoais, vínculos de organização e equipe (e funções), **todas** as escalas (futuras e passadas; a vaga fica aberta), disponibilidade, convites emitidos (guardam e-mail de terceiro), sessões e tokens. Eventos de `admin_events` em que era autor ou alvo perdem o titular.
- **Palco aberto:** a sessão continua `live`; se o titular era o MD, `md_user_id` fica nulo e a `revision` do estado sobe (os assinantes recebem o snapshot). Ainda não existe RPC para outra pessoa assumir como MD.
- **Sentinela:** sem senha nem e-mail verificado (check do banco, vale para redefinição de senha), sem sessão e sem vínculo; nunca aparece em listas de membros, convites, escalas ou seletor.
- **Log (RN-09):** um `admin_events` `account.delete` por organização do titular, sem titular e sem conteúdo. Usuário sem organização não gera evento. `export_my_data` grava `account.export` do mesmo jeito (autor e alvo = titular, que vira nulo na exclusão).
- **Pendência:** `user_consents` (fatia 3) precisa nascer com `references app.users(id) on delete cascade`, senão a exclusão falha (alto, não silencioso).

**Repertório pessoal** (ADR-062): não passa por `app.has_permission`. Vale `created_by_user_id = app.current_user_id()` e `organization_id` nulo: só o dono lê, edita e exclui, em qualquer papel (Owner e Admin da organização não o veem). Os itens só aceitam músicas da biblioteca do dono.

### 3.4 Serviço (B3 — ADR-052 `Accepted`)

Escopo de equipe = **equipe do serviço** (`services.team_id`). Spec: [`VS-02-servico.md`](specs/VS-02-servico.md).

| Capacidade | Escopo | Owner | Admin | Líder | Membro | Notas |
|---|---|:-:|:-:|:-:|:-:|---|
| `service.create` | equipe | ✅ | ✅ | **L** | ❌ | Nasce `draft`. |
| `service.edit` | equipe | ✅ | ✅ | **L** | ❌ | Informações e ordem (`service_items`). Negado em `completed`/`cancelled`. |
| `service.transition` | equipe | ✅ | ✅ | **L** | ❌ | Só pela RPC `transition_service`; `status` protegido por trigger de guarda. |
| `service.delete` | equipe | ✅ | ✅ | **L** (só `draft`) | ❌ | Fora de `draft`, o Líder cancela (decisão do owner, 2026-10-09). |

Leitura de serviços e da ordem: membro **ativo na organização** (seção 4), sem capacidade própria.

### 3.5 Escala e disponibilidade (B4 — proposta, ADR-053 `Proposed`)

Escopo de equipe = **equipe do serviço** (`services.team_id`). Spec: [`VS-03-escala.md`](specs/VS-03-escala.md).

| Capacidade | Escopo | Owner | Admin | Líder | Membro | Notas |
|---|---|:-:|:-:|:-:|:-:|---|
| `schedule.manage` | equipe | ✅ | ✅ | **L** | ❌ | Definir vagas, atribuir (só membro **ativo da equipe**), substituir, cancelar e pedir substituição de outra pessoa. Negado em serviço `completed`/`cancelled`. Mudanças de estado só por RPC. |
| `schedule.respond` | próprio recurso | **P** | **P** | **P** | **P** | Confirmar, recusar ou pedir substituição da **própria** atribuição. Vale para qualquer papel, mas **só o titular**, ativo. Ninguém responde por outra pessoa. Não passa por `app.has_permission`: a RPC compara `assignments.user_id` com `app.current_user_id()`. |
| `availability.set_own` | organização | **P** | **P** | **P** | **P** | Informar disponibilidade por dia **só do próprio** usuário, ativo na organização. |
| `availability.read` | alvo | **P** | **P** | **P** | **P** | Ler a disponibilidade de um membro: o próprio, ou Owner, Admin e Líder ativo de uma equipe da qual o alvo é membro (`app.can_read_availability`). Membro comum não lê a de outros. Não passa por `app.has_permission`. |

Leitura de vagas e atribuições (quem está escalado): membro **ativo** na organização (seção 4), sem capacidade própria (proposta, decisão do owner).

Capacidades ainda fora (Network, solicitações externas) seguem o Blueprint §49 e entram no B10.

## 4. Membro `inactive`, Líder inativo e quem está "ativo"

- **Escopo de equipe** (seção 3.2): para o papel Líder ou Membro, a capacidade só vale se o vínculo naquela equipe tem `status = 'active'`. `inactive` não exerce nada. Convite pendente (derivado de `organization_invites`) não gera vínculo e não exerce nada.
- **Líder inativo** perde todos os poderes de Líder naquela equipe. Só Owner ou Admin o reativam (`team_member.set_leader_status`).
- **Membro `inactive` não é editado pelo Líder.** A única ação do Líder sobre um alvo `inactive` é reativá-lo (`team_member.set_status`), e só se o alvo não for Líder. O Líder não altera as funções de um membro inativo.
- **Escopo de organização** (`song.*`, `repertoire.*`, `stage.run`): vale para quem tem vínculo na organização e está **ativo na organização**. Define-se "ativo na organização" como: não possui vínculos de equipe naquela organização **ou** possui ao menos um com `status = 'active'`. Só `active` e `inactive` existem em `team_memberships`; convite pendente não conta como vínculo. Quem está `inactive` em todas as suas equipes não exerce capacidades de organização.
- **Exceções à regra de "ativo"** (implementação do B2): editar e excluir o **próprio** recurso (`*_own`) não exige estar ativo; funções musicais dos membros e perfis (`get_organization_member_profiles`, nome sem e-mail) exige só ser membro da organização, mesmo `inactive`. Ler as músicas da organização (cópias) exige estar **ativo** na organização (ADR-062, FIX-01).
- **L\*** exige ser Líder **ativo** de ao menos uma equipe da organização.
- **Owner e Admin** não dependem de `team_memberships`: o papel de organização basta, mesmo que tenham vínculos de equipe `inactive`.

## 5. Casos negativos obrigatórios

Cada caso vira teste de RLS/RPC no harness (`feat/team-roles-schema`) e teste de `permissions.ts`.

| # | Caso | Resultado esperado |
|---|---|---|
| N1 | Líder da equipe A tenta renomear, adicionar membro, inativar ou definir funções na equipe B | negado |
| N2 | Líder da equipe A tenta promover alguém a Líder ou rebaixar um Líder | negado |
| N3 | Líder tenta inativar ou reativar outro Líder (ou a si mesmo) | negado |
| N4 | Líder inativo tenta qualquer ação de Líder | negado |
| N5 | Líder tenta alterar funções ou papel de um membro `inactive` | negado (só reativar é permitido) |
| N6 | Membro tenta alterar as funções de outro membro | negado |
| N7 | Membro tenta editar ou excluir música ou repertório criado por outra pessoa; Líder tenta **excluir** música ou repertório criado por outra pessoa (editar é permitido) | negado |
| N8 | Membro de outra organização tenta ler ou escrever em equipe, música ou repertório | negado |
| N9 | Usuário sem membership (autenticado) tenta qualquer capacidade | negado |
| N10 | Usuário anônimo (sem `app.current_user_id()`) | negado |
| N11 | Membro `inactive` em todas as equipes tenta copiar música para a organização, criar repertório ou executar o Stage (inclui assinar o realtime e ler sessão, músicas e snapshot do Stage, também na revalidação de 60 s) | negado |
| N12 | Admin tenta excluir a organização | negado |
| N13 | Líder ou Membro tenta criar equipe | negado |
| N14 | Capacidade desconhecida, ou `p_team_id` de outra organização | `false` (negação por padrão) |
| N15 | Cliente envia `role`/`status` direto no `upsert` (sync) ou em `update` para se promover, reativar-se ou alterar outro | negado pelo **trigger de guarda** (e por privilégio de coluna, se houver); só as RPCs mudam papel e status |
| N16 | Cliente insere vínculo com `role = 'leader'` ou `status` diferente de `active` (para si ou para outro) | negado pelo trigger de guarda |
| N17 | Cliente cria a equipe e tenta inserir o próprio vínculo `leader` por escrita direta | negado; o Líder criador só existe porque o trigger em `teams` o cria no servidor |
| N18 | `update team_memberships set role/status` direto por Owner, Admin ou Líder | negado; o mesmo efeito por RPC é permitido conforme a matriz |
| N19 | `update`/`insert`/`delete` direto em `organization_memberships` por Admin (promover a si ou a outro a `owner`, rebaixar ou apagar o Owner), Owner, membro ou forasteiro | negado por privilégio (issue #99); Admin também não altera nem remove o Owner por RPC |

Casos positivos de contraste (mesmos testes): Owner, Admin, Líder da própria equipe e Membro no próprio recurso conseguem a ação correspondente.

### 5.1 Serviço (B3 — ADR-052)

| # | Caso | Resultado esperado |
|---|---|---|
| S1 | Líder da equipe A cria ou edita serviço da equipe B | negado |
| S2 | Membro cria, edita ou transiciona serviço | negado |
| S3 | `update services set status` direto (ou `upsert` do sync com `status`), por qualquer papel | negado pelo trigger de guarda; só a RPC muda o status |
| S4 | Transição inválida pela RPC (ex.: `completed → draft`) | negado |
| S5 | Serviço com `team_id` de outra organização | negado (FK composta) |
| S6 | Editar informações ou ordem de serviço `completed`/`cancelled` | negado |
| S7 | Líder exclui serviço fora de `draft` | negado |
| S8 | Líder `inactive` da equipe do serviço cria, edita, transiciona ou exclui | negado |

Contraste: Owner, Admin e Líder ativo da equipe do serviço conseguem; Membro ativo lê serviço e ordem.

### 5.2 Escala e disponibilidade (B4 — proposta, ADR-053)

| # | Caso | Resultado esperado |
|---|---|---|
| E1 | Membro confirma, recusa ou pede substituição da atribuição de **outra** pessoa | negado |
| E2 | Owner, Admin ou Líder responde (confirmar/recusar) **por** outra pessoa | negado (só o titular) |
| E3 | Líder da equipe A cria vaga, atribui, substitui ou cancela em serviço da equipe B | negado |
| E4 | Membro cria ou edita vaga, atribui ou cancela atribuição | negado |
| E5 | `insert`, `update` ou `delete` direto em `assignments` (inclui o sync), por qualquer papel | negado; só as RPCs mudam a atribuição |
| E6 | Atribuir pessoa que não é membro **ativo** da equipe do serviço (outra equipe, outra organização, `inactive`, sem vínculo) | negado |
| E7 | Transição inválida (`declined → confirmed`, `cancelled → invited`, `invited → replacement_needed`) | negado |
| E8 | Criar ou alterar vaga, atribuição ou resposta em serviço `completed`/`cancelled` | negado |
| E9 | Líder `inactive`, ou titular `inactive`, tenta agir (gerir ou responder) | negado |
| E10 | Ler a disponibilidade ou a nota de outro membro: membro comum, Líder de equipe da qual o alvo não faz parte, outra organização, anônimo; escrever a de outra pessoa | negado |
| E11 | Reduzir `quantity` abaixo das atribuições ativas, ou excluir vaga com atribuição ativa | negado |
| E12 | Segunda atribuição ativa da mesma pessoa na mesma vaga | negado (`unique` parcial) |

Contraste: Owner, Admin e Líder ativo da equipe do serviço gerem a escala; o titular ativo responde; o membro lê a escala do serviço (proposta) e escreve a própria disponibilidade.

### 5.3 Repertório pessoal, importação e início do Palco (correção FIX-01)

| # | Caso | Resultado esperado |
|---|---|---|
| F1 | Outro usuário (inclui Owner e Admin da organização) lê, edita ou exclui um repertório pessoal | negado |
| F2 | Adicionar a um repertório pessoal uma música que não é da biblioteca do dono | negado |
| F3 | Importar repertório pessoal de **outra** pessoa | negado |
| F4 | Membro (sem Líder ativo) ou Líder `inactive` importa repertório pessoal | negado |
| F5 | Importar para organização da qual o usuário não é membro | negado |
| F6 | Copiar ou importar música que não é do usuário, ou já pessoal de outra pessoa, ou copiar para organização da qual ele não é membro ativo | negado |
| F7 | Editar ou excluir a **cópia** da organização por Membro que não é o autor | negado; a música pessoal de origem nunca muda |
| F8 | Apagar a organização: as cópias e os repertórios dela somem, as músicas e os repertórios pessoais dos membros permanecem | só Owner apaga (N12); efeito conferido em teste |
| F9 | Membro, ou Líder de **outra** equipe, ou Líder `inactive`, inicia o Palco do serviço | negado |
| F10 | Líder ativo da equipe do serviço inicia o Palco (serviço `ready`/`in_progress`) | permitido |
| F11 | Escrita direta de `organization_id` em repertório pessoal para "roubar" para uma organização, ou vice-versa | negado (a mudança só ocorre pela RPC de importação, que cria cópia) |
| F12 | Atualizar uma cópia da organização trocando `user_id` (autor) ou `organization_id`, ou upsert que cria linha própria do editor em vez de editar a cópia | negado (trigger de guarda); Líder/Admin não autor editam **a mesma linha**, sem trocar o autor |

## 6. Fora do B2

- Troca ou recuperação de Owner (issue futura).
- Network (B10). Serviço: seção 3.4 (B3). Escala e disponibilidade: seção 3.5 (B4).
- Permissões granulares por recurso (ACL): rejeitado no ADR-051.

## 7. Pendências e pontos em aberto (não alterados no B2)

1. **Admin promove e rebaixa outro Admin.** Hoje `update_organization_member_role` permite que um Admin mude o papel de organização de outros membros, inclusive promover alguém a `admin` ou rebaixar outro `admin`. Isso fica **como está** no B2. Decidir em issue própria se a mudança de papel de organização passa a ser exclusiva do Owner.
2. **Blueprint §49** mostra "Gerenciar pessoas" como ✅ simples para o Líder. A exceção "Líder não promove nem rebaixa Líder" (Decisão 3) refina essa célula. O Blueprint **não** é alterado neste PR.
3. **`pending_invite` (resolvido).** O convite é uma entidade própria (`organization_invites`) e o vínculo só nasce no aceite, padrão de GitHub, Slack, Linear e Clerk/WorkOS. O banco persiste só `active | inactive`; `pending_invite` é derivado do convite aberto (`accepted_at` e `revoked_at` nulos, `expires_at > now()`). `organization_invites.team_id` **já é `not null`** (migration `20260920120000`): todo convite já tem equipe de destino, sem mudança de schema. Garantias existentes mantidas: token de 256 bits guardado só como hash SHA-256, uso único com `for update`, expiração padrão de 7 dias (máx. 30), revogação e e-mail opcional conferido no aceite. Endurecimento no PR de schema: (a) convite **sem e-mail** (link) só concede `member`; `admin` exige convite com e-mail ou promoção depois; (b) aceite de convite com e-mail exige e-mail **verificado**; (c) só quem tem `team_member.add` na equipe lista os convites pendentes; (d) **criar** convite é só Owner e Admin; (e) convite antigo de `admin` sem e-mail foi rebaixado a `member` pela migration `0004_team_roles.sql`. Decisão do Jota (delegada), 2026-10-08; (d) e (e) na implementação.
4. **`team_member.remove` (decidido: fora do B2).** O B2 só **inativa** (`team_member.set_status`); não existe capacidade de remover vínculo de equipe. Remover e anonimizar (vínculos, autoria de música e repertório, funções) vai para o **B8** (exclusão de conta e privacidade). Até lá, o delete direto de `team_memberships` continuava restrito a Owner e Admin, sem capacidade nomeada (revogado no B8, ver `team_member.remove`). Decisão do Jota, 2026-10-01. **Atualização B8 (2026-10-17):** entregue como `team_member.remove` (tabela da seção 3), migration `0011_member_remove.sql`
5. **Excluir música ou repertório de outra pessoa (resolvido).** O Líder **edita** o que é de outra pessoa, mas só Owner e Admin o **excluem** (`song.delete` e `repertoire.delete`: Líder ❌). `*.delete_own` permanece para todos. Decisão do Jota, 2026-10-01.
6. **Dono da música (revisto):** o B2 adotou a alternativa A (o usuário é dono; a organização vincula). Em 2026-10-15 o [ADR-062](adr/ADR-062-repertorio-pessoal.md) trocou o vínculo por **cópia pertencente à organização** (`songs.organization_id`); a música pessoal segue só do usuário. Ver a spec VS-01 (nota) e FIX-01.

## 8. Mapa de implementação

| Peça | Onde | Bloco / PR |
|---|---|---|
| Matriz (este documento) | `docs/PERMISSIONS.md` | B2 PR 1 |
| `app.has_permission` + RLS/RPCs | `db/migrations/0004_team_roles.sql` | B2 PR 2 (`feat/team-roles-schema`) |
| `service.*` + RLS + `transition_service` | `db/migrations/0005_service_ops.sql` | B3 PR 2 (`feat/service-schema`) |
| `schedule.manage` + vagas + RPCs de atribuição + disponibilidade | `db/migrations/0006_schedule.sql` | B4 PR 2 (`feat/schedule-schema`) |
| Espelho `permissions.ts` | `src/domain/access/` | B2 PR 3 (`feat/team-roles-domain`) |
| Uso na UI (esconder/desabilitar) | `src/pages`, `src/components` | B2 PR 4 e PR 5 |
