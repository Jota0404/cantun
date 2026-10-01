-- CANTUM: finalize target Stage execution.
-- The canonical StageSession/StageSessionState model is now authoritative.
-- Legacy BandStage remains available only for compatibility with legacy routes/data.
--
-- This migration intentionally does not rewrite or delete previously-applied
-- migrations. It replaces the target RPC implementation and removes the
-- target-state projection dependency on legacy BandStage state.

alter table public.stage_sessions
  alter column legacy_band_stage_session_id drop not null;

alter table public.stage_sessions
  add column if not exists md_user_id uuid;

create index if not exists stage_sessions_md_user_id_idx
  on public.stage_sessions(md_user_id);

-- The target state must no longer be initialized from legacy BandStage state.
drop trigger if exists band_stage_states_target_projection on public.band_stage_states;
drop trigger if exists stage_sessions_initialize_target_state on public.stage_sessions;

create or replace function public.initialize_target_stage_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first_item public.service_items;
begin
  select *
    into v_first_item
  from public.service_items si
  where si.service_id = new.service_id
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

create trigger stage_sessions_initialize_target_state
after insert on public.stage_sessions
for each row execute function public.initialize_target_stage_state();

revoke all on function public.initialize_target_stage_state() from public, anon, authenticated;

-- Canonical target session creation. No BandStage session is created.
create or replace function public.create_target_stage_session(
  p_service_id uuid,
  p_session_id uuid default gen_random_uuid()
)
returns public.stage_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_service public.services;
  v_stage public.stage_sessions;
begin
  select s.*
    into v_service
  from public.services s
  join public.organization_memberships om
    on om.organization_id = s.organization_id
   and om.user_id = auth.uid()
  where s.id = p_service_id;

  if v_service.id is null then
    raise exception 'service not found or not authorized';
  end if;

  if not exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = v_service.organization_id
      and om.user_id = auth.uid()
      and om.role in ('owner', 'admin')
  ) then
    raise exception 'not authorized to create stage sessions';
  end if;

  if not exists (
    select 1 from public.service_items si
    where si.service_id = p_service_id
  ) then
    raise exception 'service must contain at least one song before starting stage';
  end if;

  insert into public.stage_sessions (
    id,
    service_id,
    legacy_band_stage_session_id,
    md_user_id,
    status,
    created_at,
    updated_at
  )
  values (
    p_session_id,
    p_service_id,
    null,
    auth.uid(),
    'lobby',
    now(),
    now()
  )
  returning * into v_stage;

  return v_stage;
end;
$$;

-- Target snapshot. The target session identity is canonical; no legacy row is read.
create or replace function public.get_target_stage_snapshot(
  p_stage_session_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_stage public.stage_sessions;
  v_state public.stage_session_states;
begin
  select ss.*
    into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id = ss.service_id
  join public.organization_memberships om
    on om.organization_id = svc.organization_id
   and om.user_id = auth.uid()
  where ss.id = p_stage_session_id;

  if v_stage.id is null then
    raise exception 'stage session not found or not authorized';
  end if;

  select *
    into v_state
  from public.stage_session_states
  where stage_session_id = p_stage_session_id;

  if v_state.stage_session_id is null then
    raise exception 'stage session state not found';
  end if;

  return jsonb_build_object(
    'session', to_jsonb(v_stage),
    'state', to_jsonb(v_state)
  );
end;
$$;

-- Compatibility lookup: legacy routes can still resolve a target session,
-- but canonical execution never uses the legacy identity.
create or replace function public.get_target_stage_snapshot_by_legacy_id(
  p_legacy_session_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_stage_session_id uuid;
begin
  select ss.id
    into v_stage_session_id
  from public.stage_sessions ss
  join public.services svc on svc.id = ss.service_id
  join public.organization_memberships om
    on om.organization_id = svc.organization_id
   and om.user_id = auth.uid()
  where ss.legacy_band_stage_session_id = p_legacy_session_id;

  if v_stage_session_id is null then
    return null;
  end if;

  return public.get_target_stage_snapshot(v_stage_session_id);
end;
$$;

create or replace function public.get_stage_session_by_legacy_id(
  p_legacy_session_id uuid
)
returns public.stage_sessions
language sql
stable
security definer
set search_path = ''
as $$
  select ss
  from public.stage_sessions ss
  join public.services svc on svc.id = ss.service_id
  join public.organization_memberships om
    on om.organization_id = svc.organization_id
   and om.user_id = auth.uid()
  where ss.legacy_band_stage_session_id = p_legacy_session_id;
$$;

create or replace function public.get_service_stage_session(
  p_stage_session_id uuid
)
returns public.stage_sessions
language sql
stable
security definer
set search_path = ''
as $$
  select ss
  from public.stage_sessions ss
  join public.services svc on svc.id = ss.service_id
  join public.organization_memberships om
    on om.organization_id = svc.organization_id
   and om.user_id = auth.uid()
  where ss.id = p_stage_session_id;
$$;

-- Start/end operate only on the target aggregate.
create or replace function public.target_stage_start(
  p_stage_session_id uuid
)
returns public.stage_session_states
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage public.stage_sessions;
  v_state public.stage_session_states;
begin
  select ss.*
    into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id = ss.service_id
  join public.organization_memberships om
    on om.organization_id = svc.organization_id
   and om.user_id = auth.uid()
  where ss.id = p_stage_session_id
  for update;

  if v_stage.id is null then
    raise exception 'stage session not found or not authorized';
  end if;

  if v_stage.status = 'ended' then
    raise exception 'stage session is ended';
  end if;

  update public.stage_sessions
  set status = 'live',
      started_at = coalesce(started_at, now()),
      ended_at = null,
      updated_at = now()
  where id = p_stage_session_id;

  select *
    into v_state
  from public.stage_session_states
  where stage_session_id = p_stage_session_id
  for update;

  update public.stage_session_states
  set revision = revision + 1,
      is_running = false,
      updated_at = now()
  where stage_session_id = p_stage_session_id
  returning * into v_state;

  return v_state;
end;
$$;

create or replace function public.target_stage_end(
  p_stage_session_id uuid
)
returns public.stage_session_states
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage public.stage_sessions;
  v_state public.stage_session_states;
begin
  select ss.*
    into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id = ss.service_id
  join public.organization_memberships om
    on om.organization_id = svc.organization_id
   and om.user_id = auth.uid()
  where ss.id = p_stage_session_id
  for update;

  if v_stage.id is null then
    raise exception 'stage session not found or not authorized';
  end if;

  update public.stage_sessions
  set status = 'ended',
      ended_at = coalesce(ended_at, now()),
      updated_at = now()
  where id = p_stage_session_id;

  update public.stage_session_states
  set revision = revision + 1,
      is_running = false,
      updated_at = now()
  where stage_session_id = p_stage_session_id
  returning * into v_state;

  return v_state;
end;
$$;

-- Shared command authorization/state helpers.
create or replace function public.target_stage_play(
  p_stage_session_id uuid
)
returns public.stage_session_states
language plpgsql
security definer
set search_path = ''
as $$
declare v_stage public.stage_sessions; v_state public.stage_session_states;
begin
  select ss.* into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id=ss.service_id
  join public.organization_memberships om on om.organization_id=svc.organization_id and om.user_id=auth.uid()
  where ss.id=p_stage_session_id;
  if v_stage.id is null then raise exception 'stage session not found or not authorized'; end if;
  if v_stage.status <> 'live' then raise exception 'stage session is not live'; end if;

  update public.stage_session_states
  set revision=revision+1, is_running=true, updated_at=now()
  where stage_session_id=p_stage_session_id
  returning * into v_state;
  return v_state;
end;
$$;

create or replace function public.target_stage_pause(
  p_stage_session_id uuid
)
returns public.stage_session_states
language plpgsql
security definer
set search_path = ''
as $$
declare v_stage public.stage_sessions; v_state public.stage_session_states;
begin
  select ss.* into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id=ss.service_id
  join public.organization_memberships om on om.organization_id=svc.organization_id and om.user_id=auth.uid()
  where ss.id=p_stage_session_id;
  if v_stage.id is null then raise exception 'stage session not found or not authorized'; end if;
  if v_stage.status <> 'live' then raise exception 'stage session is not live'; end if;

  update public.stage_session_states
  set revision=revision+1, is_running=false, updated_at=now()
  where stage_session_id=p_stage_session_id
  returning * into v_state;
  return v_state;
end;
$$;

create or replace function public.target_stage_next(
  p_stage_session_id uuid
)
returns public.stage_session_states
language plpgsql
security definer
set search_path = ''
as $$
declare v_stage public.stage_sessions; v_state public.stage_session_states; v_item public.service_items;
begin
  select ss.* into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id=ss.service_id
  join public.organization_memberships om on om.organization_id=svc.organization_id and om.user_id=auth.uid()
  where ss.id=p_stage_session_id;
  if v_stage.id is null then raise exception 'stage session not found or not authorized'; end if;
  if v_stage.status <> 'live' then raise exception 'stage session is not live'; end if;

  select * into v_state from public.stage_session_states where stage_session_id=p_stage_session_id for update;
  select * into v_item
  from public.service_items si
  where si.service_id=v_stage.service_id
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

create or replace function public.target_stage_previous(
  p_stage_session_id uuid
)
returns public.stage_session_states
language plpgsql
security definer
set search_path = ''
as $$
declare v_stage public.stage_sessions; v_state public.stage_session_states; v_item public.service_items;
begin
  select ss.* into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id=ss.service_id
  join public.organization_memberships om on om.organization_id=svc.organization_id and om.user_id=auth.uid()
  where ss.id=p_stage_session_id;
  if v_stage.id is null then raise exception 'stage session not found or not authorized'; end if;
  if v_stage.status <> 'live' then raise exception 'stage session is not live'; end if;

  select * into v_state from public.stage_session_states where stage_session_id=p_stage_session_id for update;
  select * into v_item
  from public.service_items si
  where si.service_id=v_stage.service_id
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

create or replace function public.target_stage_goto(
  p_stage_session_id uuid,
  p_index integer,
  p_song_id uuid default null
)
returns public.stage_session_states
language plpgsql
security definer
set search_path = ''
as $$
declare v_stage public.stage_sessions; v_state public.stage_session_states; v_item public.service_items;
begin
  select ss.* into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id=ss.service_id
  join public.organization_memberships om on om.organization_id=svc.organization_id and om.user_id=auth.uid()
  where ss.id=p_stage_session_id;
  if v_stage.id is null then raise exception 'stage session not found or not authorized'; end if;
  if v_stage.status <> 'live' then raise exception 'stage session is not live'; end if;

  select * into v_item
  from public.service_items si
  where si.service_id=v_stage.service_id
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

create or replace function public.target_stage_set_key(
  p_stage_session_id uuid,
  p_key text
)
returns public.stage_session_states
language plpgsql
security definer
set search_path = ''
as $$
declare v_stage public.stage_sessions; v_state public.stage_session_states;
begin
  select ss.* into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id=ss.service_id
  join public.organization_memberships om on om.organization_id=svc.organization_id and om.user_id=auth.uid()
  where ss.id=p_stage_session_id;
  if v_stage.id is null then raise exception 'stage session not found or not authorized'; end if;
  if v_stage.status <> 'live' then raise exception 'stage session is not live'; end if;

  update public.stage_session_states
  set revision=revision+1, current_key=p_key, updated_at=now()
  where stage_session_id=p_stage_session_id
  returning * into v_state;
  return v_state;
end;
$$;

create or replace function public.target_stage_prepare_next(
  p_stage_session_id uuid,
  p_index integer,
  p_song_id uuid
)
returns public.stage_session_states
language plpgsql
security definer
set search_path = ''
as $$
declare v_stage public.stage_sessions; v_state public.stage_session_states; v_item public.service_items;
begin
  select ss.* into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id=ss.service_id
  join public.organization_memberships om on om.organization_id=svc.organization_id and om.user_id=auth.uid()
  where ss.id=p_stage_session_id;
  if v_stage.id is null then raise exception 'stage session not found or not authorized'; end if;
  if v_stage.status <> 'live' then raise exception 'stage session is not live'; end if;

  select * into v_item
  from public.service_items si
  where si.service_id=v_stage.service_id
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

create or replace function public.target_stage_clear_prepared(
  p_stage_session_id uuid
)
returns public.stage_session_states
language plpgsql
security definer
set search_path = ''
as $$
declare v_stage public.stage_sessions; v_state public.stage_session_states;
begin
  select ss.* into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id=ss.service_id
  join public.organization_memberships om on om.organization_id=svc.organization_id and om.user_id=auth.uid()
  where ss.id=p_stage_session_id;
  if v_stage.id is null then raise exception 'stage session not found or not authorized'; end if;
  if v_stage.status <> 'live' then raise exception 'stage session is not live'; end if;

  update public.stage_session_states
  set revision=revision+1,
      prepared_index=null,
      prepared_service_item_id=null,
      prepared_song_id=null,
      updated_at=now()
  where stage_session_id=p_stage_session_id
  returning * into v_state;
  return v_state;
end;
$$;

create or replace function public.target_stage_set_annotation(
  p_stage_session_id uuid,
  p_annotation text
)
returns public.stage_session_states
language plpgsql
security definer
set search_path = ''
as $$
declare v_stage public.stage_sessions; v_state public.stage_session_states;
begin
  select ss.* into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id=ss.service_id
  join public.organization_memberships om on om.organization_id=svc.organization_id and om.user_id=auth.uid()
  where ss.id=p_stage_session_id;
  if v_stage.id is null then raise exception 'stage session not found or not authorized'; end if;
  if v_stage.status <> 'live' then raise exception 'stage session is not live'; end if;

  update public.stage_session_states
  set revision=revision+1, md_annotation=left(p_annotation, 500), updated_at=now()
  where stage_session_id=p_stage_session_id
  returning * into v_state;
  return v_state;
end;
$$;

revoke all on function
  public.create_target_stage_session(uuid,uuid),
  public.get_target_stage_snapshot(uuid),
  public.get_target_stage_snapshot_by_legacy_id(uuid),
  public.get_stage_session_by_legacy_id(uuid),
  public.get_service_stage_session(uuid),
  public.target_stage_start(uuid),
  public.target_stage_end(uuid),
  public.target_stage_play(uuid),
  public.target_stage_pause(uuid),
  public.target_stage_next(uuid),
  public.target_stage_previous(uuid),
  public.target_stage_goto(uuid,integer,uuid),
  public.target_stage_set_key(uuid,text),
  public.target_stage_prepare_next(uuid,integer,uuid),
  public.target_stage_clear_prepared(uuid),
  public.target_stage_set_annotation(uuid,text)
from public, anon;

grant execute on function
  public.create_target_stage_session(uuid,uuid),
  public.get_target_stage_snapshot(uuid),
  public.get_target_stage_snapshot_by_legacy_id(uuid),
  public.get_stage_session_by_legacy_id(uuid),
  public.get_service_stage_session(uuid),
  public.target_stage_start(uuid),
  public.target_stage_end(uuid),
  public.target_stage_play(uuid),
  public.target_stage_pause(uuid),
  public.target_stage_next(uuid),
  public.target_stage_previous(uuid),
  public.target_stage_goto(uuid,integer,uuid),
  public.target_stage_set_key(uuid,text),
  public.target_stage_prepare_next(uuid,integer,uuid),
  public.target_stage_clear_prepared(uuid),
  public.target_stage_set_annotation(uuid,text)
to authenticated;
