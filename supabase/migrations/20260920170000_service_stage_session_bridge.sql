-- CANTUM: bridge Service -> StageSession.
-- Stage realtime/state remain implemented by the legacy BandStage runtime.

create table if not exists public.stage_sessions (
  id uuid primary key,
  service_id uuid not null references public.services(id) on delete cascade,
  legacy_band_stage_session_id uuid not null references public.band_stage_sessions(id) on delete restrict,
  status text not null check (status in ('lobby','live','ended')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (legacy_band_stage_session_id)
);

create index if not exists stage_sessions_service_id_idx on public.stage_sessions(service_id);

alter table public.stage_sessions enable row level security;

create policy "organization members can read stage sessions"
on public.stage_sessions for select to authenticated
using (
  exists (
    select 1 from public.services s
    join public.organization_memberships om on om.organization_id = s.organization_id
    where s.id = stage_sessions.service_id and om.user_id = auth.uid()
  )
);

grant select on public.stage_sessions to authenticated;

create or replace function public.create_service_stage_session(
  p_service_id uuid,
  p_session_id uuid default gen_random_uuid()
)
returns public.stage_sessions
language plpgsql security definer set search_path = ''
as $$
declare
  v_service public.services;
  v_repertoire_id uuid;
  v_legacy public.band_stage_sessions;
  v_stage public.stage_sessions;
  v_now timestamptz := now();
begin
  select * into v_service from public.services s
  where s.id = p_service_id and exists (
    select 1 from public.organization_memberships om
    where om.organization_id = s.organization_id and om.user_id = auth.uid()
  );
  if not found then raise exception 'service not found or not authorized'; end if;

  if not exists (
    select 1 from public.organization_memberships om
    where om.organization_id = v_service.organization_id
      and om.user_id = auth.uid() and om.role in ('owner','admin')
  ) then raise exception 'not authorized to create stage sessions'; end if;

  select si.repertoire_id into v_repertoire_id
  from public.service_items si
  where si.service_id = p_service_id and si.repertoire_id is not null
  order by si.position limit 1;

  if v_repertoire_id is null then
    raise exception 'service must contain at least one repertoire-backed item before starting stage';
  end if;

  perform public.create_band_stage_session(v_service.organization_id, v_repertoire_id, auth.uid());

  select * into v_legacy from public.band_stage_sessions
  where band_id = v_service.organization_id
    and setlist_id = v_repertoire_id
    and md_user_id = auth.uid() and status = 'lobby'
  order by created_at desc limit 1;

  if v_legacy.id is null then raise exception 'legacy stage session bridge could not be created'; end if;

  insert into public.stage_sessions(id, service_id, legacy_band_stage_session_id, status, created_at, updated_at)
  values (p_session_id, p_service_id, v_legacy.id, v_legacy.status, v_now, v_now)
  returning * into v_stage;
  return v_stage;
end;
$$;

create or replace function public.start_service_stage_session(p_stage_session_id uuid)
returns public.stage_sessions
language plpgsql security definer set search_path = ''
as $$
declare v_stage public.stage_sessions; v_legacy public.band_stage_sessions;
begin
  select * into v_stage from public.stage_sessions ss
  where ss.id = p_stage_session_id and exists (
    select 1 from public.services s join public.organization_memberships om on om.organization_id=s.organization_id
    where s.id=ss.service_id and om.user_id=auth.uid()
  );
  if not found then raise exception 'stage session not found or not authorized'; end if;
  select * into v_legacy from public.start_band_stage_session(v_stage.legacy_band_stage_session_id);
  update public.stage_sessions set status=v_legacy.status, started_at=v_legacy.started_at, ended_at=v_legacy.ended_at, updated_at=now()
  where id=p_stage_session_id returning * into v_stage;
  return v_stage;
end;
$$;

create or replace function public.end_service_stage_session(p_stage_session_id uuid)
returns public.stage_sessions
language plpgsql security definer set search_path = ''
as $$
declare v_stage public.stage_sessions; v_legacy public.band_stage_sessions;
begin
  select * into v_stage from public.stage_sessions ss
  where ss.id=p_stage_session_id and exists (
    select 1 from public.services s join public.organization_memberships om on om.organization_id=s.organization_id
    where s.id=ss.service_id and om.user_id=auth.uid()
  );
  if not found then raise exception 'stage session not found or not authorized'; end if;
  select * into v_legacy from public.end_band_stage_session(v_stage.legacy_band_stage_session_id);
  update public.stage_sessions set status=v_legacy.status, started_at=v_legacy.started_at, ended_at=v_legacy.ended_at, updated_at=now()
  where id=p_stage_session_id returning * into v_stage;
  return v_stage;
end;
$$;

create or replace function public.get_service_stage_session(p_stage_session_id uuid)
returns public.stage_sessions
language sql stable security definer set search_path = ''
as $$
  select ss from public.stage_sessions ss
  join public.services s on s.id=ss.service_id
  join public.organization_memberships om on om.organization_id=s.organization_id
  where ss.id=p_stage_session_id and om.user_id=auth.uid();
$$;

revoke all on function public.create_service_stage_session(uuid,uuid), public.start_service_stage_session(uuid), public.end_service_stage_session(uuid), public.get_service_stage_session(uuid) from public, anon;
grant execute on function public.create_service_stage_session(uuid,uuid), public.start_service_stage_session(uuid), public.end_service_stage_session(uuid), public.get_service_stage_session(uuid) to authenticated;
