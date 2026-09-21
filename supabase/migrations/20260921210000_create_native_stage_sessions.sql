-- CANTUM: canonical Stage sessions no longer require a legacy Band Stage session.
-- Existing rows retain their legacy mapping for compatibility. New target sessions may be native-only.

alter table public.stage_sessions
  alter column legacy_band_stage_session_id drop not null;

create or replace function public.create_target_stage_session(
  p_service_id uuid,
  p_stage_session_id uuid default gen_random_uuid()
)
returns public.stage_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage public.stage_sessions;
begin
  if not exists (
    select 1
    from public.services svc
    join public.organization_memberships om
      on om.organization_id = svc.organization_id
     and om.user_id = auth.uid()
    where svc.id = p_service_id
  ) then
    raise exception 'service not found or not authorized';
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
    p_stage_session_id,
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

revoke all on function public.create_target_stage_session(uuid,uuid) from public, anon;
grant execute on function public.create_target_stage_session(uuid,uuid) to authenticated;
