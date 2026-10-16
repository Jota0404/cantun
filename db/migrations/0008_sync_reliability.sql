-- CANTUM — FIX-01 / Fatia B: confiabilidade e permissões (PERMISSIONS.md §3.3 D4; RN-B1, RN-A8, RN-B5).
--
-- 1. repertoire_items (repertoire_id, position) deferida: a ordem sobe em lote numa transação (ADR-052).
-- 2. Sem música repetida na ordem do serviço (unique parcial); duplicados de teste removidos antes (ADR-059 §1).
-- 3. app.has_permission ganha stage.start (Owner, Admin e Líder ativo da equipe do serviço).
-- 4. create_target_stage_session checa stage.start na equipe do serviço.

alter table public.repertoire_items drop constraint repertoire_items_repertoire_id_position_key;
alter table public.repertoire_items
  add constraint repertoire_items_repertoire_id_position_key unique (repertoire_id, "position") deferrable initially deferred;

-- Mantém o item de menor posição de cada música repetida. Apagar o item também apaga em cascata as
-- escalas (assignments.service_item_id, baseline) e zera os ponteiros do Palco por FK (SET NULL);
-- a guarda do operador exige usuário autenticado, que numa migration não existe (como na 0007).
alter table public.stage_session_states disable trigger stage_session_states_operator_guard;
delete from public.service_items si
using (
  select id, row_number() over (partition by service_id, song_id order by "position", id) as n
  from public.service_items where type = 'song'
) d
where si.id = d.id and d.n > 1;
alter table public.stage_session_states enable trigger stage_session_states_operator_guard;
create unique index service_items_service_song_key on public.service_items (service_id, song_id) where type = 'song';

-- 3.
create or replace function app.has_permission(p_organization_id uuid, p_team_id uuid, p_capability text) returns boolean
  language plpgsql stable security definer
  set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_org_role text;
  v_team_role text;
  v_team_status text;
  v_privileged boolean;
begin
  if v_user_id is null or p_organization_id is null or p_capability is null then
    return false;
  end if;

  select om.role into v_org_role
  from public.organization_memberships om
  where om.organization_id = p_organization_id and om.user_id = v_user_id;
  if v_org_role is null then
    return false;
  end if;

  -- Equipe informada tem de ser da organização (N14), em qualquer escopo.
  if p_team_id is not null and not exists (
    select 1 from public.teams t where t.id = p_team_id and t.organization_id = p_organization_id
  ) then
    return false;
  end if;

  v_privileged := v_org_role in ('owner', 'admin');

  -- Escopo organização
  if p_capability = 'organization.delete' then
    return v_org_role = 'owner';
  elsif p_capability in ('organization.edit', 'team.create', 'song.delete', 'repertoire.delete') then
    return v_privileged;
  elsif p_capability in ('song.edit', 'repertoire.edit') then
    -- L*: Líder ativo de alguma equipe da organização.
    return v_privileged or exists (
      select 1 from public.team_memberships tm
      join public.teams t on t.id = tm.team_id
      where t.organization_id = p_organization_id and tm.user_id = v_user_id
        and tm.role = 'leader' and tm.status = 'active'
    );
  elsif p_capability in ('song.create', 'song.edit_own', 'song.delete_own',
                         'repertoire.create', 'repertoire.edit_own', 'repertoire.delete_own', 'stage.run',
                         'availability.set_own') then
    -- Ativo na organização: sem vínculos de equipe nela ou com ao menos um active.
    return v_privileged or not exists (
      select 1 from public.team_memberships tm
      join public.teams t on t.id = tm.team_id
      where t.organization_id = p_organization_id and tm.user_id = v_user_id
    ) or exists (
      select 1 from public.team_memberships tm
      join public.teams t on t.id = tm.team_id
      where t.organization_id = p_organization_id and tm.user_id = v_user_id and tm.status = 'active'
    );
  end if;

  -- Escopo equipe
  if p_capability not in ('team.rename', 'team.delete', 'team_member.add', 'team_member.set_status',
                          'team_member.set_leader_status', 'team_member.set_role',
                          'team_member.set_functions', 'team_member.set_own_functions',
                          'service.create', 'service.edit', 'service.transition', 'service.delete',
                          'schedule.manage', 'stage.start') then
    return false;
  end if;
  if p_team_id is null then
    return false;
  end if;
  if v_privileged then
    return true;
  end if;

  select tm.role, tm.status into v_team_role, v_team_status
  from public.team_memberships tm
  where tm.team_id = p_team_id and tm.user_id = v_user_id;
  if v_team_status is distinct from 'active' then
    return false;
  end if;

  -- service.delete do Líder vale só em draft: a política de delete confere o alvo.
  if p_capability in ('team.rename', 'team_member.add', 'team_member.set_status', 'team_member.set_functions',
                      'service.create', 'service.edit', 'service.transition', 'service.delete',
                      'schedule.manage', 'stage.start') then
    return v_team_role = 'leader';
  elsif p_capability = 'team_member.set_own_functions' then
    return true;
  end if;
  return false; -- team.delete, set_role, set_leader_status: só Owner e Admin
end;
$$;

create or replace function public.create_target_stage_session(p_service_id uuid, p_session_id uuid DEFAULT gen_random_uuid()) returns public.stage_sessions
    language plpgsql security definer
    set search_path to ''
as $$
declare
  v_service public.services;
  v_stage public.stage_sessions;
begin
  select s.* into v_service
  from public.services s
  join public.organization_memberships om
    on om.organization_id = s.organization_id and om.user_id = app.current_user_id()
  where s.id = p_service_id;

  if v_service.id is null then
    raise exception 'service not found or not authorized';
  end if;

  if not app.has_permission(v_service.organization_id, v_service.team_id, 'stage.start') then
    raise exception 'not authorized to create stage sessions';
  end if;

  if not exists (
    select 1 from public.service_items si
    where si.service_id = p_service_id and si.type = 'song'
  ) then
    raise exception 'service must contain at least one song before starting stage';
  end if;

  insert into public.stage_sessions (id, service_id, md_user_id, status, created_at, updated_at)
  values (p_session_id, p_service_id, app.current_user_id(), 'lobby', now(), now())
  returning * into v_stage;

  return v_stage;
end;
$$;
