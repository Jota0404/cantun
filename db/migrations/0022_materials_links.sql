-- CANTUM — B6 fatia 7 / materiais por link (VS-04-05, RN-22…25, ADR-057 classe A, ADR-063).
-- materials: metadados de um link externo (https) de exatamente um dono: serviço, ensaio ou música da organização.
-- Ler: membro ativo da organização. Gravar: material.manage (Owner, Admin, Líder ativo da equipe do serviço) e
-- serviço fora de completed/cancelled; para song_id, song.edit na organização da música.
-- Material é da organização: export_my_data não muda. Excluir a conta deixa created_by nulo (on delete set null,
-- ADR-063); delete_my_account não muda. Upload (kind 'file', storage) fica para a 0023.

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  service_id uuid references public.services(id) on delete cascade,
  rehearsal_id uuid references public.rehearsals(id) on delete cascade,
  song_id uuid references public.songs(id) on delete cascade,
  kind text not null default 'link' check (kind = 'link'),
  title text not null check (btrim(title) <> '' and char_length(title) <= 120),
  -- Sem '@' na autoridade (https://youtube.com@evil.com/): credenciais embutidas mascaram o host.
  url text not null check (url ~ '^https://[^/?#@[:space:]]+([/?#][^[:space:]]*)?$' and char_length(url) <= 2048),
  notes text check (char_length(notes) <= 500),
  created_by uuid references app.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(service_id, rehearsal_id, song_id) = 1)
);
create index materials_organization_idx on public.materials (organization_id);
create index materials_service_idx on public.materials (service_id) where service_id is not null;
create index materials_rehearsal_idx on public.materials (rehearsal_id) where rehearsal_id is not null;
create index materials_song_idx on public.materials (song_id) where song_id is not null;
create index materials_created_by_idx on public.materials (created_by);
alter table public.materials enable row level security;

-- has_permission (corpo da 0021) ganha material.manage no escopo de equipe, só Líder ativo.
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
                          'schedule.manage', 'stage.start', 'rehearsal.manage', 'material.manage') then
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
                      'schedule.manage', 'stage.start', 'rehearsal.manage', 'material.manage') then
    return v_team_role = 'leader';
  elsif p_capability = 'team_member.set_own_functions' then
    return true;
  end if;
  return false; -- team.delete, set_role, set_leader_status: só Owner e Admin
end;
$$;

-- Gravar material (RN-24): serviço ou ensaio → material.manage na equipe do serviço e serviço não final;
-- música → song.edit na organização da música (só música da organização, não excluída).
create function app.can_manage_material(p_service_id uuid, p_rehearsal_id uuid, p_song_id uuid) returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select coalesce((
    select s.status not in ('completed', 'cancelled')
      and app.has_permission(s.organization_id, s.team_id, 'material.manage')
    from public.services s
    where s.id = coalesce(p_service_id, (select r.service_id from public.rehearsals r where r.id = p_rehearsal_id))
  ), false)
  or coalesce((
    select app.has_permission(so.organization_id, null, 'song.edit')
    from public.songs so
    where so.id = p_song_id and so.organization_id is not null and so.deleted_at is null
  ), false)
$$;
revoke all on function app.can_manage_material(uuid, uuid, uuid) from public;
grant execute on function app.can_manage_material(uuid, uuid, uuid) to cantum_user;

create policy materials_select on public.materials for select to cantum_user
  using (app.is_active_in_organization(organization_id));
create policy materials_write on public.materials to cantum_user
  using (app.can_manage_material(service_id, rehearsal_id, song_id))
  with check (app.can_manage_material(service_id, rehearsal_id, song_id));
grant select, insert, update, delete on public.materials to cantum_user;

-- INSERT: organization_id = a do dono (N-B10); song_id só de música da organização (N-B9); autoria = quem grava.
-- UPDATE: dono e organização imutáveis; autoria preservada, salvo o on delete set null (autor já não existe).
-- Compara valores: o upsert do /sync reescreve todas as colunas e, sem mudança, passa.
create function app.guard_material() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.service_id is distinct from old.service_id or new.rehearsal_id is distinct from old.rehearsal_id
       or new.song_id is distinct from old.song_id or new.organization_id is distinct from old.organization_id then
      raise exception 'material owner and organization cannot change' using errcode = 'insufficient_privilege';
    end if;
    if new.created_by is distinct from old.created_by
       and (new.created_by is not null or exists (select 1 from app.users u where u.id = old.created_by)) then
      new.created_by := old.created_by;
    end if;
    return new;
  end if;
  if app.current_user_id() is not null then
    new.created_by := app.current_user_id();
  end if;
  if not exists (
    select 1 from public.services s where s.id = new.service_id and s.organization_id = new.organization_id
    union all
    select 1 from public.rehearsals r where r.id = new.rehearsal_id and r.organization_id = new.organization_id
    union all
    select 1 from public.songs so where so.id = new.song_id and so.organization_id = new.organization_id
  ) then
    raise exception 'material organization must match its owner (organization song only)' using errcode = '23514';
  end if;
  return new;
end
$$;
revoke all on function app.guard_material() from public;
create trigger materials_guard before insert or update on public.materials
  for each row execute function app.guard_material();

-- RN-25: excluir música é exclusão suave (songs.deleted_at); a cascata do FK não dispara, então apaga os materiais aqui.
create function app.delete_song_materials() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  delete from public.materials m where m.song_id = new.id;
  return null;
end
$$;
revoke all on function app.delete_song_materials() from public;
create trigger songs_delete_materials after update of deleted_at on public.songs
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function app.delete_song_materials();
