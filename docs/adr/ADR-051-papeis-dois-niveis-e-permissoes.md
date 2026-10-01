# ADR-051 — Papéis em dois níveis e matriz de permissões

- **Status:** Proposed
- **Data:** 2026-10-01
- **Decisor:** Jota (owner) — aceite pendente de revisão
- **Escopo:** Autorização / Organization / Team / biblioteca
- **Bloco:** B2 (VS-01) · Decisão D2 · Requisitos RF-TEAM-001…004
- **Relacionados:** ADR-015, ADR-016, ADR-019, ADR-020, ADR-021, ADR-022, ADR-049
- **Detalhe da matriz:** [`docs/PERMISSIONS.md`](../PERMISSIONS.md)

## Contexto

O Blueprint §5 e §49 definem quatro papéis (Owner, Administrador, Líder, Membro), e o §49 marca várias células como 🟡 ("depende de permissões mais granulares"). O código atual só conhece os papéis de organização `owner | admin | member`:

- `team_memberships` não tem papel nem status;
- as políticas de equipe, vínculo, música (`organization_songs`) e repertório exigem `owner`/`admin`, então o Membro não cria música nem repertório e não existe Líder;
- as funções musicais só são editáveis pelo próprio membro (`set_my_team_musical_functions`);
- a lógica `role in ('owner','admin')` está repetida em dezenas de políticas.

O Blueprint §49–50 exige que a permissão seja verificada no banco e que a UI não seja mecanismo de segurança. O ADR-049 exige SQL portável: `app.current_user_id()` em vez de `auth.uid()` e nenhum recurso exclusivo do Supabase.

## Decisão

### D2 — dois níveis de papel

| Nível | Papéis | Armazenamento |
|---|---|---|
| Organização | `owner`, `admin`, `member` | `organization_memberships.role` (existente) |
| Equipe | `leader`, `member` | `team_memberships.role` (novo, `not null default 'member'`) |

- O papel de equipe é **por equipe**. O criador de uma equipe é `leader` dela.
- Cada vínculo de equipe tem `status` (`active | inactive | pending_invite`, Blueprint §53), `not null default 'active'`.
- Papel de acesso continua separado de função musical (ADR-016): funções não concedem capacidades.

### Capacidades nomeadas e uma única função de decisão

As capacidades (ex.: `organization.edit`, `team.rename`, `team_member.set_role`, `song.edit`) e a matriz papel × capacidade estão em `docs/PERMISSIONS.md`. A decisão no banco é tomada por uma única função:

```sql
-- Assinatura proposta (schema app, ADR-049)
create or replace function app.has_permission(
  p_organization_id uuid,
  p_team_id         uuid,   -- null para capacidades de escopo organização
  p_capability      text
) returns boolean
language plpgsql stable security definer set search_path = '';
```

Contrato:

1. **Identidade:** lê só `app.current_user_id()`. Não recebe o usuário por parâmetro, o que impede consultar permissões de terceiros. Usuário nulo retorna `false`.
2. **Negação por padrão:** capacidade desconhecida retorna `false`. Capacidade de escopo equipe com `p_team_id` nulo, ou com equipe que não pertence a `p_organization_id`, retorna `false`.
3. **Owner e Admin** (`organization_memberships.role`): têm as capacidades da matriz conforme o papel, **sem depender** de `team_memberships` nem do `status` dele.
4. **Líder** (`team_memberships.role = 'leader'`): capacidades de equipe só na equipe `p_team_id` **e** com `status = 'active'`. Capacidades de biblioteca (`song.edit`, `repertoire.edit`, `*.delete`) exigem ser Líder ativo de **alguma** equipe da organização.
5. **Membro:** capacidades de organização (`song.create`, `repertoire.create`, `stage.run`, `*_own`) exigem vínculo na organização e estar *ativo na organização*; `team_member.set_own_functions` exige vínculo `active` em `p_team_id`.
6. **Comportamento para `inactive`:**
   - Membro `inactive` em uma equipe não exerce nada naquela equipe, e o Líder não o edita (a única ação é reativar, se não for Líder).
   - Líder `inactive` perde os poderes de Líder; só Owner ou Admin o reativam (`team_member.set_leader_status`).
   - "Ativo na organização" = sem vínculos de equipe na organização **ou** com ao menos um vínculo `active`. Quem está `inactive` em todas as equipes perde as capacidades de organização para Membro. Owner e Admin não são afetados.
   - `pending_invite` não exerce capacidades.
7. **O recurso próprio** (`song.edit_own` etc.) não é decidido na função. A política verifica `created_by = app.current_user_id()` e chama `app.has_permission(..., 'song.edit_own')` para saber se o papel pode editar o próprio.
8. **Regras que dependem do alvo** (ex.: o papel do membro-alvo) ficam na RPC, que escolhe `team_member.set_status` (alvo não Líder) ou `team_member.set_leader_status` (alvo Líder).

Uso nas políticas, com `select` para o planner avaliar uma vez por consulta:

```sql
-- exemplo ilustrativo, em política de public.team_memberships
with check (
  (select app.has_permission(
    (select t.organization_id from public.teams t where t.id = team_id),
    team_id,
    'team_member.add'))
)
```

### Escrita sensível por RPC

`team_memberships.role` e `.status` só mudam por RPCs `security definer` com `set search_path = ''` e checagem interna via `app.has_permission`: `set_team_member_role`, `set_team_member_status`, `set_team_member_functions`. Políticas de escrita direta em `team_memberships` deixam de aceitar mudança desses campos (o sync cliente não promove ninguém).

### Restrições do ADR-049 (obrigatórias nesta mudança)

- SQL novo usa `app.current_user_id()`; nunca `auth.uid()`.
- Nada exclusivo do Supabase: sem Edge Functions, Vault, `pg_net`, Storage e sem `auth.jwt()` com claims customizadas. **Papéis não vão em claims do token**; são lidos das tabelas.
- A função vive no schema `app` (contrato próprio), roda em PostgreSQL padrão e é verificada em `scripts/db/verify-migrations.sh`.
- Execução concedida só a `authenticated`; `revoke all ... from public`.
- Migration aditiva, sem editar migration aplicada; tabela ou coluna nova com RLS na mesma migration.

### Espelho TypeScript

`src/domain/access/permissions.ts` reproduz a matriz como função pura para UX (esconder ou desabilitar ações). Não é fonte de segurança e tem teste de paridade com a tabela do `PERMISSIONS.md`.

## Alternativas rejeitadas

1. **Papel único por organização** (Líder como papel de organização). Rejeitada: o Líder tem poder só na própria equipe, e uma pessoa pode liderar uma equipe e ser membro de outra (Blueprint §6.1, modelo 1:N). Um papel único forçaria checagens ad hoc por equipe ou daria poder demais.
2. **ACL por recurso** (lista de permissões em cada música, repertório, serviço). Rejeitada: custo alto de modelagem, de UI e de teste, sem demanda no Blueprint. O §49 pede só uma matriz por papel; granularidade maior pode vir depois.
3. **Permissões em claims do JWT.** Rejeitada pelo ADR-049 (dependência de recurso do provedor) e porque o token envelhece em relação ao banco.
4. **Permissão só no cliente** (`permissions.ts`). Rejeitada: viola Blueprint §49–50 e NFR-005.

## Consequências

- **Positivas:** uma única fonte de decisão no banco; trocar o provedor (ADR-049) não muda a autorização; os casos negativos são testáveis de forma sistemática; a migração do B3/B4 reaproveita `app.has_permission` com novas capacidades.
- **Custos:** migration com reescrita de políticas de equipe, vínculo, `organization_songs` e repertórios; **política nova em `songs` via `organization_songs`** (a chave `(user_id, id)` torna a música uma linha por usuário, então Owner, Admin e Líder só editam a música de outra pessoa com política própria); Dexie `version()` nova e sync dos campos `role` e `status`; testes de RLS por papel × equipe × organização.
- **Riscos:** liberar dados demais ao reescrever RLS (mitigação: casos negativos obrigatórios do `PERMISSIONS.md`); divergência entre produção e repositório (B1/A0): validar no harness e aplicar antes em projeto de teste.
- **Refina o Blueprint §49** em duas células 🟡: "Gerenciar pessoas" (Líder não promove nem rebaixa Líder) e "Definir funções" (Membro só as próprias). O Blueprint não é alterado neste ADR.
- **Não altera** `update_organization_member_role` (Admin ainda muda papel de organização de outros); pendência registrada no `PERMISSIONS.md`.

## Fora do escopo

Troca e recuperação de Owner; disponibilidade e escala (B4); permissões de serviço, escala e Network (B3, B4, B10).

## Próximos passos

1. Revisão e aceite do owner (`Proposed` → `Accepted`).
2. Migration e testes de RLS (`feat/team-roles-schema`).
3. Domínio, application, Dexie e sync (`feat/team-roles-domain`).
