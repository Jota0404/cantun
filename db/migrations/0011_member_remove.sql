-- CANTUM — B8 fatia 4 (VS-07 RN-07, RN-09; ADR-063): remoção de membro de equipe e log administrativo.
--
-- 1. admin_events: log append-only sem conteúdo (só ids e ação); leitura Owner/Admin da organização.
-- 2. app.has_permission ganha team_member.remove (Owner, Admin e Líder ativo da equipe).
-- 3. team_member_remove: apaga vínculo e atribuições futuras; autoria e conta ficam.

create table public.admin_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid references app.users(id) on delete set null,
  target_user_id uuid references app.users(id) on delete set null,
  action text not null check (action in ('team_member.remove')),
  created_at timestamptz not null default now()
);
create index admin_events_organization_idx on public.admin_events (organization_id, created_at desc);
alter table public.admin_events enable row level security;
create policy admin_events_select on public.admin_events for select to cantum_user
  using (app.has_permission(organization_id, null, 'organization.edit'));
-- Sem política nem grant de escrita: só funções security definer gravam.
revoke all on public.admin_events from cantum_user;
grant select on public.admin_events to cantum_user;

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
  elsif p_capability in ('song.edit', 'repertoire.edit', 'repertoire.import_personal') then
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
                          'team_member.set_functions', 'team_member.set_own_functions', 'team_member.remove',
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
  if p_capability in ('team.rename', 'team_member.add', 'team_member.set_status', 'team_member.set_functions', 'team_member.remove',
                      'service.create', 'service.edit', 'service.transition', 'service.delete',
                      'schedule.manage', 'stage.start') then
    return v_team_role = 'leader';
  elsif p_capability = 'team_member.set_own_functions' then
    return true;
  end if;
  return false; -- team.delete, set_role, set_leader_status: só Owner e Admin
end;
$$;

create function public.team_member_remove(p_team_membership_id uuid) returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_target public.team_memberships;
  v_organization_id uuid;
  v_actor_role text;
  v_target_org_role text;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;

  select tm.* into v_target from public.team_memberships tm where tm.id = p_team_membership_id for update;
  select t.organization_id into v_organization_id from public.teams t where t.id = v_target.team_id;
  if v_target.id is null or not app.has_permission(v_organization_id, v_target.team_id, 'team_member.remove') then
    raise exception 'not authorized to remove team member';
  end if;

  select om.role into v_actor_role from public.organization_memberships om
  where om.organization_id = v_organization_id and om.user_id = v_user_id;
  select om.role into v_target_org_role from public.organization_memberships om
  where om.organization_id = v_organization_id and om.user_id = v_target.user_id;

  -- Remover a si mesmo é sair da conta (B8 fatia 5); Líder só remove member; Admin não remove Owner.
  if v_target.user_id = v_user_id
     or (v_target.role = 'leader' and v_actor_role not in ('owner', 'admin'))
     or (v_target_org_role = 'owner' and v_actor_role <> 'owner') then
    raise exception 'not authorized to remove team member';
  end if;

  delete from public.assignments a
  using public.services s
  where a.service_id = s.id and s.team_id = v_target.team_id
    and a.user_id = v_target.user_id and s.starts_at > now();
  delete from public.team_memberships where id = v_target.id;

  insert into public.admin_events (organization_id, actor_user_id, target_user_id, action)
  values (v_organization_id, v_user_id, v_target.user_id, 'team_member.remove');
end;
$$;
revoke all on function public.team_member_remove(uuid) from public;
grant execute on function public.team_member_remove(uuid) to cantum_user;
