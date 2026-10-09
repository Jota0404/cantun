-- CANTUM — tempo real do Modo Palco (ADR-059 §6, docs/REALTIME_CONTRACT.md §3 e §6.1).
--
-- * app.can_subscribe_stage_session: quem pode assinar stage-session:<id>
--   (membro da organização dona do serviço; mesma regra de get_target_stage_snapshot).
-- * Trigger que avisa o servidor (LISTEN stage_state_changed) quando a revision muda.
--   O payload leva só o id e a revision; o servidor relê o snapshot com a identidade
--   de cada assinante.

create function app.can_subscribe_stage_session(p_stage_session_id uuid) returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select coalesce((
    select app.is_organization_member(svc.organization_id)
    from public.stage_sessions ss
    join public.services svc on svc.id = ss.service_id
    where ss.id = p_stage_session_id
  ), false)
$$;
revoke all on function app.can_subscribe_stage_session(uuid) from public;
grant execute on function app.can_subscribe_stage_session(uuid) to cantum_user;

create function private.notify_stage_state_changed() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  perform pg_notify('stage_state_changed',
    json_build_object('stage_session_id', new.stage_session_id, 'revision', new.revision)::text);
  return null;
end;
$$;
revoke all on function private.notify_stage_state_changed() from public;

create trigger stage_session_states_notify
  after update on public.stage_session_states
  for each row
  when (old.revision is distinct from new.revision)
  execute function private.notify_stage_state_changed();
