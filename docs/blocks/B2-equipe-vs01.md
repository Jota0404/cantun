# B2 — Equipe (VS-01)

> Fase 1 · Esforço: 2–3 semanas · Depende de: B0, B1 (baseline `db/`, auth e realtime próprios; legado removido) · Requisitos: RF-TEAM-001…004 · Blueprint §5, §6, §8.1, §32.3, §49, §50, §53
> Status: **spec aceita** (ADR-051 `Accepted`; PR 1 `docs/vs-01-spec`) · revisada para o B1 em 2026-10-09

## Objetivo
Owner e Admin estruturam a organização e as equipes; o **Líder** coordena a própria equipe; o **Membro** participa, mantém suas funções e confirma presença. Cada pessoa vê claramente seu papel e suas funções.

## Estado atual
- Domínio: `OrganizationMembership.role = 'owner' | 'admin' | 'member'`; `TeamMembership { id, teamId, userId, createdAt, updatedAt }`, **sem role nem status**.
- SQL (consolidado em `db/migrations/0001_baseline.sql`; auth em `0002_auth.sql`): políticas "Organization admins can manage teams / team memberships"; funções musicais só editáveis pelo próprio membro (`set_my_team_musical_functions`); convites por organização (`create_organization_invite`, `accept_organization_invite`, que compara o e-mail mas não exige verificação). Helpers `app.is_organization_member` e `app.has_organization_role`.
- `app.users` não tem nome: a tela de Equipe mostra o `userId` e a presença do Stage usa o prefixo do e-mail (`REALTIME_CONTRACT.md`, pendência 2). O Stage aceita qualquer membro da organização, inclusive `inactive` (pendência 3).
- Dexie na v11 (stores legadas removidas).
- `teamService.createTeam` adiciona o criador como membro; `addTeamMember` não tem papel.
- UI: `OrganizationPage` (lista no plural), `OrganizationDetailPage`, `TeamPage` (183 linhas), `OrganizationInvitePage`.
- **Gaps × §49:** não existe Líder; Membro não cria música nem repertório (RLS exige owner/admin); Líder não define funções dos outros.

## Decisões
- **D2** (dois níveis). **ADR-051** formaliza papéis + matriz de permissões.
- Fonte única de permissões: `docs/PERMISSIONS.md` + função SQL `app.has_permission(p_organization_id, p_team_id, p_capability)` + espelho TS `domain/access/permissions.ts`, usado só para UX.

### Matriz §49 resolvida (decisões do owner, 2026-10-01)

Detalhe, capacidades nomeadas e casos negativos: [`docs/PERMISSIONS.md`](../PERMISSIONS.md). Decisão: [ADR-051](../adr/ADR-051-papeis-dois-niveis-e-permissoes.md) (Accepted). Spec: [`docs/specs/VS-01-equipe.md`](../specs/VS-01-equipe.md).

| Capacidade | Owner | Admin | Líder (da equipe) | Membro |
|---|:-:|:-:|:-:|:-:|
| Gerenciar organização | ✅ editar e excluir | ✅ só editar nome (✔ resolvido) | ❌ | ❌ |
| Gerenciar equipes | ✅ criar, renomear, excluir | ✅ criar, renomear, excluir | ✅ só renomear a própria; não exclui nem cria (✔ resolvido) | ❌ |
| Gerenciar pessoas da equipe | ✅ adicionar, inativar, promover Líder | ✅ idem | ✅ adicionar, inativar e reativar **membros não Líderes** da própria equipe; não promove nem rebaixa Líder (✔ resolvido) | ❌ |
| Definir funções musicais | ✅ qualquer um | ✅ qualquer um | ✅ qualquer membro da própria equipe | ✅ só as próprias (✔ resolvido) |
| Criar música | ✅ | ✅ | ✅ | ✅ |
| Editar música e repertório | ✅ | ✅ | ✅ como Owner e Admin | ✅ só o que criou (✔ resolvido) |
| Excluir música e repertório | ✅ | ✅ | ✅ só o que criou; o de outra pessoa ❌ (✔ resolvido) | ✅ só o que criou |
| Criar repertório | ✅ | ✅ | ✅ | ✅ |
| Executar Modo Palco | ✅ | ✅ | ✅ | ✅ |

Regras de `inactive`: membro `inactive` não age nem é editado pelo Líder; Líder `inactive` perde os poderes e só Owner ou Admin o reativam. Pendência conhecida (Admin muda papel de organização de outros Admins) e a decisão sobre `pending_invite` estão no `PERMISSIONS.md` §7.

## Escopo

**Entra:**
1. Spec `docs/specs/VS-01-equipe.md` + ADR-051 + `docs/PERMISSIONS.md` (revisados pelo owner **antes** do código).
2. Migration em `db/migrations/` (próximo número livre no merge; nada em `supabase/migrations`), sobre `app.is_organization_member`/`app.has_organization_role`: `team_memberships.role text not null default 'member' check (role in ('leader','member'))`; `status text not null default 'active' check (status in ('active','inactive'))`; `pending_invite` é derivado de `organization_invites`, não persistido. O criador da equipe vira `leader` **no servidor** (trigger em `teams`); `role`/`status` ficam protegidos por trigger contra escrita direta (ADR-051). `app.has_permission(...)`. Na mesma migration: `app.can_subscribe_stage_session`, `get_target_stage_snapshot`, `get_service_stage_session` e `get_service_stage_songs` passam a exigir `stage.run` (N11); aceite de convite com e-mail exige `app.users.email_verified_at`; `app.users.display_name not null` + RPCs `set_my_display_name` e `get_organization_member_profiles`.
3. RLS/RPC: substituir "admins can manage team memberships" por uma política baseada em `app.has_permission`; RPCs `set_team_member_role`, `set_team_member_status`, `set_team_member_functions` (Líder/Admin para outros). Abrir **criação de música e repertório para Membro** (§49).
4. Domínio: tipos `TeamRole`, `MemberStatus`, regras de transição; `permissions.ts` espelhando a matriz.
5. Application: `promoteToLeader`, `demoteToMember`, `setMemberStatus`, `setMemberFunctions`; convite exibido como `pending_invite` (derivado de `organization_invites`) até aceitar.
6. Dexie: nova `version(12)` com `teamMemberships` indexando `role` e `status` + upgrade (`role='member'`, `status='active'`); `TargetSyncEngine` sincronizando os campos novos.
7. **Onboarding guiado** (§6.2): sem organização → criar organização (vira Owner) → criar equipe principal (vira Líder) → convidar → definir funções. Regra "1 organização principal por conta" na UI e no caso de uso (sem constraint de banco).
8. Tela de Equipe (§32.3): membros com nome, papel, funções e status; filtros; destaque das funções sem ninguém; ações conforme permissão.
9. **Nome de exibição:** obrigatório no `POST /auth/signup` e editável depois pelo próprio usuário; `/auth/session` o devolve; tela de Equipe e presença do Modo Palco usam o nome, nunca e-mail nem `userId`.

**Não entra:** `team_member.remove` (o B2 só inativa; remover/anonimizar vai para o B8), disponibilidade (B4), escala (B4), navegação nova (B5; usar a rota atual), troca/recuperação de Owner (issue para depois).

## Entregáveis por PR
1. `docs/vs-01-spec` — spec + ADR-051 + PERMISSIONS.md.
2. `feat/team-roles-schema` — migration em `db/migrations/` + `app.has_permission` + Stage com `stage.run` + convite verificado + `display_name` + ajuste do `server/` (`/auth/signup` com nome obrigatório, `/auth/session`, allowlist) + testes em `scripts/db` e `server/` (backend-engineer). Depende do PR que cria `app.can_subscribe_stage_session` e do item do B1 "reenvio da verificação de e-mail" (`server/`, backend-engineer).
3. `feat/team-roles-domain` — domínio + application + Dexie v12/sync + `displayName` em `src/platform` + testes (core-engineer).
4. `feat/team-onboarding` — onboarding + regra de organização principal.
5. `feat/team-page` — tela de Equipe.

## Critérios de aceite
- Quem cria a equipe é Líder dela; o Owner promove e rebaixa Líder.
- O Líder adiciona e inativa membros e define funções **só na própria equipe**; tentar em outra equipe é negado pelo banco.
- O Membro cria música e repertório, edita as próprias funções e não altera as dos outros.
- Convite aparece como `pending_invite` (derivado de `organization_invites`) até ser aceito; convite com e-mail exige e-mail verificado.
- Tela de Equipe e presença do Stage mostram o nome de exibição.
- Membro `inactive` em todas as equipes não assina nem lê o Stage.
- Um usuário novo completa o onboarding em até 5 passos.
- Funciona offline para leitura; mutações sobem pela fila e respeitam a autorização no servidor.

## Testes
Unit (transições, `permissions.ts`), integração (casos de uso + Dexie), RLS em `scripts/db` (owner/admin/leader/member × outra equipe × outra organização; N11 no Stage; convite verificado; perfis), `server/` (`/auth/signup` exige nome, `/auth/session`, `forbidden` no realtime), UI (Testing Library por papel/label), upgrade Dexie v11 → v12.

## Riscos
- Ordem das migrations com o `0003_stage_realtime`: número no merge; validar no job `db`; nada em produção sem o Jota.
- Endurecer o aceite de convite trava quem não verificou o e-mail: o reenvio da verificação (item do B1) é pré-requisito.
- Mudança de RLS liberar dados demais: testes negativos obrigatórios.
