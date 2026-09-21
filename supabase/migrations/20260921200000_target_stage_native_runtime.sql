-- CANTUM: finalize canonical Stage runtime.
-- Target StageSession/StageSessionState are now the only execution state.
-- Legacy BandStage RPCs are no longer invoked by target RPCs.
-- Legacy tables remain compatibility infrastructure only.

alter table public.stage_sessions
  add column if not exists md_user_id uuid references auth.users(id) on delete set null;

update public.stage_sessions ss
set md_user_id = bs.md_user_id
from public.band_stage_sessions bs
where bs.id = ss.legacy_band_stage_session_id
  and ss.md_user_id is null;

create or replace function public.initialize_target_stage_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.md_user_id is null then
    new.md_user_id := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists stage_sessions_initialize_target_identity on public.stage_sessions;
create trigger stage_sessions_initialize_target_identity
before insert on public.stage_sessions
for each row execute function public.initialize_target_stage_identity();

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
    insert into public.stage_session_states(stage_session_id)
    values (p_stage_session_id)
    returning * into v_state;
  end if;

  return jsonb_build_object(
    'session', jsonb_build_object(
      'id', v_stage.id,
      'service_id', v_stage.service_id,
      'legacy_band_stage_session_id', v_stage.legacy_band_stage_session_id,
      'md_user_id', v_stage.md_user_id,
      'status', v_stage.status,
      'created_at', v_stage.created_at,
      'started_at', v_stage.started_at,
      'ended_at', v_stage.ended_at,
      'updated_at', v_stage.updated_at
    ),
    'state', jsonb_build_object(
      'stage_session_id', v_state.stage_session_id,
      'revision', v_state.revision,
      'current_index', v_state.current_index,
      'current_service_item_id', v_state.current_service_item_id,
      'current_song_id', v_state.current_song_id,
      'current_key', v_state.current_key,
      'prepared_index', v_state.prepared_index,
      'prepared_service_item_id', v_state.prepared_service_item_id,
      'prepared_song_id', v_state.prepared_song_id,
      'is_running', v_state.is_running,
      'md_annotation', v_state.md_annotation,
      'updated_at', v_state.updated_at
    )
  );
end;
$$;

create or replace function public.get_target_stage_snapshot_by_legacy_id(
  p_legacy_session_id uuid
)
returns jsonb
language plpgsql
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

create or replace function public.target_stage_start(p_stage_session_id uuid)
returns public.stage_session_states
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage public.stage_sessions;
  v_state public.stage_session_states;
  v_first_item public.service_items;
begin
  select ss.* into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id = ss.service_id
  join public.organization_memberships om
    on om.organization_id = svc.organization_id
   and om.user_id = auth.uid()
  where ss.id = p_stage_session_id;

  if not found then raise exception 'stage session not found or not authorized'; end if;
  if v_stage.status = 'ended' then raise exception 'stage session has ended'; end if;

  update public.stage_sessions
  set status = 'live',
      started_at = coalesce(started_at, now()),
      updated_at = now()
  where id = p_stage_session_id;

  select * into v_state
  from public.stage_session_states
  where stage_session_id = p_stage_session_id
  for update;

  select * into v_first_item
  from public.service_items
  where service_id = v_stage.service_id
  order by position
  limit 1;

  if v_first_item.id is not null then
    update public.stage_session_states
    set revision = revision + 1,
        current_index = v_first_item.position,
        current_service_item_id = v_first_item.id,
        current_song_id = v_first_item.song_id,
        is_running = false,
        updated_at = now()
    where stage_session_id = p_stage_session_id
    returning * into v_state;
  else
    update public.stage_session_states
    set revision = revision + 1,
        current_index = 0,
        current_service_item_id = null,
        current_song_id = null,
        is_running = false,
        updated_at = now()
    where stage_session_id = p_stage_session_id
    returning * into v_state;
  end if;

  return v_state;
end;
$$;

create or replace function public.target_stage_end(p_stage_session_id uuid)
returns public.stage_session_states
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage public.stage_sessions;
  v_state public.stage_session_states;
begin
  select ss.* into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id = ss.service_id
  join public.organization_memberships om on om.organization_id = svc.organization_id and om.user_id = auth.uid()
  where ss.id = p_stage_session_id;

  if not found then raise exception 'stage session not found or not authorized'; end if;

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

create or replace function public.target_stage_play(p_stage_session_id uuid)
returns public.stage_session_states
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage public.stage_sessions;
  v_state public.stage_session_states;
begin
  select ss.* into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id = ss.service_id
  join public.organization_memberships om on om.organization_id = svc.organization_id and om.user_id = auth.uid()
  where ss.id = p_stage_session_id;

  if not found then raise exception 'stage session not found or not authorized'; end if;
  if v_stage.status <> 'live' then raise exception 'stage session is not live'; end if;

  update public.stage_session_states
  set revision = revision + 1,
      is_running = true,
      updated_at = now()
  where stage_session_id = p_stage_session_id
  returning * into v_state;

  return v_state;
end;
$$;

create or replace function public.target_stage_pause(p_stage_session_id uuid)
returns public.stage_session_states
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage public.stage_sessions;
  v_state public.stage_session_states;
begin
  select ss.* into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id = ss.service_id
  join public.organization_memberships om on om.organization_id = svc.organization_id and om.user_id = auth.uid()
  where ss.id = p_stage_session_id;

  if not found then raise exception 'stage session not found or not authorized'; end if;
  if v_stage.status <> 'live' then raise exception 'stage session is not live'; end if;

  update public.stage_session_states
  set revision = revision + 1,
      is_running = false,
      updated_at = now()
  where stage_session_id = p_stage_session_id
  returning * into v_state;

  return v_state;
end;
$$;

create or replace function public.target_stage_next(p_stage_session_id uuid)
returns public.stage_session_states
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage public.stage_sessions;
  v_state public.stage_session_states;
  v_item public.service_items;
begin
  select ss.* into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id = ss.service_id
  join public.organization_memberships om on om.organization_id = svc.organization_id and om.user_id = auth.uid()
  where ss.id = p_stage_session_id;

  if not found then raise exception 'stage session not found or not authorized'; end if;
  if v_stage.status <> 'live' then raise exception 'stage session is not live'; end if;

  select si.* into v_item
  from public.service_items si
  join public.stage_session_states st on st.stage_session_id = p_stage_session_id
  where si.service_id = v_stage.service_id
    and si.position > st.current_index
  order by si.position
  limit 1;

  if v_item.id is null then raise exception 'already at last service item'; end if;

  update public.stage_session_states
  set revision = revision + 1,
      current_index = v_item.position,
      current_service_item_id = v_item.id,
      current_song_id = v_item.song_id,
      updated_at = now()
  where stage_session_id = p_stage_session_id
  returning * into v_state;

  return v_state;
end;
$$;

create or replace function public.target_stage_previous(p_stage_session_id uuid)
returns public.stage_session_states
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage public.stage_sessions;
  v_state public.stage_session_states;
  v_item public.service_items;
begin
  select ss.* into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id = ss.service_id
  join public.organization_memberships om on om.organization_id = svc.organization_id and om.user_id = auth.uid()
  where ss.id = p_stage_session_id;

  if not found then raise exception 'stage session not found or not authorized'; end if;
  if v_stage.status <> 'live' then raise exception 'stage session is not live'; end if;

  select si.* into v_item
  from public.service_items si
  join public.stage_session_states st on st.stage_session_id = p_stage_session_id
  where si.service_id = v_stage.service_id
    and si.position < st.current_index
  order by si.position desc
  limit 1;

  if v_item.id is null then raise exception 'already at first service item'; end if;

  update public.stage_session_states
  set revision = revision + 1,
      current_index = v_item.position,
      current_service_item_id = v_item.id,
      current_song_id = v_item.song_id,
      updated_at = now()
  where stage_session_id = p_stage_session_id
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
declare
  v_stage public.stage_sessions;
  v_state public.stage_session_states;
  v_item public.service_items;
begin
  select ss.* into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id = ss.service_id
  join public.organization_memberships om on om.organization_id = svc.organization_id and om.user_id = auth.uid()
  where ss.id = p_stage_session_id;

  if not found then raise exception 'stage session not found or not authorized'; end if;
  if v_stage.status <> 'live' then raise exception 'stage session is not live'; end if;

  select * into v_item
  from public.service_items
  where service_id = v_stage.service_id
    and position = p_index
    and (p_song_id is null or song_id = p_song_id)
  limit 1;

  if v_item.id is null then raise exception 'service item not found'; end if;

  update public.stage_session_states
  set revision = revision + 1,
      current_index = v_item.position,
      current_service_item_id = v_item.id,
      current_song_id = v_item.song_id,
      updated_at = now()
  where stage_session_id = p_stage_session_id
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
declare
  v_stage public.stage_sessions;
  v_state public.stage_session_states;
begin
  select ss.* into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id = ss.service_id
  join public.organization_memberships om on om.organization_id = svc.organization_id and om.user_id = auth.uid()
  where ss.id = p_stage_session_id;

  if not found then raise exception 'stage session not found or not authorized'; end if;
  if v_stage.status <> 'live' then raise exception 'stage session is not live'; end if;

  update public.stage_session_states
  set revision = revision + 1,
      current_key = nullif(trim(p_key), ''),
      updated_at = now()
  where stage_session_id = p_stage_session_id
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
declare
  v_stage public.stage_sessions;
  v_state public.stage_session_states;
  v_item public.service_items;
begin
  select ss.* into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id = ss.service_id
  join public.organization_memberships om on om.organization_id = svc.organization_id and om.user_id = auth.uid()
  where ss.id = p_stage_session_id;

  if not found then raise exception 'stage session not found or not authorized'; end if;
  if v_stage.status <> 'live' then raise exception 'stage session is not live'; end if;

  select * into v_item
  from public.service_items
  where service_id = v_stage.service_id
    and position = p_index
    and song_id = p_song_id
  limit 1;

  if v_item.id is null then raise exception 'service item not found'; end if;

  update public.stage_session_states
  set revision = revision + 1,
      prepared_index = v_item.position,
      prepared_service_item_id = v_item.id,
      prepared_song_id = v_item.song_id,
      updated_at = now()
  where stage_session_id = p_stage_session_id
  returning * into v_state;

  return v_state;
end;
$$;

create or replace function public.target_stage_clear_prepared(p_stage_session_id uuid)
returns public.stage_session_states
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage public.stage_sessions;
  v_state public.stage_session_states;
begin
  select ss.* into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id = ss.service_id
  join public.organization_memberships om on om.organization_id = svc.organization_id and om.user_id = auth.uid()
  where ss.id = p_stage_session_id;

  if not found then raise exception 'stage session not found or not authorized'; end if;

  update public.stage_session_states
  set revision = revision + 1,
      prepared_index = null,
      prepared_service_item_id = null,
      prepared_song_id = null,
      updated_at = now()
  where stage_session_id = p_stage_session_id
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
declare
  v_stage public.stage_sessions;
  v_state public.stage_session_states;
begin
  select ss.* into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id = ss.service_id
  join public.organization_memberships om on om.organization_id = svc.organization_id and om.user_id = auth.uid()
  where ss.id = p_stage_session_id;

  if not found then raise exception 'stage session not found or not authorized'; end if;
  if v_stage.status <> 'live' then raise exception 'stage session is not live'; end if;

  update public.stage_session_states
  set revision = revision + 1,
      md_annotation = left(nullif(trim(p_annotation), ''), 500),
      updated_at = now()
  where stage_session_id = p_stage_session_id
  returning * into v_state;

  return v_state;
end;
$$;

revoke all on function public.get_target_stage_snapshot(uuid),
  public.get_target_stage_snapshot_by_legacy_id(uuid),
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

grant execute on function public.get_target_stage_snapshot(uuid),
  public.get_target_stage_snapshot_by_legacy_id(uuid),
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
