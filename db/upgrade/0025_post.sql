\set ON_ERROR_STOP on
\o /dev/null
do $$
begin
  if (select array_agg(id::text order by id) from public.stage_sessions where status in ('lobby', 'live')) is distinct from
     array['70000000-0000-0000-0000-000000002512', '70000000-0000-0000-0000-000000002521', '70000000-0000-0000-0000-000000002532'] then
    raise exception 'deveria sobrar uma aberta por serviço: a ao vivo, senão a mais recente (created_at desc, id desc)';
  end if;
  if exists (select 1 from public.stage_sessions
             where id in ('70000000-0000-0000-0000-000000002511', '70000000-0000-0000-0000-000000002513', '70000000-0000-0000-0000-000000002531')
               and (status <> 'ended' or ended_at is null)) then
    raise exception 'as duplicadas deveriam estar encerradas com ended_at';
  end if;
  if (select ended_at <> '2026-10-19 11:00+00' from public.stage_sessions where id = '70000000-0000-0000-0000-000000002514') then
    raise exception 'a sessão já encerrada não deveria mudar';
  end if;
  if exists (select 1 from public.stage_session_states
             where stage_session_id in ('70000000-0000-0000-0000-000000002511', '70000000-0000-0000-0000-000000002513', '70000000-0000-0000-0000-000000002531')
               and (revision <> 1 or is_running)) then
    raise exception 'encerrar deveria incrementar a revision uma vez e parar o auto-scroll';
  end if;
  if exists (select 1 from public.stage_session_states
             where stage_session_id in ('70000000-0000-0000-0000-000000002512', '70000000-0000-0000-0000-000000002521') and revision <> 0)
     or not (select is_running from public.stage_session_states where stage_session_id = '70000000-0000-0000-0000-000000002512') then
    raise exception 'as sessões mantidas não deveriam mudar';
  end if;
end $$;
