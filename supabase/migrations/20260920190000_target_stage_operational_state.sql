-- CANTUM: move Stage operational state behind the target Service/StageSession model.
-- Legacy BandStage remains the compatibility runtime/projection during migration.
-- Target state is canonical for application reads/commands, while legacy RPCs are
-- still invoked internally so existing realtime/control behavior remains intact.

create table if not exists public.stage_session_states (
  stage_session_id uuid primary key references public.stage_sessions(id) on delete cascade,
  revision integer not null default 0,
  current_index integer not null default 0,
  current_service_item_id uuid references public.service_items(id) on delete set null,
  current_song_id uuid references public.songs(id) on delete set null,
  current_key text,
  prepared_index integer,
  prepared_service_item_id uuid references public.service_items(id) on delete set null,
  prepared_song_id uuid references public.songs(id) on delete set null,
  is_running boolean not null default false,
  md_annotation text,
  updated_at timestamptz not null default now()
);

create index if not exists stage_session_states_current_song_idx
  on public.stage_session_states(current_song_id);

alter table public.stage_session_states enable row level security;

create policy "organization members can read stage session states"
  on public.stage_session_states for select to authenticated
  using (
    exists (
      select 1
      from public.stage_sessions ss
      join public.services svc on svc.id = ss.service_id
      join public.organization_memberships om
        on om.organization_id = svc.organization_id
      where ss.id = stage_session_states.stage_session_id
        and om.user_id = auth.uid()
    )
  );

grant select on public.stage_session_states to authenticated;

revoke all on function public.sync_target_stage_state(uuid, public.band_stage_states),
  public.initialize_target_stage_state()
from public, anon, authenticated;

create or replace function public.sync_target_stage_state(
  p_stage_session_id uuid,
  p_legacy_state public.band_stage_states
)
returns public.stage_session_states
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_service_id uuid;
  v_current_service_item_id uuid;
  v_prepared_service_item_id uuid;
  v_current_song_id uuid;
  v_prepared_song_id uuid;
  v_state public.stage_session_states;
begin
  select ss.service_id
    into v_service_id
  from public.stage_sessions ss
  where ss.id = p_stage_session_id;

  if v_service_id is null then
    raise exception 'stage session not found';
  end if;

  select si.id, si.song_id
    into v_current_service_item_id, v_current_song_id
  from public.service_items si
  where si.service_id = v_service_id
    and si.position = p_legacy_state.current_index
  limit 1;

  if p_legacy_state.prepared_index is not null then
    select si.id, si.song_id
      into v_prepared_service_item_id, v_prepared_song_id
    from public.service_items si
    where si.service_id = v_service_id
      and si.position = p_legacy_state.prepared_index
    limit 1;
  end if;

  insert into public.stage_session_states (
    stage_session_id,
    revision,
    current_index,
    current_service_item_id,
    current_song_id,
    current_key,
    prepared_index,
    prepared_service_item_id,
    prepared_song_id,
    is_running,
    md_annotation,
    updated_at
  )
  values (
    p_stage_session_id,
    p_legacy_state.revision,
    p_legacy_state.current_index,
    v_current_service_item_id,
    v_current_song_id,
    p_legacy_state.current_key,
    p_legacy_state.prepared_index,
    v_prepared_service_item_id,
    v_prepared_song_id,
    p_legacy_state.is_running,
    p_legacy_state.md_annotation,
    p_legacy_state.updated_at
  )
  on conflict (stage_session_id) do update set
    revision = excluded.revision,
    current_index = excluded.current_index,
    current_service_item_id = excluded.current_service_item_id,
    current_song_id = excluded.current_song_id,
    current_key = excluded.current_key,
    prepared_index = excluded.prepared_index,
    prepared_service_item_id = excluded.prepared_service_item_id,
    prepared_song_id = excluded.prepared_song_id,
    is_running = excluded.is_running,
    md_annotation = excluded.md_annotation,
    updated_at = excluded.updated_at
  returning * into v_state;

  return v_state;
end;
$$;

create or replace function public.initialize_target_stage_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_legacy_state public.band_stage_states;
begin
  select *
    into v_legacy_state
  from public.band_stage_states
  where session_id = new.legacy_band_stage_session_id;

  if v_legacy_state.session_id is not null then
    perform public.sync_target_stage_state(new.id, v_legacy_state);
  else
    insert into public.stage_session_states(stage_session_id)
    values (new.id)
    on conflict (stage_session_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists stage_sessions_initialize_target_state on public.stage_sessions;
create trigger stage_sessions_initialize_target_state
after insert on public.stage_sessions
for each row execute function public.initialize_target_stage_state();

-- Backfill sessions that existed before this migration.
insert into public.stage_session_states(stage_session_id)
select ss.id
from public.stage_sessions ss
where not exists (
  select 1 from public.stage_session_states ts
  where ts.stage_session_id = ss.id
)
on conflict (stage_session_id) do nothing;

do $$
declare
  r record;
begin
  for r in
    select ss.id as stage_session_id, bs
    from public.stage_sessions ss
    join public.band_stage_states bs
      on bs.session_id = ss.legacy_band_stage_session_id
  loop
    perform public.sync_target_stage_state(r.stage_session_id, r.bs);
  end loop;
end;
$$;

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
  v_legacy public.band_stage_sessions;
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
    into v_legacy
  from public.band_stage_sessions
  where id = v_stage.legacy_band_stage_session_id;

  select *
    into v_state
  from public.stage_session_states
  where stage_session_id = p_stage_session_id;

  if v_state.stage_session_id is null then
    select public.sync_target_stage_state(
      v_stage.id,
      bs
    )
    into v_state
    from public.band_stage_states bs
    where bs.session_id = v_stage.legacy_band_stage_session_id;
  end if;

  return jsonb_build_object(
    'session', to_jsonb(v_legacy),
    'state', to_jsonb(v_state) || jsonb_build_object('session_id', v_legacy.id)
  );
end;
$$;

create or replace function public.get_target_stage_snapshot_by_legacy_id(
  p_legacy_session_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $
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
$;

revoke all on function public.get_target_stage_snapshot_by_legacy_id(uuid) from public, anon;
grant execute on function public.get_target_stage_snapshot_by_legacy_id(uuid) to authenticated;

create or replace function public.target_stage_start(p_stage_session_id uuid)
returns public.stage_session_states
language plpgsql
security definer
set search_path = ''
as $
declare
  v_stage public.stage_sessions;
  v_legacy public.band_stage_sessions;
  v_state public.band_stage_states;
begin
  select ss.* into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id = ss.service_id
  join public.organization_memberships om on om.organization_id = svc.organization_id and om.user_id = auth.uid()
  where ss.id = p_stage_session_id;
  if not found then raise exception 'stage session not found or not authorized'; end if;

  select * into v_legacy from public.start_band_stage_session(v_stage.legacy_band_stage_session_id);

  update public.stage_sessions
  set status = v_legacy.status,
      started_at = v_legacy.started_at,
      ended_at = v_legacy.ended_at,
      updated_at = now()
  where id = p_stage_session_id;

  select * into v_state
  from public.band_stage_states
  where session_id = v_stage.legacy_band_stage_session_id;

  return public.sync_target_stage_state(p_stage_session_id, v_state);
end;
$;

create or replace function public.target_stage_end(p_stage_session_id uuid)
returns public.stage_session_states
language plpgsql
security definer
set search_path = ''
as $
declare
  v_stage public.stage_sessions;
  v_legacy public.band_stage_sessions;
  v_state public.band_stage_states;
begin
  select ss.* into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id = ss.service_id
  join public.organization_memberships om on om.organization_id = svc.organization_id and om.user_id = auth.uid()
  where ss.id = p_stage_session_id;
  if not found then raise exception 'stage session not found or not authorized'; end if;

  select * into v_legacy from public.end_band_stage_session(v_stage.legacy_band_stage_session_id);

  update public.stage_sessions
  set status = v_legacy.status,
      started_at = v_legacy.started_at,
      ended_at = v_legacy.ended_at,
      updated_at = now()
  where id = p_stage_session_id;

  select * into v_state
  from public.band_stage_states
  where session_id = v_stage.legacy_band_stage_session_id;

  return public.sync_target_stage_state(p_stage_session_id, v_state);
end;
$;

create or replace function public.target_stage_play(p_stage_session_id uuid)
returns public.stage_session_states
language plpgsql
security definer
set search_path = ''
as $$
declare v_stage public.stage_sessions; v_legacy public.band_stage_sessions; v_state public.band_stage_states;
begin
  select ss.* into v_stage from public.stage_sessions ss
  join public.services svc on svc.id=ss.service_id
  join public.organization_memberships om on om.organization_id=svc.organization_id and om.user_id=auth.uid()
  where ss.id=p_stage_session_id;
  if not found then raise exception 'stage session not found or not authorized'; end if;
  select * into v_legacy from public.band_stage_sessions where id=v_stage.legacy_band_stage_session_id;
  if v_legacy.status <> 'live' then raise exception 'stage session is not live'; end if;
  select * into v_state from public.band_stage_play(v_stage.legacy_band_stage_session_id);
  return public.sync_target_stage_state(p_stage_session_id, v_state);
end;
$$;

create or replace function public.target_stage_pause(p_stage_session_id uuid)
returns public.stage_session_states
language plpgsql
security definer
set search_path = ''
as $$
declare v_stage public.stage_sessions; v_state public.band_stage_states;
begin
  select ss.* into v_stage from public.stage_sessions ss
  join public.services svc on svc.id=ss.service_id
  join public.organization_memberships om on om.organization_id=svc.organization_id and om.user_id=auth.uid()
  where ss.id=p_stage_session_id;
  if not found then raise exception 'stage session not found or not authorized'; end if;
  select * into v_state from public.band_stage_pause(v_stage.legacy_band_stage_session_id);
  return public.sync_target_stage_state(p_stage_session_id, v_state);
end;
$$;

create or replace function public.target_stage_next(p_stage_session_id uuid)
returns public.stage_session_states
language plpgsql
security definer
set search_path = ''
as $$
declare v_stage public.stage_sessions; v_state public.band_stage_states;
begin
  select ss.* into v_stage from public.stage_sessions ss
  join public.services svc on svc.id=ss.service_id
  join public.organization_memberships om on om.organization_id=svc.organization_id and om.user_id=auth.uid()
  where ss.id=p_stage_session_id;
  if not found then raise exception 'stage session not found or not authorized'; end if;
  select * into v_state from public.band_stage_next(v_stage.legacy_band_stage_session_id);
  return public.sync_target_stage_state(p_stage_session_id, v_state);
end;
$$;

create or replace function public.target_stage_previous(p_stage_session_id uuid)
returns public.stage_session_states
language plpgsql
security definer
set search_path = ''
as $$
declare v_stage public.stage_sessions; v_state public.band_stage_states;
begin
  select ss.* into v_stage from public.stage_sessions ss
  join public.services svc on svc.id=ss.service_id
  join public.organization_memberships om on om.organization_id=svc.organization_id and om.user_id=auth.uid()
  where ss.id=p_stage_session_id;
  if not found then raise exception 'stage session not found or not authorized'; end if;
  select * into v_state from public.band_stage_previous(v_stage.legacy_band_stage_session_id);
  return public.sync_target_stage_state(p_stage_session_id, v_state);
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
declare v_stage public.stage_sessions; v_state public.band_stage_states;
begin
  select ss.* into v_stage from public.stage_sessions ss
  join public.services svc on svc.id=ss.service_id
  join public.organization_memberships om on om.organization_id=svc.organization_id and om.user_id=auth.uid()
  where ss.id=p_stage_session_id;
  if not found then raise exception 'stage session not found or not authorized'; end if;
  select * into v_state from public.band_stage_goto(
    v_stage.legacy_band_stage_session_id,
    p_index,
    (
      select lm.band_song_id
      from private.legacy_band_song_mappings lm
      join public.services svc on svc.id = v_stage.service_id
      where lm.organization_id = svc.organization_id
        and lm.song_id = p_song_id
      limit 1
    )
  );
  return public.sync_target_stage_state(p_stage_session_id, v_state);
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
declare v_stage public.stage_sessions; v_state public.band_stage_states;
begin
  select ss.* into v_stage from public.stage_sessions ss
  join public.services svc on svc.id=ss.service_id
  join public.organization_memberships om on om.organization_id=svc.organization_id and om.user_id=auth.uid()
  where ss.id=p_stage_session_id;
  if not found then raise exception 'stage session not found or not authorized'; end if;
  select * into v_state from public.band_stage_set_key(v_stage.legacy_band_stage_session_id, p_key);
  return public.sync_target_stage_state(p_stage_session_id, v_state);
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
declare v_stage public.stage_sessions; v_state public.band_stage_states;
begin
  select ss.* into v_stage from public.stage_sessions ss
  join public.services svc on svc.id=ss.service_id
  join public.organization_memberships om on om.organization_id=svc.organization_id and om.user_id=auth.uid()
  where ss.id=p_stage_session_id;
  if not found then raise exception 'stage session not found or not authorized'; end if;
  select * into v_state from public.band_stage_prepare_next(
    v_stage.legacy_band_stage_session_id,
    p_index,
    (
      select lm.band_song_id
      from private.legacy_band_song_mappings lm
      join public.services svc on svc.id = v_stage.service_id
      where lm.organization_id = svc.organization_id
        and lm.song_id = p_song_id
      limit 1
    )
  );
  return public.sync_target_stage_state(p_stage_session_id, v_state);
end;
$$;

create or replace function public.target_stage_clear_prepared(p_stage_session_id uuid)
returns public.stage_session_states
language plpgsql
security definer
set search_path = ''
as $$
declare v_stage public.stage_sessions; v_state public.band_stage_states;
begin
  select ss.* into v_stage from public.stage_sessions ss
  join public.services svc on svc.id=ss.service_id
  join public.organization_memberships om on om.organization_id=svc.organization_id and om.user_id=auth.uid()
  where ss.id=p_stage_session_id;
  if not found then raise exception 'stage session not found or not authorized'; end if;
  select * into v_state from public.band_stage_clear_prepared(v_stage.legacy_band_stage_session_id);
  return public.sync_target_stage_state(p_stage_session_id, v_state);
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
declare v_stage public.stage_sessions; v_state public.band_stage_states;
begin
  select ss.* into v_stage from public.stage_sessions ss
  join public.services svc on svc.id=ss.service_id
  join public.organization_memberships om on om.organization_id=svc.organization_id and om.user_id=auth.uid()
  where ss.id=p_stage_session_id;
  if not found then raise exception 'stage session not found or not authorized'; end if;
  select * into v_state from public.band_stage_set_annotation(v_stage.legacy_band_stage_session_id, p_annotation);
  return public.sync_target_stage_state(p_stage_session_id, v_state);
end;
$$;

revoke all on function public.get_target_stage_snapshot(uuid),
  public.target_stage_play(uuid),
  public.target_stage_pause(uuid),
  public.target_stage_next(uuid),
  public.target_stage_previous(uuid),
  public.target_stage_goto(uuid,integer,uuid),
  public.target_stage_set_key(uuid,text),
  public.target_stage_prepare_next(uuid,integer,uuid),
  public.target_stage_clear_prepared(uuid),
  public.target_stage_set_annotation(uuid,text),
  public.target_stage_start(uuid),
  public.target_stage_end(uuid)
from public, anon;

grant execute on function public.get_target_stage_snapshot(uuid),
  public.target_stage_play(uuid),
  public.target_stage_pause(uuid),
  public.target_stage_next(uuid),
  public.target_stage_previous(uuid),
  public.target_stage_goto(uuid,integer,uuid),
  public.target_stage_set_key(uuid,text),
  public.target_stage_prepare_next(uuid,integer,uuid),
  public.target_stage_clear_prepared(uuid),
  public.target_stage_set_annotation(uuid,text),
  public.target_stage_start(uuid),
  public.target_stage_end(uuid)
to authenticated;
