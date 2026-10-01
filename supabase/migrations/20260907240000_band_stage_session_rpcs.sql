-- CANTUM — Tarefa L: RPCs e autoridade da BandStageSession
--
-- Stage-session mutations are RPC-only. The authenticated user is always
-- derived from auth.uid(); client-supplied actor/md identities are ignored.
--
-- Lifecycle:
--   create -> lobby
--   start  lobby -> live
--   end    live -> ended
--
-- Operational commands are restricted to the session's current md_user_id
-- and atomically advance the persisted revision.

create or replace function private.require_band_stage_session_access(
  p_session_id uuid
)
returns public.band_stage_sessions
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_session public.band_stage_sessions;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select *
    into v_session
  from public.band_stage_sessions
  where id = p_session_id
    and private.is_band_member(band_id);

  if not found then
    raise exception 'stage session not found or not authorized';
  end if;

  return v_session;
end;
$$;

create or replace function private.require_band_stage_md(
  p_session_id uuid
)
returns public.band_stage_sessions
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_session public.band_stage_sessions;
  v_user_id uuid := auth.uid();
begin
  v_session := private.require_band_stage_session_access(p_session_id);

  if v_session.status = 'ended' then
    raise exception 'stage session has ended';
  end if;

  if v_session.md_user_id <> v_user_id then
    raise exception 'not authorized as stage MD';
  end if;

  return v_session;
end;
$$;

create or replace function public.create_band_stage_session(
  p_band_id uuid,
  p_setlist_id uuid,
  p_md_user_id uuid default null,
  p_session_id uuid default gen_random_uuid()
)
returns public.band_stage_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_md_user_id uuid := coalesce(p_md_user_id, v_user_id);
  v_now timestamptz := now();
  v_session public.band_stage_sessions;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  if not private.has_band_role(p_band_id, array['owner', 'editor']) then
    raise exception 'not authorized to create stage sessions';
  end if;

  if not exists (
    select 1
    from public.band_members bm
    where bm.band_id = p_band_id
      and bm.user_id = v_md_user_id
  ) then
    raise exception 'stage MD must be a member of the band';
  end if;

  if not exists (
    select 1
    from public.band_setlists bs
    where bs.id = p_setlist_id
      and bs.band_id = p_band_id
  ) then
    raise exception 'setlist not found or does not belong to band';
  end if;

  insert into public.band_stage_sessions (
    id,
    band_id,
    setlist_id,
    md_user_id,
    status,
    created_at,
    started_at,
    ended_at,
    updated_at
  ) values (
    p_session_id,
    p_band_id,
    p_setlist_id,
    v_md_user_id,
    'lobby',
    v_now,
    null,
    null,
    v_now
  )
  returning * into v_session;

  insert into public.band_stage_states (
    session_id,
    revision,
    current_index,
    current_song_id,
    current_key,
    is_running,
    updated_at
  ) values (
    p_session_id,
    0,
    0,
    null,
    null,
    false,
    v_now
  );

  return v_session;
exception
  when unique_violation then
    raise exception 'an active stage session already exists for this band';
end;
$$;

create or replace function public.start_band_stage_session(
  p_session_id uuid
)
returns public.band_stage_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.band_stage_sessions;
  v_now timestamptz := now();
begin
  v_session := private.require_band_stage_session_access(p_session_id);

  if not private.has_band_role(v_session.band_id, array['owner', 'editor']) then
    raise exception 'not authorized to start stage sessions';
  end if;

  if v_session.status <> 'lobby' then
    raise exception 'stage session can only start from lobby';
  end if;

  update public.band_stage_sessions
  set status = 'live',
      started_at = v_now,
      updated_at = v_now
  where id = p_session_id
    and status = 'lobby'
  returning * into v_session;

  if not found then
    raise exception 'stage session could not be started';
  end if;

  return v_session;
exception
  when unique_violation then
    raise exception 'another live stage session already exists for this band';
end;
$$;

create or replace function public.end_band_stage_session(
  p_session_id uuid
)
returns public.band_stage_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.band_stage_sessions;
  v_now timestamptz := now();
  v_user_id uuid := auth.uid();
begin
  v_session := private.require_band_stage_session_access(p_session_id);

  if v_session.status <> 'live' then
    raise exception 'only live stage sessions can be ended';
  end if;

  if v_session.md_user_id <> v_user_id then
    raise exception 'not authorized as stage MD';
  end if;

  update public.band_stage_sessions
  set status = 'ended',
      ended_at = v_now,
      updated_at = v_now
  where id = p_session_id
    and status = 'live'
    and md_user_id = v_user_id
  returning * into v_session;

  if not found then
    raise exception 'stage session could not be ended';
  end if;

  update public.band_stage_states
  set is_running = false,
      updated_at = v_now
  where session_id = p_session_id;

  return v_session;
end;
$$;

create or replace function private.mutate_band_stage_state(
  p_session_id uuid,
  p_current_index integer default null,
  p_current_song_id uuid default null,
  p_current_key text default null,
  p_is_running boolean default null
)
returns public.band_stage_states
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.band_stage_sessions;
  v_state public.band_stage_states;
  v_now timestamptz := now();
begin
  v_session := private.require_band_stage_md(p_session_id);

  if v_session.status <> 'live' then
    raise exception 'operational stage commands require a live session';
  end if;

  if p_current_index is not null and p_current_index < 0 then
    raise exception 'current index cannot be negative';
  end if;

  if p_current_song_id is not null and not exists (
    select 1
    from public.band_setlist_songs bss
    where bss.band_setlist_id = v_session.setlist_id
      and bss.band_song_id = p_current_song_id
  ) then
    raise exception 'current song must belong to the session setlist';
  end if;

  update public.band_stage_states
  set current_index = coalesce(p_current_index, current_index),
      current_song_id = case
        when p_current_song_id is not null then p_current_song_id
        else current_song_id
      end,
      current_key = case
        when p_current_key is not null then p_current_key
        else current_key
      end,
      is_running = coalesce(p_is_running, is_running),
      revision = revision + 1,
      updated_at = v_now
  where session_id = p_session_id
  returning * into v_state;

  if not found then
    raise exception 'stage state not found';
  end if;

  return v_state;
end;
$$;

create or replace function public.band_stage_play(
  p_session_id uuid
)
returns public.band_stage_states
language sql
security definer
set search_path = ''
as $$
  select private.mutate_band_stage_state(p_session_id, p_is_running => true);
$$;

create or replace function public.band_stage_pause(
  p_session_id uuid
)
returns public.band_stage_states
language sql
security definer
set search_path = ''
as $$
  select private.mutate_band_stage_state(p_session_id, p_is_running => false);
$$;

create or replace function public.band_stage_goto(
  p_session_id uuid,
  p_index integer,
  p_song_id uuid default null
)
returns public.band_stage_states
language sql
security definer
set search_path = ''
as $$
  select private.mutate_band_stage_state(
    p_session_id,
    p_current_index => p_index,
    p_current_song_id => p_song_id
  );
$$;

create or replace function public.band_stage_set_key(
  p_session_id uuid,
  p_key text
)
returns public.band_stage_states
language sql
security definer
set search_path = ''
as $$
  select private.mutate_band_stage_state(
    p_session_id,
    p_current_key => p_key
  );
$$;

create or replace function public.band_stage_next(
  p_session_id uuid
)
returns public.band_stage_states
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.band_stage_sessions;
  v_current_index integer;
  v_next_index integer;
  v_next_song_id uuid;
begin
  v_session := private.require_band_stage_md(p_session_id);

  if v_session.status <> 'live' then
    raise exception 'operational stage commands require a live session';
  end if;

  select current_index
    into v_current_index
  from public.band_stage_states
  where session_id = p_session_id
  for update;

  if not found then
    raise exception 'stage state not found';
  end if;

  v_next_index := v_current_index + 1;

  select bss.band_song_id
    into v_next_song_id
  from public.band_setlist_songs bss
  where bss.band_setlist_id = v_session.setlist_id
    and bss.position = v_next_index
  limit 1;

  if v_next_song_id is null then
    raise exception 'already at the end of the stage setlist';
  end if;

  return private.mutate_band_stage_state(
    p_session_id,
    p_current_index => v_next_index,
    p_current_song_id => v_next_song_id
  );
end;
$$;

create or replace function public.band_stage_previous(
  p_session_id uuid
)
returns public.band_stage_states
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.band_stage_sessions;
  v_current_index integer;
  v_previous_index integer;
  v_previous_song_id uuid;
begin
  v_session := private.require_band_stage_md(p_session_id);

  if v_session.status <> 'live' then
    raise exception 'operational stage commands require a live session';
  end if;

  select current_index
    into v_current_index
  from public.band_stage_states
  where session_id = p_session_id
  for update;

  if not found then
    raise exception 'stage state not found';
  end if;

  v_previous_index := greatest(v_current_index - 1, 0);

  select bss.band_song_id
    into v_previous_song_id
  from public.band_setlist_songs bss
  where bss.band_setlist_id = v_session.setlist_id
    and bss.position = v_previous_index
  limit 1;

  if v_previous_song_id is null then
    raise exception 'stage setlist has no song at requested index';
  end if;

  return private.mutate_band_stage_state(
    p_session_id,
    p_current_index => v_previous_index,
    p_current_song_id => v_previous_song_id
  );
end;
$$;

create or replace function public.get_band_stage_snapshot(
  p_session_id uuid
)
returns table (
  session public.band_stage_sessions,
  state public.band_stage_states
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  return query
  select s, st
  from public.band_stage_sessions s
  join public.band_stage_states st on st.session_id = s.id
  where s.id = p_session_id
    and private.is_band_member(s.band_id);

  if not found then
    raise exception 'stage session not found or not authorized';
  end if;
end;
$$;

-- The public RPC surface is executable only by authenticated users. The
-- private helpers remain callable by authenticated RPC execution context only.
revoke execute on function public.create_band_stage_session(uuid, uuid, uuid, uuid),
  public.start_band_stage_session(uuid),
  public.end_band_stage_session(uuid),
  public.band_stage_play(uuid),
  public.band_stage_pause(uuid),
  public.band_stage_goto(uuid, integer, uuid),
  public.band_stage_set_key(uuid, text),
  public.band_stage_next(uuid),
  public.band_stage_previous(uuid),
  public.get_band_stage_snapshot(uuid)
  from public, anon;

grant execute on function public.create_band_stage_session(uuid, uuid, uuid, uuid),
  public.start_band_stage_session(uuid),
  public.end_band_stage_session(uuid),
  public.band_stage_play(uuid),
  public.band_stage_pause(uuid),
  public.band_stage_goto(uuid, integer, uuid),
  public.band_stage_set_key(uuid, text),
  public.band_stage_next(uuid),
  public.band_stage_previous(uuid),
  public.get_band_stage_snapshot(uuid)
  to authenticated;

revoke all on function private.require_band_stage_session_access(uuid),
  private.require_band_stage_md(uuid),
  private.mutate_band_stage_state(uuid, integer, uuid, text, boolean)
  from public;

grant execute on function private.require_band_stage_session_access(uuid),
  private.require_band_stage_md(uuid),
  private.mutate_band_stage_state(uuid, integer, uuid, text, boolean)
  to authenticated;

revoke insert, update, delete on public.band_stage_sessions from authenticated;
revoke insert, update, delete on public.band_stage_states from authenticated;
