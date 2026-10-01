-- Resolve a target StageSession from the legacy runtime session id.
create or replace function public.get_stage_session_by_legacy_id(p_legacy_session_id uuid)
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

revoke all on function public.get_stage_session_by_legacy_id(uuid) from public, anon;
grant execute on function public.get_stage_session_by_legacy_id(uuid) to authenticated;
