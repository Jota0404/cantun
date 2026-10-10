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

### 3.3 Biblioteca, repertório e execução

| Capacidade | Escopo | Owner | Admin | Líder | Membro | Notas |
|---|---|:-:|:-:|:-:|:-:|---|
| `song.create` | organização | ✅ | ✅ | ✅ | ✅ | Decisão 4. Criar música pessoal é livre; `song.create` é exigido para **vincular** a música à organização (`organization_songs`, só o dono vincula a própria). Desvincular: `song.delete` ou o dono (`song.delete_own`). |
| `song.edit` | organização | ✅ | ✅ | **L\*** | ❌ | Qualquer música da organização. O Líder **edita** a biblioteca como Owner e Admin, mas não exclui o que é de outra pessoa. |
| `song.edit_own` | próprio recurso | ✅ | ✅ | ✅ | **P** | |
| `song.delete` | organização | ✅ | ✅ | ❌ | ❌ | Só Owner e Admin excluem o que é de outra pessoa (decisão do Jota). O Líder exclui só o que criou (`song.delete_own`). |
| `song.delete_own` | próprio recurso | ✅ | ✅ | ✅ | **P** | |
| `repertoire.create` | organização | ✅ | ✅ | ✅ | ✅ | Decisão 4. |
| `repertoire.edit` | organização | ✅ | ✅ | **L\*** | ❌ | Inclui itens do repertório. |
| `repertoire.edit_own` | próprio recurso | ✅ | ✅ | ✅ | **P** | |
| `repertoire.delete` | organização | ✅ | ✅ | ❌ | ❌ | Mesma regra de `song.delete`. |
| `repertoire.delete_own` | próprio recurso | ✅ | ✅ | ✅ | **P** | |
| `stage.run` | organização | ✅ | ✅ | ✅ | ✅ | Executar o Modo Palco. A autorização do operador (MD) do Stage não muda neste bloco. |

### 3.4 Serviço (B3 — ADR-052 `Accepted`)

Escopo de equipe = **equipe do serviço** (`services.team_id`). Spec: [`VS-02-servico.md`](specs/VS-02-servico.md).

| Capacidade | Escopo | Owner | Admin | Líder | Membro | Notas |
|---|---|:-:|:-:|:-:|:-:|---|
| `service.create` | equipe | ✅ | ✅ | **L** | ❌ | Nasce `draft`. |
| `service.edit` | equipe | ✅ | ✅ | **L** | ❌ | Informações e ordem (`service_items`). Negado em `completed`/`cancelled`. |
| `service.transition` | equipe | ✅ | ✅ | **L** | ❌ | Só pela RPC `transition_service`; `status` protegido por trigger de guarda. |
| `service.delete` | equipe | ✅ | ✅ | **L** (só `draft`) | ❌ | Fora de `draft`, o Líder cancela (decisão do owner, 2026-10-09). |

Leitura de serviços e da ordem: membro **ativo na organização** (seção 4), sem capacidade própria.

Capacidades ainda fora (gerenciar escala, confirmar participação, Network) seguem o Blueprint §49 e entram nos blocos B4 e B10.

## 4. Membro `inactive`, Líder inativo e quem está "ativo"

- **Escopo de equipe** (seção 3.2): para o papel Líder ou Membro, a capacidade só vale se o vínculo naquela equipe tem `status = 'active'`. `inactive` não exerce nada. Convite pendente (derivado de `organization_invites`) não gera vínculo e não exerce nada.
- **Líder inativo** perde todos os poderes de Líder naquela equipe. Só Owner ou Admin o reativam (`team_member.set_leader_status`).
- **Membro `inactive` não é editado pelo Líder.** A única ação do Líder sobre um alvo `inactive` é reativá-lo (`team_member.set_status`), e só se o alvo não for Líder. O Líder não altera as funções de um membro inativo.
- **Escopo de organização** (`song.*`, `repertoire.*`, `stage.run`): vale para quem tem vínculo na organização e está **ativo na organização**. Define-se "ativo na organização" como: não possui vínculos de equipe naquela organização **ou** possui ao menos um com `status = 'active'`. Só `active` e `inactive` existem em `team_memberships`; convite pendente não conta como vínculo. Quem está `inactive` em todas as suas equipes não exerce capacidades de organização.
- **Exceções à regra de "ativo"** (implementação do B2): editar e excluir o **próprio** recurso (`*_own`) não exige estar ativo; ler músicas vinculadas à organização, funções musicais dos membros e perfis (`get_organization_member_profiles`, nome sem e-mail) exige só ser membro da organização, mesmo `inactive`.
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
| N11 | Membro `inactive` em todas as equipes tenta vincular música à organização, criar repertório ou executar o Stage (inclui assinar o realtime e ler sessão, músicas e snapshot do Stage, também na revalidação de 60 s) | negado |
| N12 | Admin tenta excluir a organização | negado |
| N13 | Líder ou Membro tenta criar equipe | negado |
| N14 | Capacidade desconhecida, ou `p_team_id` de outra organização | `false` (negação por padrão) |
| N15 | Cliente envia `role`/`status` direto no `upsert` (sync) ou em `update` para se promover, reativar-se ou alterar outro | negado pelo **trigger de guarda** (e por privilégio de coluna, se houver); só as RPCs mudam papel e status |
| N16 | Cliente insere vínculo com `role = 'leader'` ou `status` diferente de `active` (para si ou para outro) | negado pelo trigger de guarda |
| N17 | Cliente cria a equipe e tenta inserir o próprio vínculo `leader` por escrita direta | negado; o Líder criador só existe porque o trigger em `teams` o cria no servidor |
| N18 | `update team_memberships set role/status` direto por Owner, Admin ou Líder | negado; o mesmo efeito por RPC é permitido conforme a matriz |

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

## 6. Fora do B2

- Troca ou recuperação de Owner (issue futura).
- Disponibilidade do membro e escala (B4; RF-TEAM-005).
- Gerenciar escala, confirmar participação, Network (B4, B10). Serviço: seção 3.4 (B3).
- Permissões granulares por recurso (ACL): rejeitado no ADR-051.

## 7. Pendências e pontos em aberto (não alterados no B2)

1. **Admin promove e rebaixa outro Admin.** Hoje `update_organization_member_role` permite que um Admin mude o papel de organização de outros membros, inclusive promover alguém a `admin` ou rebaixar outro `admin`. Isso fica **como está** no B2. Decidir em issue própria se a mudança de papel de organização passa a ser exclusiva do Owner.
2. **Blueprint §49** mostra "Gerenciar pessoas" como ✅ simples para o Líder. A exceção "Líder não promove nem rebaixa Líder" (Decisão 3) refina essa célula. O Blueprint **não** é alterado neste PR.
3. **`pending_invite` (resolvido).** O convite é uma entidade própria (`organization_invites`) e o vínculo só nasce no aceite, padrão de GitHub, Slack, Linear e Clerk/WorkOS. O banco persiste só `active | inactive`; `pending_invite` é derivado do convite aberto (`accepted_at` e `revoked_at` nulos, `expires_at > now()`). `organization_invites.team_id` **já é `not null`** (migration `20260920120000`): todo convite já tem equipe de destino, sem mudança de schema. Garantias existentes mantidas: token de 256 bits guardado só como hash SHA-256, uso único com `for update`, expiração padrão de 7 dias (máx. 30), revogação e e-mail opcional conferido no aceite. Endurecimento no PR de schema: (a) convite **sem e-mail** (link) só concede `member`; `admin` exige convite com e-mail ou promoção depois; (b) aceite de convite com e-mail exige e-mail **verificado**; (c) só quem tem `team_member.add` na equipe lista os convites pendentes; (d) **criar** convite é só Owner e Admin; (e) convite antigo de `admin` sem e-mail foi rebaixado a `member` pela migration `0004_team_roles.sql`. Decisão do Jota (delegada), 2026-10-08; (d) e (e) na implementação.
4. **`team_member.remove` (decidido: fora do B2).** O B2 só **inativa** (`team_member.set_status`); não existe capacidade de remover vínculo de equipe. Remover e anonimizar (vínculos, autoria de música e repertório, funções) vai para o **B8** (exclusão de conta e privacidade). Até lá, o delete direto de `team_memberships` continua restrito a Owner e Admin, como na política atual, sem capacidade nomeada. Decisão do Jota, 2026-10-01.
5. **Excluir música ou repertório de outra pessoa (resolvido).** O Líder **edita** o que é de outra pessoa, mas só Owner e Admin o **excluem** (`song.delete` e `repertoire.delete`: Líder ❌). `*.delete_own` permanece para todos. Decisão do Jota, 2026-10-01.
6. **Dono da música (resolvido):** alternativa A (o usuário é dono; a organização vincula) no B2, com salvaguardas; a alternativa B (organização dona) vira ADR no B6. Ver a spec VS-01.

## 8. Mapa de implementação

| Peça | Onde | Bloco / PR |
|---|---|---|
| Matriz (este documento) | `docs/PERMISSIONS.md` | B2 PR 1 |
| `app.has_permission` + RLS/RPCs | `db/migrations/0004_team_roles.sql` | B2 PR 2 (`feat/team-roles-schema`) |
| `service.*` + RLS + `transition_service` | `db/migrations/` | B3 PR 2 (`feat/service-schema`) |
| Espelho `permissions.ts` | `src/domain/access/` | B2 PR 3 (`feat/team-roles-domain`) |
| Uso na UI (esconder/desabilitar) | `src/pages`, `src/components` | B2 PR 4 e PR 5 |
