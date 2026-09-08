-- CANTUM — Tarefa V: preparação e transição do Modo Banda
--
-- Prepared-next is persisted in the same authoritative stage state as current
-- execution. Only the operational MD may prepare, clear or promote it.

alter table public.band_stage_states
  add column if not exists prepared_index integer,
  add column if not exists prepared_song_id uuid;

alter table public.band_stage_states
  drop constraint if exists band_stage_states_prepared_song_fk;

alter table public.band_stage_states
  add constraint band_stage_states_prepared_song_fk
  foreign key (prepared_song_id) references public.band_songs(id) on delete restrict;

alter table public.band_stage_states
  drop constraint if exists band_stage_states_prepared_index_check;

alter table public.band_stage_states
  add constraint band_stage_states_prepared_index_check
  check (prepared_index is null or prepared_index >= 0);

create or replace function private.protect_band_stage_state_invariants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_band_id uuid;
  v_setlist_id uuid;
begin
  select band_id, setlist_id
    into v_band_id, v_setlist_id
  from public.band_stage_sessions
  where id = new.session_id;

  if v_band_id is null then
    raise exception 'band stage state session not found';
  end if;

  if new.current_song_id is not null and not exists (
    select 1
    from public.band_setlist_songs bss
    where bss.band_setlist_id = v_setlist_id
      and bss.band_song_id = new.current_song_id
  ) then
    raise exception 'current stage song must belong to the session setlist';
  end if;

  if new.prepared_song_id is not null and not exists (
    select 1
    from public.band_setlist_songs bss
    where bss.band_setlist_id = v_setlist_id
      and bss.band_song_id = new.prepared_song_id
      and (new.prepared_index is null or bss.position = new.prepared_index)
  ) then
    raise exception 'prepared stage song must belong to the session setlist at the prepared index';
  end if;

  if new.prepared_song_id is null and new.prepared_index is not null then
    raise exception 'prepared index requires prepared song';
  end if;

  if new.prepared_song_id is not null and new.prepared_index is null then
    raise exception 'prepared song requires prepared index';
  end if;

  if tg_op = 'UPDATE' and new.session_id <> old.session_id then
    raise exception 'band stage state session identity cannot be changed';
  end if;

  if tg_op = 'UPDATE' and new.revision < old.revision then
    raise exception 'band stage state revision cannot decrease';
  end if;

  return new;
end;
$$;

create trigger band_stage_states_protect_invariants
before insert or update on public.band_stage_states
for each row execute function private.protect_band_stage_state_invariants();

-- Keep the existing next command as the single navigation semantic. When a
-- preparation exists, next promotes it to current and clears preparation.
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
  v_state public.band_stage_states;
  v_now timestamptz := now();
  v_next_index integer;
  v_next_song_id uuid;
begin
  v_session := private.require_band_stage_md(p_session_id);

  if v_session.status <> 'live' then
    raise exception 'operational stage commands require a live session';
  end if;

  select *
    into v_state
  from public.band_stage_states
  where session_id = p_session_id
  for update;

  if not found then
    raise exception 'stage state not found';
  end if;

  if v_state.prepared_song_id is not null then
    update public.band_stage_states
    set current_index = v_state.prepared_index,
        current_song_id = v_state.prepared_song_id,
        prepared_index = null,
        prepared_song_id = null,
        revision = revision + 1,
        updated_at = v_now
    where session_id = p_session_id
    returning * into v_state;

    return v_state;
  end if;

  v_next_index := v_state.current_index + 1;

  select bss.band_song_id
    into v_next_song_id
  from public.band_setlist_songs bss
  where bss.band_setlist_id = v_session.setlist_id
    and bss.position = v_next_index
  limit 1;

  if v_next_song_id is null then
    raise exception 'already at the end of the stage setlist';
  end if;

  update public.band_stage_states
  set current_index = v_next_index,
      current_song_id = v_next_song_id,
      revision = revision + 1,
      updated_at = v_now
  where session_id = p_session_id
  returning * into v_state;

  return v_state;
end;
$$;

create or replace function public.band_stage_prepare_next(
  p_session_id uuid,
  p_index integer,
  p_song_id uuid
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
  v_actual_song_id uuid;
begin
  v_session := private.require_band_stage_md(p_session_id);

  if v_session.status <> 'live' then
    raise exception 'operational stage commands require a live session';
  end if;

  if p_index < 0 then
    raise exception 'prepared index cannot be negative';
  end if;

  select bss.band_song_id
    into v_actual_song_id
  from public.band_setlist_songs bss
  where bss.band_setlist_id = v_session.setlist_id
    and bss.position = p_index;

  if not found or v_actual_song_id <> p_song_id then
    raise exception 'prepared song must match a song at the requested setlist index';
  end if;

  update public.band_stage_states
  set prepared_index = p_index,
      prepared_song_id = p_song_id,
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

create or replace function public.band_stage_clear_prepared(
  p_session_id uuid
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

  update public.band_stage_states
  set prepared_index = null,
      prepared_song_id = null,
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

revoke all on function public.band_stage_prepare_next(uuid, integer, uuid),
  public.band_stage_clear_prepared(uuid)
  from public, anon;

grant execute on function public.band_stage_prepare_next(uuid, integer, uuid),
  public.band_stage_clear_prepared(uuid)
  to authenticated;

-- Re-assert RPC-only mutation for the state table after adding the new fields.
revoke insert, update, delete on public.band_stage_states from authenticated;
