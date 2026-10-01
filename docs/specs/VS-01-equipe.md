# Feature Spec — VS-01 Equipe: papéis, pessoas e funções

- **Status:** Em revisão
- **Bloco:** B2 (`docs/blocks/B2-equipe-vs01.md`)
- **Fatia vertical:** VS-01
- **Autor / data:** Claude Code, sob revisão do Jota · 2026-10-01
- **Decisão associada:** [ADR-051](../adr/ADR-051-papeis-dois-niveis-e-permissoes.md) (Proposed) · Matriz: [`docs/PERMISSIONS.md`](../PERMISSIONS.md)

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
- **RN-03** Quem cria a equipe é Líder dela. Quem cria a organização é Owner.
- **RN-04** Só Owner e Admin promovem e rebaixam Líder. O Líder não promove nem rebaixa Líder.
- **RN-05** O Líder adiciona, inativa e reativa **membros não Líderes** da própria equipe. Inativar ou reativar um Líder é de Owner e Admin.
- **RN-06** Membro `inactive` não age e não é editado pelo Líder. Líder `inactive` perde os poderes e só Owner ou Admin o reativam.
- **RN-07** O Membro define só as próprias funções. O Líder define as de qualquer membro da própria equipe. Owner e Admin definem as de qualquer um.
- **RN-08** O Membro cria música e repertório e edita ou exclui só o que criou. Líder, Admin e Owner editam e excluem qualquer um da organização.
- **RN-09** Admin renomeia a organização; só o Owner a exclui. O Líder renomeia a equipe que lidera; não exclui nem cria equipes.
- **RN-10** Convite fica `pending_invite` até ser aceito.
- **RN-11** Uma conta tem uma organização principal (Blueprint §6.1). A regra vive na UI e no caso de uso, **sem constraint de banco**, para não impedir Organization 1:N Team nem a futura multi-organização.
- **RN-12** Permissão é decidida no banco (`app.has_permission`); `permissions.ts` é só UX (Blueprint §49–50, NFR-005).
- **RN-13** Dados locais seguem isolados por usuário (ADR-048).

Detalhe de escopo, matriz e casos negativos: `docs/PERMISSIONS.md`.

## Acceptance Criteria
- [ ] Quem cria a equipe é Líder dela; o Owner promove e rebaixa Líder.
- [ ] O Líder adiciona e inativa membros e define funções **só na própria equipe**; tentar em outra equipe é negado pelo banco.
- [ ] O Membro cria música e repertório, edita as próprias funções e não altera as dos outros.
- [ ] Convite aparece como `pending_invite` até ser aceito.
- [ ] Um usuário novo completa o onboarding em até 5 passos.
- [ ] Funciona offline para leitura; mutações sobem pela fila e respeitam a autorização no servidor.
- [ ] Todos os casos negativos N1–N15 do `PERMISSIONS.md` têm teste e passam.
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
- `TeamRole = 'leader' | 'member'` e `MemberStatus = 'active' | 'inactive' | 'pending_invite'` em `src/domain/teams/`.
- `TeamMembership` ganha `role` e `status`.
- Regras de transição de status e de papel (puras): quem pode promover, rebaixar, inativar e reativar; Líder-alvo exige Owner ou Admin.
- `src/domain/access/permissions.ts`: matriz como função pura, usada só em UX, com teste de paridade com `docs/PERMISSIONS.md`.
- Respeita `AI_CONTEXT.md` §6: papel ≠ função, Organization 1:N Team, Arrangement fora.

### Arquitetura
- Camadas: `domain/access` e `domain/teams` → `application/teams` (`promoteToLeader`, `demoteToMember`, `setMemberStatus`, `setMemberFunctions`; ajuste de `createTeam` para criar o vínculo `leader`) → UI.
- Os casos de uso seguem o padrão `fn(input, repository = default)` e retornam `{ success: true, … } | { success: false, errors }`.
- ADRs: **ADR-051 (novo, Proposed)**; ADR-015/016/020/021/022; ADR-026 (sync); ADR-048; ADR-049 (SQL portável).
- Nenhum arquivo novo fora da camada de plataforma importa `@supabase/supabase-js`.

### Dados
- **SQL (Supabase/PostgreSQL), PR `feat/team-roles-schema`:**
  - `team_memberships.role text not null default 'member' check (role in ('leader','member'))` e `status text not null default 'active' check (status in ('active','inactive','pending_invite'))`; backfill: criador da equipe → `leader` (a definir no PR de schema a partir dos dados existentes, sem editar migrations aplicadas).
  - `app.has_permission(p_organization_id, p_team_id, p_capability)` conforme ADR-051; `security definer`, `set search_path = ''`, `app.current_user_id()`.
  - RPCs `set_team_member_role`, `set_team_member_status`, `set_team_member_functions` (com checagem interna).
  - Políticas: equipes (`team.rename` etc.), vínculos, `team_musical_functions` (Líder e Admin escrevem para outros), `organization_songs`, `repertoires`/`repertoire_items` (Membro cria; `*_own` por `created_by_user_id`), organização (Admin edita nome).
  - Migration aditiva `YYYYMMDDHHMMSS_*.sql`, RLS na mesma migration, validada em `scripts/db/verify-migrations.sh`.
- **Dexie:** nova `this.version(11)` (hoje a última é a 10; confirmar no PR) com `teamMemberships: 'id, teamId, userId, [teamId+userId], role, status, updatedAt'` e `upgrade()` que define `role = 'member'` e `status = 'active'` nos registros existentes (criador de equipe local → `leader` quando identificável). Teste de upgrade obrigatório. Não editar versões existentes (ADR-011).
- **Sync (`TargetSyncEngine`):** `teamMemberships` passa a mapear `role` e `status` nos dois sentidos (`toRow`/`fromRow`). A autoridade de papel e status é do servidor: o cliente muda esses campos só por RPC, e a mutação offline entra na fila e é validada ao subir; falha de autorização reverte o estado local e avisa a UI. Para os demais campos continua LWW (ADR-026).
- **RLS / permissões:** conforme `docs/PERMISSIONS.md`; a UI não é mecanismo de segurança.

## Fora do escopo
- Troca ou recuperação de Owner (issue futura).
- Disponibilidade e escala (B4); serviço (B3).
- Navegação nova (B5): usar a rota atual.
- Alterar `update_organization_member_role` (Admin muda papel de organização de outros): pendência registrada no `PERMISSIONS.md`.
- Atualizar o Blueprint §49 (refinamento "Líder não promove Líder" fica registrado no `PERMISSIONS.md` e no ADR-051).
- Múltiplas organizações por conta; constraint de banco para "organização principal".

## Plano de testes
- **Domínio / application:** transições de papel e status; `permissions.ts` por papel × capacidade com paridade com a matriz; casos de uso `promoteToLeader`, `demoteToMember`, `setMemberStatus`, `setMemberFunctions` (sucesso e `errors`); `createTeam` cria o vínculo `leader`.
- **Repositórios (fake-indexeddb):** `teamMembershipRepository` com `role` e `status`; teste de **upgrade Dexie** v10 → v11 (defaults e criador → `leader`).
- **Sync:** mapeamento `toRow`/`fromRow` de `role` e `status`; fila de mutações com rejeição do servidor (Supabase mockado).
- **UI (papel/label acessível):** onboarding (até 5 passos, regra de organização principal); tela de Equipe por papel (Owner, Admin, Líder, Membro): ações visíveis ou desabilitadas conforme `permissions.ts`, filtros, destaque de funções sem ninguém, `pending_invite`.
- **RLS / SQL (harness):** matriz owner/admin/leader/member × própria equipe × **outra equipe** × **outra organização**, mais usuário sem membership, anônimo e membro `inactive`; casos N1–N15 do `PERMISSIONS.md`; teste de que o cliente não muda `role`/`status` por escrita direta; `app.has_permission` com capacidade desconhecida e equipe de outra organização.
- **Manual:** mobile/tablet; offline (leitura e fila de mutações); fluxo do usuário novo.

## Riscos
| Risco | Mitigação |
|---|---|
| Reescrita de RLS libera dados demais | Casos negativos obrigatórios (N1–N15) no harness, revisão do diff de políticas |
| **`songs` tem chave `(user_id, id)`** (uma linha por usuário): Owner, Admin e Líder editarem a música de outra pessoa não funciona com as políticas "own" atuais | **PR `feat/team-roles-schema` precisa criar política de RLS em `songs` via `organization_songs`** (a organização vincula a música ao dono), com testes dos casos "Líder edita música de outro membro" e "Membro não edita a de outro". Avaliar também o impacto no sync de `songs`. |
| Divergência produção × repositório (B1/A0, dump pendente) | Validar a migration no harness com schema mínimo e aplicar **primeiro** num projeto Supabase de teste; sem aplicação em produção sem o Jota |
| **`pending_invite`:** o convidado ainda não tem `user_id`, e `team_memberships.user_id` é `not null` com FK | Decidir no PR de schema entre derivar o estado de `organization_invites` (sem linha pendente em `team_memberships`) ou criar a linha só na aceitação, mantendo o valor `pending_invite` no contrato; levar ao Jota antes de migrar |
| Líder único inativado, sem Líder na equipe | Permitido; Owner e Admin sempre operam a equipe. A tela de Equipe sinaliza equipe sem Líder ativo |
| Mutação offline de papel e status rejeitada ao subir | Servidor é a autoridade; reverter local e avisar na UI; teste de sync |
| Regras de "ativo na organização" complexas | Documentadas no ADR-051/`PERMISSIONS.md` §4; teste dedicado; revisão do owner no aceite do ADR |
| Admin promove ou rebaixa Admin (pendência existente) | Registrada; decidir em issue própria |

## Issues
- [ ] Épico #46 — VS-01 / Equipe
- [ ] #42 — débito `react-hooks/set-state-in-effect` (não bloqueia o B2; só não ampliar a lista de exceções)
- [ ] `feat/team-roles-schema` — migration + `app.has_permission` + RLS + testes de harness (issue a criar)
- [ ] `feat/team-roles-domain` — domínio + application + Dexie + sync + testes (issue a criar)
- [ ] `feat/team-onboarding` — onboarding guiado + organização principal (issue a criar)
- [ ] `feat/team-page` — tela de Equipe (issue a criar)
