-- CANTUM: enable target StageSessionState realtime as an additive migration.
-- The legacy band-stage channel remains active during the transition.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'stage_session_states'
  ) then
    execute 'alter publication supabase_realtime add table public.stage_session_states';
  end if;
end
$$;

drop policy if exists "Stage target members can receive realtime" on realtime.messages;

create policy "Stage target members can receive realtime"
on realtime.messages
for select
to authenticated
using (
  realtime.topic() like 'stage-session:%:state'
  and exists (
    select 1
    from public.stage_sessions ss
    join public.services s on s.id = ss.service_id
    join public.organization_memberships om on om.organization_id = s.organization_id
    where ss.id::text = split_part(realtime.topic(), ':', 2)
      and om.user_id = auth.uid()
  )
);
