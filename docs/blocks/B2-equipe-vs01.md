# B2 — Equipe (VS-01)

> Fase 1 · Esforço: 2–3 semanas · Depende de: B0 · Requisitos: RF-TEAM-001…004 · Blueprint §5, §6, §8.1, §32.3, §49, §50, §53

## Objetivo
Owner e Admin estruturam a organização e as equipes; o **Líder** coordena a própria equipe; o **Membro** participa, mantém suas funções e confirma presença. Cada pessoa vê claramente seu papel e suas funções.

## Estado atual
- Domínio: `OrganizationMembership.role = 'owner' | 'admin' | 'member'`; `TeamMembership { id, teamId, userId, createdAt, updatedAt }`, **sem role nem status**.
- SQL (`20260920100000`, `…120000`, `…130000`): políticas "Organization admins can manage teams / team memberships"; funções musicais só editáveis pelo próprio membro (`set_my_team_musical_functions`); convites por organização (`create_organization_invite`, `accept_organization_invite`).
- `teamService.createTeam` adiciona o criador como membro; `addTeamMember` não tem papel.
- UI: `OrganizationPage` (lista no plural), `OrganizationDetailPage`, `TeamPage` (183 linhas), `OrganizationInvitePage`.
- **Gaps × §49:** não existe Líder; Membro não cria música nem repertório (RLS exige owner/admin); Líder não define funções dos outros.

## Decisões
- **D2** (dois níveis). **ADR-051** formaliza papéis + matriz de permissões.
- Fonte única de permissões: `docs/PERMISSIONS.md` + função SQL `app.has_permission(p_organization_id, p_team_id, p_capability)` + espelho TS `domain/access/permissions.ts`, usado só para UX.

### Matriz §49 resolvida (proposta; ⚠ = confirmar com o owner)

| Capacidade | Owner | Admin | Líder (da equipe) | Membro |
|---|:-:|:-:|:-:|:-:|
| Gerenciar organização (nome, excluir) | ✅ | ⚠ só editar nome | ❌ | ❌ |
| Gerenciar equipes (criar/renomear/excluir) | ✅ | ✅ | ⚠ renomear a própria | ❌ |
| Gerenciar pessoas da equipe (adicionar, inativar, promover Líder) | ✅ | ✅ | ✅ na própria, exceto promover Líder | ❌ |
| Definir funções musicais | ✅ | ✅ | ✅ na própria | ⚠ só as próprias |
| Criar música / editar biblioteca | ✅ | ✅ | ✅ | ✅ criar · ⚠ editar só as que criou |
| Criar repertório | ✅ | ✅ | ✅ | ✅ |
| Executar Modo Palco | ✅ | ✅ | ✅ | ✅ |

## Escopo

**Entra:**
1. Spec `docs/specs/VS-01-equipe.md` + ADR-051 + `docs/PERMISSIONS.md` (revisados pelo owner **antes** do código).
2. Migration: `team_memberships.role text not null default 'member' check (role in ('leader','member'))`; `status text not null default 'active' check (status in ('active','inactive','pending_invite'))`. O criador da equipe vira `leader`. `app.has_permission(...)`.
3. RLS/RPC: substituir "admins can manage team memberships" por uma política baseada em `app.has_permission`; RPCs `set_team_member_role`, `set_team_member_status`, `set_team_member_functions` (Líder/Admin para outros). Abrir **criação de música e repertório para Membro** (§49).
4. Domínio: tipos `TeamRole`, `MemberStatus`, regras de transição; `permissions.ts` espelhando a matriz.
5. Application: `promoteToLeader`, `demoteToMember`, `setMemberStatus`, `setMemberFunctions`; convite com estado `pending_invite` até aceitar.
6. Dexie: nova `version()` com `teamMemberships` indexando `role` e `status` + upgrade (`role='member'`, `status='active'`); `TargetSyncEngine` sincronizando os campos novos.
7. **Onboarding guiado** (§6.2): sem organização → criar organização (vira Owner) → criar equipe principal (vira Líder) → convidar → definir funções. Regra "1 organização principal por conta" na UI e no caso de uso (sem constraint de banco).
8. Tela de Equipe (§32.3): membros com papel, funções e status; filtros; destaque das funções sem ninguém; ações conforme permissão.

**Não entra:** disponibilidade (B4), escala (B4), navegação nova (B5; usar a rota atual), troca/recuperação de Owner (issue para depois).

## Entregáveis por PR
1. `docs/vs-01-spec` — spec + ADR-051 + PERMISSIONS.md.
2. `feat/team-roles-schema` — migration + `app.has_permission` + testes RLS (harness).
3. `feat/team-roles-domain` — domínio + application + Dexie/sync + testes.
4. `feat/team-onboarding` — onboarding + regra de organização principal.
5. `feat/team-page` — tela de Equipe.

## Critérios de aceite
- Quem cria a equipe é Líder dela; o Owner promove e rebaixa Líder.
- O Líder adiciona e inativa membros e define funções **só na própria equipe**; tentar em outra equipe é negado pelo banco.
- O Membro cria música e repertório, edita as próprias funções e não altera as dos outros.
- Convite aparece como `pending_invite` até ser aceito.
- Um usuário novo completa o onboarding em até 5 passos.
- Funciona offline para leitura; mutações sobem pela fila e respeitam a autorização no servidor.

## Testes
Unit (transições, `permissions.ts`), integração (casos de uso + Dexie), RLS (owner/admin/leader/member × outra equipe × outra organização), UI (Testing Library por papel/label), upgrade Dexie.

## Riscos
- Divergência prod × repo (B1/A0 pendente): validar a migration no harness com schema mínimo e aplicar primeiro num projeto Supabase de teste.
- Mudança de RLS liberar dados demais: testes negativos obrigatórios.
