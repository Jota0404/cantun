-- CANTUM — Hardening: lifecycle transitions must advance stage revision.
--
-- Starting and ending a session changes observable shared execution state.
-- Those transitions therefore receive a new revision so stale-event filtering
-- cannot hide lifecycle changes from already-connected clients.

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

  update public.band_stage_states
  set revision = revision + 1,
      updated_at = v_now
  where session_id = p_session_id;

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
      revision = revision + 1,
      updated_at = v_now
  where session_id = p_session_id;

  return v_session;
end;
$$;
