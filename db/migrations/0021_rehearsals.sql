-- CANTUM — B6 fatia 6 / ensaio (VS-04-05, RN-19…21, ADR-057 classe A).
-- rehearsals: N ensaios por serviço; rehearsal_songs: músicas em foco (só itens 'song' do mesmo serviço).
-- Ler: membro ativo da organização. Gravar: rehearsal.manage (Owner, Admin, Líder ativo da equipe do serviço)
-- e serviço fora de completed/cancelled. Excluir serviço ou item apaga em cascata (RN-21).
-- Ensaio é da organização, sem dado pessoal: export_my_data não muda.

create table public.rehearsals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  starts_at timestamptz not null,
  location text check (char_length(location) <= 120),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index rehearsals_service_idx on public.rehearsals (service_id);
create index rehearsals_organization_idx on public.rehearsals (organization_id);
alter table public.rehearsals enable row level security;

create table public.rehearsal_songs (
  rehearsal_id uuid not null references public.rehearsals(id) on delete cascade,
  service_item_id uuid not null references public.service_items(id) on delete cascade,
  primary key (rehearsal_id, service_item_id)
);
create index rehearsal_songs_item_idx on public.rehearsal_songs (service_item_id);
alter table public.rehearsal_songs enable row level security;

-- has_permission (corpo da 0011) ganha rehearsal.manage no escopo de equipe, só Líder ativo.
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
                          'schedule.manage', 'stage.start', 'rehearsal.manage') then
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
                      'schedule.manage', 'stage.start', 'rehearsal.manage') then
    return v_team_role = 'leader';
  elsif p_capability = 'team_member.set_own_functions' then
    return true;
  end if;
  return false; -- team.delete, set_role, set_leader_status: só Owner e Admin
end;
$$;

-- Gravar ensaio: rehearsal.manage na equipe do serviço e serviço não final (RN-20, RN-21).
create function app.can_manage_rehearsal(p_service_id uuid) returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select coalesce((
    select s.status not in ('completed', 'cancelled')
      and app.has_permission(s.organization_id, s.team_id, 'rehearsal.manage')
    from public.services s
    where s.id = p_service_id
  ), false)
$$;
revoke all on function app.can_manage_rehearsal(uuid) from public;
grant execute on function app.can_manage_rehearsal(uuid) to cantum_user;

create policy rehearsals_select on public.rehearsals for select to cantum_user
  using (app.is_active_in_organization(organization_id));
create policy rehearsals_write on public.rehearsals to cantum_user
  using (app.can_manage_rehearsal(service_id))
  with check (app.can_manage_rehearsal(service_id));
grant select, insert, update, delete on public.rehearsals to cantum_user;

create policy rehearsal_songs_select on public.rehearsal_songs for select to cantum_user
  using (exists (select 1 from public.rehearsals r
                 where r.id = rehearsal_songs.rehearsal_id and app.is_active_in_organization(r.organization_id)));
create policy rehearsal_songs_write on public.rehearsal_songs to cantum_user
  using (exists (select 1 from public.rehearsals r
                 where r.id = rehearsal_songs.rehearsal_id and app.can_manage_rehearsal(r.service_id)))
  with check (exists (select 1 from public.rehearsals r
                      where r.id = rehearsal_songs.rehearsal_id and app.can_manage_rehearsal(r.service_id)));
grant select, insert, update, delete on public.rehearsal_songs to cantum_user;

-- organization_id = o do serviço (N-B10); serviço e organização imutáveis. Compara valores: o upsert do
-- /sync reescreve todas as colunas e, sem mudança, passa.
create function app.guard_rehearsal() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.service_id is distinct from old.service_id or new.organization_id is distinct from old.organization_id then
      raise exception 'rehearsal service and organization cannot change' using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;
  if not exists (select 1 from public.services s where s.id = new.service_id and s.organization_id = new.organization_id) then
    raise exception 'rehearsal organization must match the service' using errcode = '23514';
  end if;
  return new;
end
$$;
revoke all on function app.guard_rehearsal() from public;
create trigger rehearsals_guard before insert or update on public.rehearsals
  for each row execute function app.guard_rehearsal();

-- Item em foco: 'song' do mesmo serviço do ensaio (RN-19). O /sync grava esta tabela (só PK) com
-- `on conflict do nothing`: o BEFORE INSERT revalida a cada reenvio, e uma linha válida continua passando.
-- security definer: item e ensaio são lidos sem RLS.
create function app.guard_rehearsal_song() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.rehearsal_id = old.rehearsal_id and new.service_item_id = old.service_item_id then
    return new;
  end if;
  if not exists (
    select 1 from public.rehearsals r
    join public.service_items si on si.service_id = r.service_id
    where r.id = new.rehearsal_id and si.id = new.service_item_id and si.type = 'song'
  ) then
    raise exception 'rehearsal song must be a song item of the same service' using errcode = '23514';
  end if;
  return new;
end
$$;
revoke all on function app.guard_rehearsal_song() from public;
create trigger rehearsal_songs_guard before insert or update on public.rehearsal_songs
  for each row execute function app.guard_rehearsal_song();

-- RN-19 do lado do item: item em foco não deixa de ser 'song' nem muda de serviço. Estende a guarda
-- da 0018 (reprise/medley preservada) e a liga também à troca de serviço.
create or replace function app.service_item_ref_target_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if new.type <> 'song' and exists (
    select 1 from public.service_items r where r.service_id = new.service_id and r.ref_item_id = new.id
  ) then
    raise exception 'item referenced by a reprise/medley must stay a song' using errcode = '23514';
  end if;
  if (new.type <> 'song' or new.service_id is distinct from old.service_id)
     and exists (select 1 from public.rehearsal_songs rs where rs.service_item_id = new.id) then
    raise exception 'item in rehearsal focus must stay a song of the same service' using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger service_items_rehearsal_guard before update of service_id on public.service_items
  for each row when (old.service_id is distinct from new.service_id)
  execute function app.service_item_ref_target_guard();
