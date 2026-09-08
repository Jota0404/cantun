-- CANTUM — Tarefa K: Schema da Sessão de Modo Banda
--
-- Persistent foundation for BandStageSession + BandStageState.
-- Runtime commands, RPCs and Realtime transport belong to later tasks.

create table public.band_stage_sessions (
  id uuid primary key,
  band_id uuid not null references public.bands(id) on delete cascade,
  setlist_id uuid not null references public.band_setlists(id) on delete restrict,
  md_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'lobby'
    check (status in ('lobby', 'live', 'ended')),
  created_at timestamptz not null,
  started_at timestamptz,
  ended_at timestamptz,
  updated_at timestamptz not null,
  check ((status = 'lobby' and started_at is null and ended_at is null)
      or (status = 'live' and started_at is not null and ended_at is null)
      or (status = 'ended' and ended_at is not null))
);

create table public.band_stage_states (
  session_id uuid primary key references public.band_stage_sessions(id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0),
  current_index integer not null default 0 check (current_index >= 0),
  current_song_id uuid,
  current_key text,
  is_running boolean not null default false,
  updated_at timestamptz not null,
  constraint band_stage_states_current_song_fk
    foreign key (current_song_id) references public.band_songs(id) on delete restrict
);

create index band_stage_sessions_band_status_idx
  on public.band_stage_sessions(band_id, status);

create index band_stage_sessions_setlist_idx
  on public.band_stage_sessions(setlist_id);

create index band_stage_sessions_md_user_idx
  on public.band_stage_sessions(md_user_id);

create index band_stage_states_revision_idx
  on public.band_stage_states(session_id, revision);

-- A session must reference a setlist belonging to the same band and the MD
-- must be an existing member of that band. These are structural invariants;
-- authorization for who may create/start/end a session remains an RPC/domain
-- responsibility in the next increment.
create or replace function private.protect_band_stage_session_invariants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.band_setlists bs
    where bs.id = new.setlist_id
      and bs.band_id = new.band_id
  ) then
    raise exception 'band stage session setlist must belong to the same band';
  end if;

  if not exists (
    select 1
    from public.band_members bm
    where bm.band_id = new.band_id
      and bm.user_id = new.md_user_id
  ) then
    raise exception 'band stage session md must be a band member';
  end if;

  if tg_op = 'UPDATE' then
    if new.band_id <> old.band_id then
      raise exception 'band stage session band cannot be changed';
    end if;
    if new.setlist_id <> old.setlist_id then
      raise exception 'band stage session setlist cannot be changed';
    end if;
    if old.status = 'ended' and new.status <> 'ended' then
      raise exception 'ended band stage session is terminal';
    end if;
    if old.status = 'live' and new.status = 'lobby' then
      raise exception 'live band stage session cannot return to lobby';
    end if;
  end if;

  if new.status = 'lobby' then
    if new.started_at is not null or new.ended_at is not null then
      raise exception 'lobby band stage session cannot have start/end timestamps';
    end if;
  elsif new.status = 'live' then
    if new.started_at is null or new.ended_at is not null then
      raise exception 'live band stage session requires started_at and no ended_at';
    end if;
  elsif new.status = 'ended' then
    if new.ended_at is null then
      raise exception 'ended band stage session requires ended_at';
    end if;
  end if;

  return new;
end;
$$;

create trigger band_stage_sessions_protect_invariants
before insert or update on public.band_stage_sessions
for each row execute function private.protect_band_stage_session_invariants();

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

-- Public clients can read session state only when they are members of the
-- underlying band. Mutation authorization is intentionally deferred to RPCs.
alter table public.band_stage_sessions enable row level security;
alter table public.band_stage_states enable row level security;

revoke all on table public.band_stage_sessions, public.band_stage_states from anon;
grant select, insert, update, delete on table public.band_stage_sessions, public.band_stage_states to authenticated;

create policy "Band members can read stage sessions"
on public.band_stage_sessions
for select to authenticated
using (private.is_band_member(band_id));

create policy "Band members can read stage states"
on public.band_stage_states
for select to authenticated
using (
  exists (
    select 1
    from public.band_stage_sessions bss
    where bss.id = session_id
      and private.is_band_member(bss.band_id)
  )
);

-- No direct mutation policies are granted yet. The next increment should use
-- protected RPCs so creation, lifecycle transitions and operational writes
-- validate the authenticated user and MD authority atomically.

drop policy if exists "Band members can insert stage sessions"
  on public.band_stage_sessions;
drop policy if exists "Band members can update stage sessions"
  on public.band_stage_sessions;
drop policy if exists "Band members can delete stage sessions"
  on public.band_stage_sessions;
drop policy if exists "Band members can insert stage states"
  on public.band_stage_states;
drop policy if exists "Band members can update stage states"
  on public.band_stage_states;
drop policy if exists "Band members can delete stage states"
  on public.band_stage_states;

revoke all on function private.protect_band_stage_session_invariants() from public;
revoke all on function private.protect_band_stage_state_invariants() from public;
