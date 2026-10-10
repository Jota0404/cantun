-- CANTUM — B3 / VS-02: serviço operacional (ADR-052; PERMISSIONS.md §3.4 e S1–S8).
--
-- 1. services: equipe (FK composta com a organização), local, observações e os
--    estados draft/ready/in_progress/completed/cancelled; status só por transition_service.
-- 2. service_items genérico (música é um tipo entre outros) com unique (service_id, position) deferida.
-- 3. app.has_permission ganha service.*; RLS de services e service_items pela matriz.
-- 4. Stage lê só itens song (D6: só o filtro, sem feature nova).

-- ---------------------------------------------------------------------------
-- 1. Equipe, informações e estados do serviço
-- ---------------------------------------------------------------------------

alter table public.teams add constraint teams_organization_id_id_key unique (organization_id, id);

alter table public.services
  add column team_id uuid,
  add column location text,
  add column notes text;

-- Bancos de desenvolvimento: a equipe mais antiga da organização. Organização sem
-- equipe impede o not null (banco local é recriado; ADR-059 §1).
update public.services s
set team_id = (
  select t.id from public.teams t
  where t.organization_id = s.organization_id
  order by t.created_at, t.id
  limit 1
);
alter table public.services alter column team_id set not null;

-- "no action" (checado no fim do comando) em vez de "restrict": excluir a equipe
-- direto continua barrado, mas excluir a organização apaga serviços e equipes juntos.
alter table public.services
  add constraint services_team_fkey foreign key (organization_id, team_id)
    references public.teams (organization_id, id) on delete no action;
create index services_team_starts_idx on public.services (team_id, starts_at);

alter table public.services drop constraint services_status_check;
update public.services set status = 'draft' where status = 'planned';
update public.services set status = 'ready' where status = 'confirmed';
alter table public.services
  alter column status set default 'draft',
  add constraint services_status_check check (status in ('draft', 'ready', 'in_progress', 'completed', 'cancelled'));

-- Escrita direta: status não muda (nasce draft), organização e autor são imutáveis,
-- e serviço final não aceita edição (RN-06). transition_service (dono da tabela) passa.
create function app.guard_service() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if current_user = (select pg_catalog.pg_get_userbyid(c.relowner) from pg_catalog.pg_class c where c.oid = tg_relid) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'service status changes only through transition_service' using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;
  if old.status in ('completed', 'cancelled') then
    raise exception 'service is completed or cancelled' using errcode = 'insufficient_privilege';
  end if;
  if new.status is distinct from old.status then
    raise exception 'service status changes only through transition_service' using errcode = 'insufficient_privilege';
  end if;
  if new.organization_id is distinct from old.organization_id or new.created_by_user_id is distinct from old.created_by_user_id then
    raise exception 'service organization and author cannot change' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
revoke all on function app.guard_service() from public;

create trigger services_guard
  before insert or update on public.services
  for each row execute function app.guard_service();

-- Reforço: o cliente não grava status nem por upsert. O upsert do /sync faz
-- "update set" de toda coluna enviada; a imutabilidade de organização e autor é do trigger.
revoke insert, update on public.services from cantum_user;
grant insert (id, organization_id, team_id, name, starts_at, created_by_user_id, created_at, updated_at, location, notes)
  on public.services to cantum_user;
grant update (organization_id, team_id, name, starts_at, created_by_user_id, created_at, updated_at, location, notes)
  on public.services to cantum_user;

-- ---------------------------------------------------------------------------
-- 2. Itens genéricos
-- ---------------------------------------------------------------------------

alter table public.service_items
  add column type text not null default 'song'
    check (type in ('song', 'opening', 'prayer', 'preaching', 'announcement', 'offering', 'closing', 'other')),
  add column title text check (title is null or char_length(btrim(title)) between 1 and 120),
  add column notes text,
  add column duration_minutes integer check (duration_minutes between 1 and 600),
  alter column song_id drop not null,
  add constraint service_items_song_check check ((type = 'song') = (song_id is not null)),
  add constraint service_items_non_song_title_check check (type = 'song' or title is not null);

-- Renumerar numa transação (push do sync em lote) exige a unique deferida.
alter table public.service_items drop constraint service_items_service_id_position_key;
alter table public.service_items
  add constraint service_items_service_id_position_key unique (service_id, position) deferrable initially deferred;

-- ---------------------------------------------------------------------------
-- 3. Permissões
-- ---------------------------------------------------------------------------

-- Mesma função do 0004, com service.* no escopo de equipe (Owner, Admin, Líder ativo).
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
                         'repertoire.create', 'repertoire.edit_own', 'repertoire.delete_own', 'stage.run') then
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
                          'service.create', 'service.edit', 'service.transition', 'service.delete') then
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
                      'service.create', 'service.edit', 'service.transition', 'service.delete') then
    return v_team_role = 'leader';
  elsif p_capability = 'team_member.set_own_functions' then
    return true;
  end if;
  return false; -- team.delete, set_role, set_leader_status: só Owner e Admin
end;
$$;

-- Leitura de serviço e ordem: membro ativo na organização (PERMISSIONS.md §4).
create function app.is_active_in_organization(p_organization_id uuid) returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select app.has_organization_role(p_organization_id, array['owner', 'admin'])
    or (app.is_organization_member(p_organization_id) and (
      not exists (
        select 1 from public.team_memberships tm join public.teams t on t.id = tm.team_id
        where t.organization_id = p_organization_id and tm.user_id = app.current_user_id()
      ) or exists (
        select 1 from public.team_memberships tm join public.teams t on t.id = tm.team_id
        where t.organization_id = p_organization_id and tm.user_id = app.current_user_id() and tm.status = 'active'
      )))
$$;
revoke all on function app.is_active_in_organization(uuid) from public;
grant execute on function app.is_active_in_organization(uuid) to cantum_user;

-- Ordem editável: service.edit na equipe do serviço e serviço não final (RN-06).
create function app.can_edit_service(p_service_id uuid) returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select coalesce((
    select s.status not in ('completed', 'cancelled')
      and app.has_permission(s.organization_id, s.team_id, 'service.edit')
    from public.services s
    where s.id = p_service_id
  ), false)
$$;
revoke all on function app.can_edit_service(uuid) from public;
grant execute on function app.can_edit_service(uuid) to cantum_user;

drop policy "organization admins can write services" on public.services;
drop policy "organization members can read services" on public.services;
create policy services_select on public.services for select to cantum_user
  using (app.is_active_in_organization(organization_id));
create policy services_insert on public.services for insert to cantum_user
  with check (created_by_user_id = app.current_user_id()
              and app.has_permission(organization_id, team_id, 'service.create'));
create policy services_update on public.services for update to cantum_user
  using (app.has_permission(organization_id, team_id, 'service.edit'))
  with check (app.has_permission(organization_id, team_id, 'service.edit'));
-- Owner e Admin excluem sempre; o Líder só em draft (fora disso, cancela).
create policy services_delete on public.services for delete to cantum_user
  using (app.has_permission(organization_id, team_id, 'service.delete')
         and (status = 'draft' or app.has_organization_role(organization_id, array['owner', 'admin'])));

drop policy "organization admins can write service items" on public.service_items;
drop policy "organization members can read service items" on public.service_items;
create policy service_items_select on public.service_items for select to cantum_user
  using (exists (select 1 from public.services s
                 where s.id = service_items.service_id and app.is_active_in_organization(s.organization_id)));
create policy service_items_write on public.service_items to cantum_user
  using (app.can_edit_service(service_id))
  with check (app.can_edit_service(service_id));

-- Única via de mudança de status (RN-02, RN-03). Sem permissão e inexistente dão o
-- mesmo erro, para não revelar ids.
create function public.transition_service(p_service_id uuid, p_to text) returns public.services
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_service public.services;
begin
  if app.current_user_id() is null then raise exception 'authentication required'; end if;

  select s.* into v_service from public.services s where s.id = p_service_id for update;
  if v_service.id is null
     or not app.has_permission(v_service.organization_id, v_service.team_id, 'service.transition') then
    raise exception 'service not found or not authorized';
  end if;

  if p_to is null or p_to not in ('draft', 'ready', 'in_progress', 'completed', 'cancelled') then
    raise exception 'invalid service status';
  end if;
  if (v_service.status, p_to) not in (
    ('draft', 'ready'), ('ready', 'draft'), ('ready', 'in_progress'), ('in_progress', 'completed'),
    ('draft', 'cancelled'), ('ready', 'cancelled'), ('in_progress', 'cancelled')
  ) then
    raise exception 'invalid service transition';
  end if;

  update public.services set status = p_to, updated_at = now()
  where id = p_service_id
  returning * into v_service;
  return v_service;
end;
$$;
revoke all on function public.transition_service(uuid, text) from public;
grant execute on function public.transition_service(uuid, text) to cantum_user;

-- ---------------------------------------------------------------------------
-- 4. Stage: só itens song (RN-07, D6)
-- ---------------------------------------------------------------------------

create or replace function public.get_service_stage_songs(p_stage_session_id uuid) returns table("position" integer, song_id uuid, title text, artist text, original_key text, current_key text, lyrics text, notes text, bpm integer, musical_role text)
  language sql stable security definer
  set search_path = ''
as $$
  select
    si.position,
    s.id,
    s.title,
    s.artist,
    s.original_key,
    s.original_key,
    s.lyrics,
    s.notes,
    s.bpm,
    coalesce(
      (
        select a.musical_function
        from public.assignments a
        where a.service_id = svc.id
          and a.user_id = app.current_user_id()
          and (a.service_item_id = si.id or a.service_item_id is null)
          and a.status in ('pending', 'accepted')
        order by case when a.service_item_id = si.id then 0 else 1 end, a.created_at desc
        limit 1
      ),
      'other'
    )
  from public.stage_sessions ss
  join public.services svc on svc.id = ss.service_id
  join public.service_items si on si.service_id = svc.id and si.type = 'song'
  join public.songs s on s.id = si.song_id
  where ss.id = p_stage_session_id
    and app.has_permission(svc.organization_id, null, 'stage.run')
  order by si.position asc;
$$;

-- Navegação do Stage: mesmo corpo do baseline com o filtro type = 'song'.
CREATE OR REPLACE FUNCTION public.create_target_stage_session(p_service_id uuid, p_session_id uuid DEFAULT gen_random_uuid()) RETURNS public.stage_sessions
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_service public.services;
  v_stage public.stage_sessions;
begin
  select s.*
    into v_service
  from public.services s
  join public.organization_memberships om
    on om.organization_id = s.organization_id
   and om.user_id = app.current_user_id()
  where s.id = p_service_id;

  if v_service.id is null then
    raise exception 'service not found or not authorized';
  end if;

  if not exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = v_service.organization_id
      and om.user_id = app.current_user_id()
      and om.role in ('owner', 'admin')
  ) then
    raise exception 'not authorized to create stage sessions';
  end if;

  if not exists (
    select 1 from public.service_items si
    where si.service_id = p_service_id and si.type = 'song'
  ) then
    raise exception 'service must contain at least one song before starting stage';
  end if;

  insert into public.stage_sessions (
    id,
    service_id,
    md_user_id,
    status,
    created_at,
    updated_at
  )
  values (
    p_session_id,
    p_service_id,
    app.current_user_id(),
    'lobby',
    now(),
    now()
  )
  returning * into v_stage;

  return v_stage;
end;
$$;

CREATE OR REPLACE FUNCTION public.initialize_target_stage_state() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_first_item public.service_items;
begin
  select *
    into v_first_item
  from public.service_items si
  where si.service_id = new.service_id and si.type = 'song'
  order by si.position asc
  limit 1;

  insert into public.stage_session_states (
    stage_session_id,
    current_index,
    current_service_item_id,
    current_song_id,
    updated_at
  )
  values (
    new.id,
    coalesce(v_first_item.position, 0),
    v_first_item.id,
    v_first_item.song_id,
    new.updated_at
  )
  on conflict (stage_session_id) do nothing;

  return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.target_stage_goto(p_stage_session_id uuid, p_index integer, p_song_id uuid DEFAULT NULL::uuid) RETURNS public.stage_session_states
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_stage public.stage_sessions; v_state public.stage_session_states; v_item public.service_items;
begin
  select ss.* into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id=ss.service_id
  join public.organization_memberships om on om.organization_id=svc.organization_id and om.user_id=app.current_user_id()
  where ss.id=p_stage_session_id;
  if v_stage.id is null then raise exception 'stage session not found or not authorized'; end if;
  if v_stage.status <> 'live' then raise exception 'stage session is not live'; end if;

  select * into v_item
  from public.service_items si
  where si.service_id=v_stage.service_id and si.type='song'
    and si.position=p_index
    and (p_song_id is null or si.song_id=p_song_id)
  limit 1;

  if v_item.id is null then raise exception 'stage item not found'; end if;

  update public.stage_session_states
  set revision=revision+1,
      current_index=v_item.position,
      current_service_item_id=v_item.id,
      current_song_id=v_item.song_id,
      prepared_index=null,
      prepared_service_item_id=null,
      prepared_song_id=null,
      updated_at=now()
  where stage_session_id=p_stage_session_id
  returning * into v_state;
  return v_state;
end;
$$;

CREATE OR REPLACE FUNCTION public.target_stage_next(p_stage_session_id uuid) RETURNS public.stage_session_states
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_stage public.stage_sessions; v_state public.stage_session_states; v_item public.service_items;
begin
  select ss.* into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id=ss.service_id
  join public.organization_memberships om on om.organization_id=svc.organization_id and om.user_id=app.current_user_id()
  where ss.id=p_stage_session_id;
  if v_stage.id is null then raise exception 'stage session not found or not authorized'; end if;
  if v_stage.status <> 'live' then raise exception 'stage session is not live'; end if;

  select * into v_state from public.stage_session_states where stage_session_id=p_stage_session_id for update;
  select * into v_item
  from public.service_items si
  where si.service_id=v_stage.service_id and si.type='song'
    and si.position > v_state.current_index
  order by si.position asc limit 1;

  if v_item.id is null then
    return v_state;
  end if;

  update public.stage_session_states
  set revision=revision+1,
      current_index=v_item.position,
      current_service_item_id=v_item.id,
      current_song_id=v_item.song_id,
      prepared_index=null,
      prepared_service_item_id=null,
      prepared_song_id=null,
      updated_at=now()
  where stage_session_id=p_stage_session_id
  returning * into v_state;
  return v_state;
end;
$$;

CREATE OR REPLACE FUNCTION public.target_stage_previous(p_stage_session_id uuid) RETURNS public.stage_session_states
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_stage public.stage_sessions; v_state public.stage_session_states; v_item public.service_items;
begin
  select ss.* into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id=ss.service_id
  join public.organization_memberships om on om.organization_id=svc.organization_id and om.user_id=app.current_user_id()
  where ss.id=p_stage_session_id;
  if v_stage.id is null then raise exception 'stage session not found or not authorized'; end if;
  if v_stage.status <> 'live' then raise exception 'stage session is not live'; end if;

  select * into v_state from public.stage_session_states where stage_session_id=p_stage_session_id for update;
  select * into v_item
  from public.service_items si
  where si.service_id=v_stage.service_id and si.type='song'
    and si.position < v_state.current_index
  order by si.position desc limit 1;

  if v_item.id is null then
    return v_state;
  end if;

  update public.stage_session_states
  set revision=revision+1,
      current_index=v_item.position,
      current_service_item_id=v_item.id,
      current_song_id=v_item.song_id,
      prepared_index=null,
      prepared_service_item_id=null,
      prepared_song_id=null,
      updated_at=now()
  where stage_session_id=p_stage_session_id
  returning * into v_state;
  return v_state;
end;
$$;

CREATE OR REPLACE FUNCTION public.target_stage_prepare_next(p_stage_session_id uuid, p_index integer, p_song_id uuid) RETURNS public.stage_session_states
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_stage public.stage_sessions; v_state public.stage_session_states; v_item public.service_items;
begin
  select ss.* into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id=ss.service_id
  join public.organization_memberships om on om.organization_id=svc.organization_id and om.user_id=app.current_user_id()
  where ss.id=p_stage_session_id;
  if v_stage.id is null then raise exception 'stage session not found or not authorized'; end if;
  if v_stage.status <> 'live' then raise exception 'stage session is not live'; end if;

  select * into v_item
  from public.service_items si
  where si.service_id=v_stage.service_id and si.type='song'
    and si.position=p_index
    and si.song_id=p_song_id
  limit 1;
  if v_item.id is null then raise exception 'stage item not found'; end if;

  update public.stage_session_states
  set revision=revision+1,
      prepared_index=v_item.position,
      prepared_service_item_id=v_item.id,
      prepared_song_id=v_item.song_id,
      updated_at=now()
  where stage_session_id=p_stage_session_id
  returning * into v_state;
  return v_state;
end;
$$;
