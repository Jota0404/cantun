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
- Cada vínculo de equipe tem `status` persistido `active | inactive` (`not null default 'active'`). O estado `pending_invite` do Blueprint §53 **não é persistido** em `team_memberships`: é **derivado de `organization_invites`** (convite ainda não aceito) e exposto só como estado de leitura/UX. Convite pendente não tem `user_id`; portanto não gera vínculo nem capacidades.
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
4. **Líder** (`team_memberships.role = 'leader'`): capacidades de equipe só na equipe `p_team_id` **e** com `status = 'active'`. Capacidades de biblioteca (`song.edit`, `repertoire.edit`) exigem ser Líder ativo de **alguma** equipe da organização. O Líder **não** tem `song.delete` nem `repertoire.delete` (só Owner e Admin excluem o que é de outra pessoa); o que ele criou, exclui por `*.delete_own`.
5. **Membro:** capacidades de organização (`song.create`, `repertoire.create`, `stage.run`, `*_own`) exigem vínculo na organização e estar *ativo na organização*; `team_member.set_own_functions` exige vínculo `active` em `p_team_id`.
6. **Comportamento para `inactive`:**
   - Membro `inactive` em uma equipe não exerce nada naquela equipe, e o Líder não o edita (a única ação é reativar, se não for Líder).
   - Líder `inactive` perde os poderes de Líder; só Owner ou Admin o reativam (`team_member.set_leader_status`).
   - "Ativo na organização" = sem vínculos de equipe na organização **ou** com ao menos um vínculo `active`. Quem está `inactive` em todas as equipes perde as capacidades de organização para Membro. Owner e Admin não são afetados.
   - Convite pendente (`organization_invites`) não gera vínculo e não exerce capacidades. Só `active` e `inactive` entram nas regras de "ativo".
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

`team_memberships.role` e `.status` só mudam por RPCs `security definer` com `set search_path = ''` e checagem interna via `app.has_permission`: `set_team_member_role`, `set_team_member_status`, `set_team_member_functions`. A proteção contra escrita direta é feita por trigger (seção abaixo), não por RLS.

### Criação de equipe: o Líder criador nasce no servidor

O criador de uma equipe vira `leader` **no servidor**, nunca por escrita do cliente (RN-03; casos N15–N17).

- **Mecanismo recomendado:** trigger `after insert on public.teams` (função `security definer`, `set search_path = ''`, schema `app`) que insere em `team_memberships` o vínculo `(team_id, app.current_user_id(), 'leader', 'active')` com `on conflict (team_id, user_id) do nothing`. Sem usuário (`app.current_user_id()` nulo, ex.: migration), não cria nada. A permissão de criar equipe (`team.create`) continua na política de insert em `teams`.
- **Por que trigger e não RPC `create_team`:** o app é local-first e a criação de equipe já sobe pela fila como insert em `teams` (ADR-026). O trigger preserva esse caminho, inclusive offline, sem uma operação nova na fila. A alternativa equivalente é uma RPC `create_team(p_id, p_organization_id, p_name)` atômica (checa `team.create`, insere equipe e vínculo), ao custo de uma operação especial na fila e na reconciliação. Recomendação: trigger; trocar por RPC se o owner preferir uma operação explícita.
- **Cliente:** `createTeam` grava a equipe local e um vínculo local **otimista** `leader` (só para UX offline) e **não enfileira** esse vínculo. O vínculo do servidor chega no pull e substitui o local pela chave `[teamId+userId]` (os ids diferem).
- Quem cria a equipe (Owner ou Admin, que são os únicos com `team.create`) vira Líder dela; Owner e Admin continuam podendo tudo independentemente disso.

### Proteção de `role` e `status` contra escrita direta

Uma política RLS `with check` enxerga só a linha nova e **não compara com o valor antigo**; um `upsert` do sync (ou do PostgREST) com `role = 'leader'` passaria numa política que apenas confere "é Líder da equipe" ou `team_member.add`. O controle normativo é um trigger:

1. **Trigger `before insert or update on public.team_memberships`** (função `app.guard_team_membership()`), aplicado a toda escrita que não venha de uma função autorizada:
   - **insert:** `role` tem de ser `'member'` e `status` `'active'`; qualquer outro valor levanta `insufficient_privilege`.
   - **update:** `new.role is distinct from old.role` ou `new.status is distinct from old.status` levanta `insufficient_privilege`; `team_id` e `user_id` são imutáveis.
2. **Como as RPCs contornam:** `set_team_member_role`, `set_team_member_status`, `set_team_member_functions`, o trigger de criação de equipe e a RPC de aceitar convite são `security definer`, de propriedade do papel dono da tabela. O trigger de guarda libera a escrita quando `current_user` é o dono da tabela (`pg_class.relowner`), isto é, quando ela acontece dentro de uma função definer. Clientes (`authenticated` e o papel da API no backend próprio) executam como outro papel e são barrados. **Sem GUC/flag de sessão como bypass:** uma flag pode ser definida por quem consegue executar SQL na sessão e é fácil de esquecer ligada. As RPCs checam `app.has_permission` e a transição antes de escrever.
3. **Reforço recomendado (cinto e suspensório):** privilégios por coluna: `revoke insert, update on public.team_memberships from authenticated;` `grant insert (id, team_id, user_id, created_at, updated_at)`; `grant update (updated_at)`. Assim, o cliente que enviar `role` ou `status` recebe `permission denied`. **Não basta sozinho:** depende de grants que podem mudar na troca de provedor (ADR-049, Fase B), e `insert … on conflict do update` exige privilégio em todas as colunas do `set`. Trigger é o controle normativo; grants são defesa adicional.
4. **Sync:** o `TargetSyncEngine` **não envia** `role` nem `status` no push de `teamMemberships` (só lê no pull) e envia apenas colunas permitidas. Se enviar, o servidor nega (falha fechada).
5. **Delete:** sem mudança neste ADR (ver o ponto em aberto `team_member.remove` no `PERMISSIONS.md`).

Testes no harness: N15–N18; `update … set role/status` direto como Líder, Admin e Owner → negado; via RPC → permitido conforme a matriz.

### Restrições do ADR-049 (obrigatórias nesta mudança)

- SQL novo usa `app.current_user_id()`; nunca `auth.uid()`.
- Nada exclusivo do Supabase: sem Edge Functions, Vault, `pg_net`, Storage e sem `auth.jwt()` com claims customizadas. **Papéis não vão em claims do token**; são lidos das tabelas.
- A função vive no schema `app` (contrato próprio), roda em PostgreSQL padrão e é verificada em `scripts/db/verify-migrations.sh`.
- Execução concedida só a `authenticated`; `revoke all ... from public`.
- Migration aditiva, sem editar migration aplicada; tabela ou coluna nova com RLS na mesma migration.

### Espelho TypeScript

`src/domain/access/permissions.ts` reproduz a matriz como função pura para UX (esconder ou desabilitar ações). Não é fonte de segurança e tem teste de paridade com a tabela do `PERMISSIONS.md`.

## Decisão tomada: a música pertence ao usuário (alternativa A)

**Decidido pelo Jota em 2026-10-01.** No B2, a música continua sendo do usuário (`songs.user_id` = criador) e a organização a vincula por `organization_songs` (compatível com o ADR-021). Salvaguardas obrigatórias: (1) criador = `songs.user_id`; (2) edição por terceiros (Owner, Admin, Líder) só em música vinculada a **uma** organização, imposta no PR `feat/team-roles-schema` (#57); (3) a alternativa B (organização dona da música) vira um **ADR no B6**, junto com a política de saída do criador (B8). O comparativo, o impacto em RLS, Dexie e sync (ADR-048) e a justificativa estão em [`docs/specs/VS-01-equipe.md`](../specs/VS-01-equipe.md#decisão-tomada-a-música-pertence-ao-usuário-alternativa-a). O aceite deste ADR ainda depende da sua revisão.

## Alternativas rejeitadas

1. **Papel único por organização** (Líder como papel de organização). Rejeitada: o Líder tem poder só na própria equipe, e uma pessoa pode liderar uma equipe e ser membro de outra (Blueprint §6.1, modelo 1:N). Um papel único forçaria checagens ad hoc por equipe ou daria poder demais.
2. **ACL por recurso** (lista de permissões em cada música, repertório, serviço). Rejeitada: custo alto de modelagem, de UI e de teste, sem demanda no Blueprint. O §49 pede só uma matriz por papel; granularidade maior pode vir depois.
3. **Permissões em claims do JWT.** Rejeitada pelo ADR-049 (dependência de recurso do provedor) e porque o token envelhece em relação ao banco.
4. **Permissão só no cliente** (`permissions.ts`). Rejeitada: viola Blueprint §49–50 e NFR-005.

## Consequências

- **Positivas:** uma única fonte de decisão no banco; trocar o provedor (ADR-049) não muda a autorização; os casos negativos são testáveis de forma sistemática; a migração do B3/B4 reaproveita `app.has_permission` com novas capacidades.
- **Custos:** migration com reescrita de políticas de equipe, vínculo, `organization_songs` e repertórios; trigger de criação de equipe e trigger de guarda de `role`/`status`; **política nova em `songs`** (a chave `(user_id, id)` torna a música uma linha por usuário; segue a alternativa A decidida: edição por terceiros via `organization_songs`, música vinculada a uma só organização); Dexie `version()` nova e sync dos campos `role` e `status`; testes de RLS por papel × equipe × organização.
- **Riscos:** liberar dados demais ao reescrever RLS (mitigação: casos negativos obrigatórios do `PERMISSIONS.md`); divergência entre produção e repositório (B1/A0): validar no harness e aplicar antes em projeto de teste.
- **Refina o Blueprint §49** em duas células 🟡: "Gerenciar pessoas" (Líder não promove nem rebaixa Líder) e "Definir funções" (Membro só as próprias). O Blueprint não é alterado neste ADR.
- **Não altera** `update_organization_member_role` (Admin ainda muda papel de organização de outros); pendência registrada no `PERMISSIONS.md`.

## Fora do escopo

Troca e recuperação de Owner; remover e anonimizar vínculos e autoria (`team_member.remove`, B8); disponibilidade e escala (B4); permissões de serviço, escala e Network (B3, B4, B10).

## Próximos passos

1. Revisão e aceite do owner (`Proposed` → `Accepted`).
2. Migration e testes de RLS (`feat/team-roles-schema`).
3. Domínio, application, Dexie e sync (`feat/team-roles-domain`).
