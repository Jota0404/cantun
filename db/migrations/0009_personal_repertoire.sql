-- CANTUM — FIX-01 / Fatia C: repertório pessoal e importação para a organização (ADR-062, RN-C1, RN-C2).
--
-- 1. repertoires.organization_id aceita nulo (nulo = repertório pessoal do created_by_user_id).
-- 2. Políticas de repertoires e repertoire_items ganham o ramo "pessoal do dono"; app.can_edit_repertoire idem.
-- 3. app.has_permission ganha repertoire.import_personal (Owner, Admin e Líder ativo L*).
-- 4. RPC import_personal_repertoire: copia o repertório pessoal para a organização (classe B, só online).
--
-- Mover entre pessoal e organização por escrita direta segue barrado: repertoires_guard_owner (0004)
-- já impede mudar organization_id e created_by_user_id em update.

alter table public.repertoires alter column organization_id drop not null;

-- ---------------------------------------------------------------------------
-- 2. RLS
-- ---------------------------------------------------------------------------

drop policy "organization members can read repertoires" on public.repertoires;
drop policy repertoires_insert on public.repertoires;
drop policy repertoires_update on public.repertoires;
drop policy repertoires_delete on public.repertoires;
drop policy "organization members can read repertoire items" on public.repertoire_items;

-- Pessoal (organization_id nulo): só o dono. Da organização: como na 0004.
create policy repertoires_select on public.repertoires for select to cantum_user
  using ((organization_id is null and created_by_user_id = app.current_user_id())
         or (organization_id is not null and app.is_organization_member(organization_id)));
create policy repertoires_insert on public.repertoires for insert to cantum_user
  with check (created_by_user_id = app.current_user_id()
              and (organization_id is null or app.has_permission(organization_id, null, 'repertoire.create')));
create policy repertoires_update on public.repertoires for update to cantum_user
  using ((organization_id is null and created_by_user_id = app.current_user_id())
         or (organization_id is not null and (
              app.has_permission(organization_id, null, 'repertoire.edit')
              or (created_by_user_id = app.current_user_id() and app.has_permission(organization_id, null, 'repertoire.edit_own')))))
  with check ((organization_id is null and created_by_user_id = app.current_user_id())
         or (organization_id is not null and (
              app.has_permission(organization_id, null, 'repertoire.edit')
              or (created_by_user_id = app.current_user_id() and app.has_permission(organization_id, null, 'repertoire.edit_own')))));
create policy repertoires_delete on public.repertoires for delete to cantum_user
  using ((organization_id is null and created_by_user_id = app.current_user_id())
         or (organization_id is not null and (
              app.has_permission(organization_id, null, 'repertoire.delete')
              or (created_by_user_id = app.current_user_id() and app.has_permission(organization_id, null, 'repertoire.delete_own')))));

-- Leitura dos itens: via repertoires, que a RLS do chamador já filtra (pessoal só do dono).
create function app.can_read_repertoire(p_repertoire_id uuid) returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select coalesce((
    select case when r.organization_id is null then r.created_by_user_id = app.current_user_id()
                else app.is_organization_member(r.organization_id) end
    from public.repertoires r
    where r.id = p_repertoire_id
  ), false)
$$;
revoke all on function app.can_read_repertoire(uuid) from public;
grant execute on function app.can_read_repertoire(uuid) to cantum_user;

create policy repertoire_items_select on public.repertoire_items for select to cantum_user
  using (app.can_read_repertoire(repertoire_id));

create or replace function app.can_edit_repertoire(p_repertoire_id uuid) returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select coalesce((
    select case when r.organization_id is null then r.created_by_user_id = app.current_user_id()
                else app.has_permission(r.organization_id, null, 'repertoire.edit')
                     or (r.created_by_user_id = app.current_user_id()
                         and app.has_permission(r.organization_id, null, 'repertoire.edit_own')) end
    from public.repertoires r
    where r.id = p_repertoire_id
  ), false)
$$;

-- ---------------------------------------------------------------------------
-- 3. app.has_permission + repertoire.import_personal
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 4. RPC de importação (classe B, só online; ADR-057)
-- ---------------------------------------------------------------------------

-- Copia (não move) o repertório pessoal do chamador para a organização, na mesma ordem, com uma cópia
-- da organização para cada música (reaproveita a que já existe). Música apagada é pulada. Devolve o
-- repertório novo, seus itens e as cópias, para o cliente gravar no Dexie, e as contagens.
-- Repertório alheio, da organização, apagado ou inexistente dão a mesma mensagem.
create function public.import_personal_repertoire(p_repertoire_id uuid, p_organization_id uuid, p_new_id uuid default null)
  returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_source public.repertoires;
  v_new public.repertoires;
  v_item record;
  v_copy public.songs;
  v_position integer := 0;
  v_copied integer := 0;
  v_reused integer := 0;
  v_songs jsonb := '[]'::jsonb;
  v_items jsonb := '[]'::jsonb;
  v_item_row public.repertoire_items;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;

  select r.* into v_source from public.repertoires r
  where r.id = p_repertoire_id and r.organization_id is null and r.created_by_user_id = v_user_id;
  if v_source.id is null then raise exception 'repertoire not found or not authorized'; end if;
  if not app.has_permission(p_organization_id, null, 'repertoire.import_personal') then
    raise exception 'not authorized to import repertoires into this organization';
  end if;

  insert into public.repertoires (id, organization_id, name, created_by_user_id, version, created_at, updated_at)
  values (coalesce(p_new_id, gen_random_uuid()), p_organization_id, v_source.name, v_user_id, 1, now(), now())
  returning * into v_new;

  for v_item in
    select ri.song_id from public.repertoire_items ri
    join public.songs s on s.id = ri.song_id and s.deleted_at is null
    where ri.repertoire_id = v_source.id
    order by ri.position, ri.id
  loop
    if exists (select 1 from public.songs c
               where c.organization_id = p_organization_id and c.source_song_id = v_item.song_id and c.deleted_at is null) then
      v_reused := v_reused + 1;
    else
      v_copied := v_copied + 1;
    end if;
    v_copy := public.copy_song_to_organization(v_item.song_id, p_organization_id, null);
    insert into public.repertoire_items (repertoire_id, song_id, position)
    values (v_new.id, v_copy.id, v_position)
    on conflict (repertoire_id, song_id) do nothing
    returning * into v_item_row;
    if v_item_row.id is not null then
      v_position := v_position + 1;
      v_items := v_items || to_jsonb(v_item_row);
      v_songs := v_songs || to_jsonb(v_copy);
    end if;
  end loop;

  return jsonb_build_object('repertoire', to_jsonb(v_new), 'items', v_items, 'songs', v_songs,
                            'copied', v_copied, 'reused', v_reused);
end;
$$;
revoke all on function public.import_personal_repertoire(uuid, uuid, uuid) from public;
grant execute on function public.import_personal_repertoire(uuid, uuid, uuid) to cantum_user;
