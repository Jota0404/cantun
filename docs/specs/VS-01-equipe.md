# Feature Spec — VS-01 Equipe: papéis, pessoas e funções

- **Status:** Aprovada
- **Bloco:** B2 (`docs/blocks/B2-equipe-vs01.md`)
- **Fatia vertical:** VS-01
- **Autor / data:** Claude Code, sob revisão do Jota · 2026-10-01
- **Decisão associada:** [ADR-051](../adr/ADR-051-papeis-dois-niveis-e-permissoes.md) (Accepted) · Matriz: [`docs/PERMISSIONS.md`](../PERMISSIONS.md)

## Feature
Papéis em dois níveis (organização `owner/admin/member`, equipe `leader/member`), status do membro, funções musicais gerenciáveis por Líder e Admin, criação de música e repertório pelo Membro, onboarding guiado e tela de Equipe.

## Objetivo
Owner e Admin estruturam a organização e as equipes; o Líder coordena a própria equipe; o Membro participa, mantém as próprias funções e cria conteúdo. Cada pessoa vê claramente seu papel e suas funções. Sustenta a base do MVP-Operacional (quem pode fazer o quê) para os blocos B3 e B4, e os critérios de sucesso do Blueprint §26 (itens 3 e 4: cada músico sabe o que fazer; menos dependência de WhatsApp e planilhas).

## User Stories
- Como **Owner**, quero promover e rebaixar Líderes e excluir a organização, para controlar a estrutura e a responsabilidade.
- Como **Admin**, quero renomear a organização, criar, renomear e excluir equipes, e gerenciar pessoas e funções em qualquer equipe, para operar o dia a dia sem ser Owner.
- Como **Líder**, quero adicionar, inativar e reativar membros (não Líderes) e definir as funções de qualquer membro da minha equipe, e renomear a equipe, para coordenar quem toca o quê.
- Como **Líder**, quero criar e editar músicas e repertórios da organização, para preparar o repertório da equipe.
- Como **Membro**, quero definir minhas próprias funções, para que o Líder escale a pessoa certa.
- Como **Membro**, quero criar músicas e repertórios e editar ou excluir os que criei, para contribuir com a biblioteca.
- Como **Membro**, quero ver meu papel, minhas funções e a composição da equipe, para saber meu lugar na operação.
- Como **usuário novo**, quero ser guiado de "sem organização" a "equipe pronta e convidada", para começar sem ajuda externa.

## Regras de negócio
- **RN-01** Papel de acesso ≠ função musical (ADR-016). Uma pessoa pode ter várias funções.
- **RN-02** O papel de equipe é por equipe. A mesma pessoa pode ser Líder numa equipe e Membro em outra (Blueprint §6.1).
- **RN-03** Quem cria a equipe é Líder dela, e o vínculo `leader` é criado **pelo servidor** (trigger em `teams`), nunca por escrita do cliente. Quem cria a organização é Owner.
- **RN-04** Só Owner e Admin promovem e rebaixam Líder. O Líder não promove nem rebaixa Líder.
- **RN-05** O Líder adiciona, inativa e reativa **membros não Líderes** da própria equipe. Inativar ou reativar um Líder é de Owner e Admin.
- **RN-06** Membro `inactive` não age e não é editado pelo Líder. Líder `inactive` perde os poderes e só Owner ou Admin o reativam.
- **RN-07** O Membro define só as próprias funções. O Líder define as de qualquer membro da própria equipe. Owner e Admin definem as de qualquer um.
- **RN-08** O Membro cria música e repertório e edita ou exclui só o que criou. Líder, Admin e Owner **editam** qualquer um da organização; só Owner e Admin **excluem** o que é de outra pessoa (o Líder exclui só o que criou).
- **RN-09** Admin renomeia a organização; só o Owner a exclui. O Líder renomeia a equipe que lidera; não exclui nem cria equipes.
- **RN-10** O banco só persiste `active | inactive`. O convite pendente é **derivado de `organization_invites`** (não há vínculo nem `user_id` até aceitar) e a UI o exibe como `pending_invite` até ser aceito; convite pendente não exerce capacidades.
- **RN-11** Uma conta tem uma organização principal (Blueprint §6.1). A regra vive na UI e no caso de uso, **sem constraint de banco**, para não impedir Organization 1:N Team nem a futura multi-organização.
- **RN-12** Permissão é decidida no banco (`app.has_permission`); `permissions.ts` é só UX (Blueprint §49–50, NFR-005).
- **RN-13** Dados locais seguem isolados por usuário (ADR-048).

Detalhe de escopo, matriz e casos negativos: `docs/PERMISSIONS.md`.

## Acceptance Criteria
- [ ] Quem cria a equipe é Líder dela; o Owner promove e rebaixa Líder.
- [ ] O Líder adiciona e inativa membros e define funções **só na própria equipe**; tentar em outra equipe é negado pelo banco.
- [ ] O Membro cria música e repertório, edita as próprias funções e não altera as dos outros.
- [ ] Convite aparece como `pending_invite` (derivado de `organization_invites`) até ser aceito.
- [ ] Um usuário novo completa o onboarding em até 5 passos.
- [ ] Funciona offline para leitura; mutações sobem pela fila e respeitam a autorização no servidor.
- [ ] Todos os casos negativos N1–N18 do `PERMISSIONS.md` têm teste e passam (inclui o cliente que tenta se promover ou criar o próprio vínculo `leader`).
- [ ] Membro `inactive` não age; Líder inativo perde poderes e só Owner ou Admin o reativam.
- [ ] Admin renomeia a organização e não a exclui; Líder renomeia a própria equipe e não cria nem exclui equipes.
- [ ] Tela de Equipe mostra papel, funções e status, filtros e destaque das funções sem ninguém (Blueprint §32.3).

## Requisitos
| ID | Descrição | Origem |
|---|---|---|
| RF-TEAM-001 | O sistema deve permitir criar e administrar uma equipe. | Blueprint §28 |
| RF-TEAM-002 | O sistema deve permitir convidar pessoas. | Blueprint §28 |
| RF-TEAM-003 | O sistema deve permitir associar funções às pessoas. | Blueprint §28 |
| RF-TEAM-004 | O sistema deve controlar papéis de acesso. | Blueprint §28 |
| NFR-005 | Permissões verificadas no banco; a UI não é mecanismo de segurança. | Blueprint §29, §49–50 |

RF-TEAM-005 (disponibilidade) não entra: é do B4. Os IDs conferidos acima coincidem com os do B2 (sem divergência).

Rastreio: RF-TEAM-001 → RN-03, RN-09; RF-TEAM-002 → RN-10, RN-11; RF-TEAM-003 → RN-01, RN-07; RF-TEAM-004 → RN-02, RN-04…RN-06, RN-08, RN-12.

## Impacto em domínio, arquitetura e dados

### Domínio
- `TeamRole = 'leader' | 'member'` e `MemberStatus = 'active' | 'inactive'` (os valores persistidos) em `src/domain/teams/`.
- `MemberDisplayStatus = MemberStatus | 'pending_invite'`: estado de leitura para a UI, montado a partir de `organization_invites`; não é salvo em `TeamMembership`.
- `TeamMembership` ganha `role` e `status`.
- Regras de transição de status e de papel (puras): quem pode promover, rebaixar, inativar e reativar; Líder-alvo exige Owner ou Admin.
- `src/domain/access/permissions.ts`: matriz como função pura, usada só em UX, com teste de paridade com `docs/PERMISSIONS.md`.
- Respeita `AI_CONTEXT.md` §6: papel ≠ função, Organization 1:N Team, Arrangement fora.

### Arquitetura
- Camadas: `domain/access` e `domain/teams` → `application/teams` (`promoteToLeader`, `demoteToMember`, `setMemberStatus`, `setMemberFunctions`; ajuste de `createTeam`: grava a equipe e um vínculo local **otimista** `leader`, sem enfileirá-lo; o Líder real é criado pelo servidor) → UI.
- Os casos de uso seguem o padrão `fn(input, repository = default)` e retornam `{ success: true, … } | { success: false, errors }`.
- ADRs: **ADR-051 (novo, Accepted)**; ADR-015/016/020/021/022; ADR-026 (sync); ADR-048; ADR-049 (SQL portável).
- Nenhum arquivo novo fora da camada de plataforma importa `@supabase/supabase-js`.

### Dados
- **SQL (Supabase/PostgreSQL), PR `feat/team-roles-schema`:**
  - `team_memberships.role text not null default 'member' check (role in ('leader','member'))` e `status text not null default 'active' check (status in ('active','inactive'))`. **`pending_invite` não entra no check**: é derivado de `organization_invites`.
  - **Backfill dos existentes** (`teams` não guarda o criador): proposta: o vínculo mais antigo de cada equipe vira `leader` se a pessoa for Owner ou Admin da organização; senão, nenhum Líder, e Owner/Admin promovem. Confirmar no PR de schema, sem editar migrations aplicadas.
  - **Criador da equipe:** trigger `after insert on public.teams` cria o vínculo `leader` no servidor (ADR-051). Alternativa: RPC `create_team`.
  - **Proteção de `role`/`status`:** trigger `before insert or update on public.team_memberships` barra escrita direta (RLS não compara valor antigo); RPCs `security definer` (dono da tabela) contornam por `current_user`, sem GUC; privilégios por coluna como reforço (ADR-051).
  - **Convite com equipe (proposta):** `organization_invites.team_id` nullable (aditivo), para o convite pendente aparecer na equipe e a RPC de aceitar criar o vínculo `member`/`active`.
  - `app.has_permission(p_organization_id, p_team_id, p_capability)` conforme ADR-051; `security definer`, `set search_path = ''`, `app.current_user_id()`.
  - RPCs `set_team_member_role`, `set_team_member_status`, `set_team_member_functions` (com checagem interna).
  - Políticas: equipes (`team.rename` etc.), vínculos, `team_musical_functions` (Líder e Admin escrevem para outros), `organization_songs`, `repertoires`/`repertoire_items` (Membro cria; `*_own` por `created_by_user_id`), organização (Admin edita nome).
  - Migration aditiva `YYYYMMDDHHMMSS_*.sql`, RLS na mesma migration, validada em `scripts/db/verify-migrations.sh`.
- **Dexie:** nova `this.version(11)` (hoje a última é a 10; confirmar no PR) com `teamMemberships: 'id, teamId, userId, [teamId+userId], role, status, updatedAt'` e `upgrade()` que define `role = 'member'` e `status = 'active'` nos registros existentes. O cliente **não decide** quem é Líder: o papel verdadeiro chega pelo próximo pull (servidor é a autoridade). Teste de upgrade obrigatório. Não editar versões existentes (ADR-011).
- **Sync (`TargetSyncEngine`):** `teamMemberships` passa a mapear `role` e `status` nos dois sentidos (`toRow`/`fromRow`). A autoridade de papel e status é do servidor: o cliente muda esses campos só por RPC, e a mutação offline entra na fila e é validada ao subir; falha de autorização reverte o estado local e avisa a UI. O **push de `teamMemberships` não envia `role` nem `status`** (só colunas permitidas); no **pull**, `role` e `status` sobrescrevem o valor local **sem comparar `updatedAt`** (não é LWW), e o vínculo local otimista do criador é reconciliado com o do servidor pela chave `[teamId+userId]` (ids diferentes). A equipe precisa subir antes de qualquer vínculo ou função dela na fila. Para os demais campos continua LWW (ADR-026).
- **RLS / permissões:** conforme `docs/PERMISSIONS.md`; a UI não é mecanismo de segurança.

## Decisão tomada: a música pertence ao usuário (alternativa A)

**Decidido pelo Jota em 2026-10-01: alternativa A no B2, com as salvaguardas da recomendação abaixo; a alternativa B vira um ADR no B6.** O texto seguinte registra o comparativo que embasou a decisão.

**Fatos.** `songs` tem chave `(user_id, id)`, ou seja, a linha é de um usuário. `organization_songs (organization_id, song_id)` só vincula (ADR-021: `OrganizationSong` representa que a organização "owns/uses" a música). O `AI_CONTEXT.md` §6 diz que a Organization é dona de Songs. A matriz precisa de "criador" (`song.edit_own`) e de edição por Owner, Admin e Líder em músicas de outras pessoas.

### Alternativa A — o usuário é dono; a organização vincula (modelo atual)
- **RLS:** `songs` ganha políticas de update e delete para quem tem `song.edit`/`song.delete` (esta só Owner e Admin) na organização que **vincula** a música (`exists` em `organization_songs`), além da política "own". Criador = `songs.user_id`. Risco: uma música vinculada a mais de uma organização seria editável pelo Admin de qualquer uma; exige a regra "uma música, uma organização" para edição por terceiros. Se o criador excluir a conta (`on delete cascade`), o conteúdo some da organização (depende da política de saída, B8).
- **Dexie:** pouca mudança; o cache já é por usuário (ADR-048). As músicas de outros membros precisam entrar no cache local por pull via `organization_songs`, e o registro local precisa distinguir o criador (hoje implícito: o usuário da sessão); confirmar no PR de domínio.
- **Sync:** pull de `songs` por join com `organization_songs`; push só das próprias; o `SyncEngine` legado (por `user_id`) não muda. Troca de usuário limpa o cache (ADR-048).

### Alternativa B — a organização é dona; o usuário é criador
- **RLS:** `songs` ganha `organization_id` (nullable, para a biblioteca pessoal legada) e `created_by_user_id`; as políticas passam a ser `has_permission(songs.organization_id, …)` e `created_by_user_id = app.current_user_id()` para `*_own`. Mais simples de raciocinar, e o conteúdo sobrevive à saída do criador. A chave `(user_id, id)` permanece (não se edita migration aplicada) e deixa de significar "dono"; `organization_songs` fica redundante.
- **Dexie:** `songs` ganha `organizationId` e `createdByUserId` (nova `version()` + `upgrade()` com backfill via `organizationSongs`) e índice por organização.
- **Sync:** pull por `organization_id`; o `SyncEngine` legado e as rotas de compatibilidade (ADR-036/041) continuam por `user_id` para músicas pessoais, então os dois caminhos convivem. É o maior escopo e exige emendar o ADR-021 (novo ADR).

### Decisão e salvaguardas
**A no B2**, com três salvaguardas obrigatórias: (1) criador = `songs.user_id`; (2) edição por terceiros só em música vinculada a **uma** organização (impor no #57); (3) registrar B como direção de longo prazo (alinhada ao `AI_CONTEXT.md` §6) para um ADR no B6 (modelo de música e materiais), junto com a política de saída do criador (B8). Motivo: menor mudança, aditiva, compatível com o ADR-021 `Accepted` e com o legado, e sem Dexie `version()` extra de `songs` no B2. A alternativa B fica registrada como direção de longo prazo: ADR no B6 que emenda o ADR-021, sem alterar o escopo do #57 e do #58.

## Fora do escopo
- Troca ou recuperação de Owner (issue futura).
- Disponibilidade e escala (B4); serviço (B3).
- Navegação nova (B5): usar a rota atual.
- `team_member.remove`: o B2 só inativa; remover e anonimizar vínculos e autoria vai para o **B8** (decisão do Jota, 2026-10-01).
- Alterar `update_organization_member_role` (Admin muda papel de organização de outros): pendência registrada no `PERMISSIONS.md`.
- Atualizar o Blueprint §49 (refinamento "Líder não promove Líder" fica registrado no `PERMISSIONS.md` e no ADR-051).
- Múltiplas organizações por conta; constraint de banco para "organização principal".

## Plano de testes
- **Domínio / application:** transições de papel e status; `permissions.ts` por papel × capacidade com paridade com a matriz; casos de uso `promoteToLeader`, `demoteToMember`, `setMemberStatus`, `setMemberFunctions` (sucesso e `errors`); `createTeam` grava o vínculo local otimista `leader` e não o enfileira.
- **Repositórios (fake-indexeddb):** `teamMembershipRepository` com `role` e `status`; teste de **upgrade Dexie** v10 → v11 (defaults `member`/`active`); reconciliação do vínculo otimista pelo pull.
- **Sync:** mapeamento `toRow`/`fromRow` de `role` e `status`; fila de mutações com rejeição do servidor (Supabase mockado); o push de `teamMemberships` não inclui `role`/`status`; o pull sobrescreve `role`/`status` sem olhar `updatedAt`.
- **UI (papel/label acessível):** onboarding (até 5 passos, regra de organização principal); tela de Equipe por papel (Owner, Admin, Líder, Membro): ações visíveis ou desabilitadas conforme `permissions.ts`, filtros, destaque de funções sem ninguém, `pending_invite`.
- **RLS / SQL (harness):** matriz owner/admin/leader/member × própria equipe × **outra equipe** × **outra organização**, mais usuário sem membership, anônimo e membro `inactive`; casos N1–N18 do `PERMISSIONS.md`; teste de que o cliente não muda `role`/`status` por escrita direta (insert e update) e de que as RPCs e o trigger de criação de equipe passam pelo trigger de guarda; `app.has_permission` com capacidade desconhecida e equipe de outra organização.
- **Manual:** mobile/tablet; offline (leitura e fila de mutações); fluxo do usuário novo.

## Riscos
| Risco | Mitigação |
|---|---|
| Reescrita de RLS libera dados demais | Casos negativos obrigatórios (N1–N18) no harness, revisão do diff de políticas |
| RLS não compara valor antigo: cliente se promove por upsert | Trigger `before insert or update` em `team_memberships` + RPCs `security definer`; privilégio por coluna como reforço; push do sync sem `role`/`status` (ADR-051) |
| Vínculo otimista local do criador diverge do vínculo do servidor (ids diferentes) | Reconciliar por `[teamId+userId]` no pull; `role`/`status` do servidor sempre prevalecem; teste de sync |
| **`songs` tem chave `(user_id, id)`** (uma linha por usuário): Owner, Admin e Líder editarem a música de outra pessoa não funciona com as políticas "own" atuais | **PR `feat/team-roles-schema` precisa criar política de RLS em `songs` via `organization_songs`** (a organização vincula a música ao dono), com testes dos casos "Líder edita música de outro membro" e "Membro não edita a de outro". Avaliar também o impacto no sync de `songs`. |
| Divergência produção × repositório (B1/A0, dump pendente) | Validar a migration no harness com schema mínimo e aplicar **primeiro** num projeto Supabase de teste; sem aplicação em produção sem o Jota |
| **`pending_invite`:** o convidado não tem `user_id` e `team_memberships.user_id` é `not null` com FK | **Resolvido:** estado derivado de `organization_invites`, não persistido. Em aberto no schema: `team_id` nullable em `organization_invites` para o convite aparecer na equipe e criar o vínculo ao aceitar |
| Líder único inativado, sem Líder na equipe | Permitido; Owner e Admin sempre operam a equipe. A tela de Equipe sinaliza equipe sem Líder ativo |
| Mutação offline de papel e status rejeitada ao subir | Servidor é a autoridade; reverter local e avisar na UI; teste de sync |
| Regras de "ativo na organização" complexas | Documentadas no ADR-051/`PERMISSIONS.md` §4; teste dedicado; revisão do owner no aceite do ADR |
| Admin promove ou rebaixa Admin (pendência existente) | Registrada; decidir em issue própria |

## Issues
- [ ] Épico #46 — VS-01 / Equipe
- [ ] #42 — débito `react-hooks/set-state-in-effect` (não bloqueia o B2; só não ampliar a lista de exceções)
- [ ] #57 — `feat/team-roles-schema`: migration + `app.has_permission` + RLS + testes de harness (ADR-051 aceito; o dono da música já está decidido: alternativa A)
- [ ] #58 — `feat/team-roles-domain`: domínio + application + Dexie + sync + testes
- [ ] #59 — `feat/team-onboarding`: onboarding guiado + organização principal
- [ ] #60 — `feat/team-page`: tela de Equipe
