-- Dados no schema da 0024: sessões de Palco abertas duplicadas por serviço ("Iniciar palco" repetido).
-- S1: três abertas (a ao vivo, de MD nulo, não é a mais recente) + uma encerrada · S2: uma aberta · S3: duas abertas com o mesmo created_at.
insert into app.users (id, email, display_name) values
  ('00000000-0000-0000-0000-000000002581', 'a@up25.local', 'A');
insert into public.organizations (id, name) values ('10000000-0000-0000-0000-000000002581', 'O');
insert into public.organization_memberships (organization_id, user_id, role)
  values ('10000000-0000-0000-0000-000000002581', '00000000-0000-0000-0000-000000002581', 'owner');
insert into public.teams (id, organization_id, name)
  values ('30000000-0000-0000-0000-000000002581', '10000000-0000-0000-0000-000000002581', 'T');
insert into public.services (id, organization_id, team_id, name, starts_at, created_by_user_id)
  select ('60000000-0000-0000-0000-00000000258' || n)::uuid, '10000000-0000-0000-0000-000000002581',
         '30000000-0000-0000-0000-000000002581', 'S' || n, now(), '00000000-0000-0000-0000-000000002581'
  from generate_series(1, 3) n;
insert into public.stage_sessions (id, service_id, status, md_user_id, created_at, started_at, ended_at) values
  ('70000000-0000-0000-0000-000000002511', '60000000-0000-0000-0000-000000002581', 'lobby', '00000000-0000-0000-0000-000000002581', '2026-10-20 10:00+00', null, null),
  ('70000000-0000-0000-0000-000000002512', '60000000-0000-0000-0000-000000002581', 'live', null, '2026-10-20 11:00+00', '2026-10-20 11:05+00', null),
  ('70000000-0000-0000-0000-000000002513', '60000000-0000-0000-0000-000000002581', 'lobby', '00000000-0000-0000-0000-000000002581', '2026-10-20 12:00+00', null, null),
  ('70000000-0000-0000-0000-000000002514', '60000000-0000-0000-0000-000000002581', 'ended', '00000000-0000-0000-0000-000000002581', '2026-10-19 10:00+00', '2026-10-19 10:00+00', '2026-10-19 11:00+00'),
  ('70000000-0000-0000-0000-000000002521', '60000000-0000-0000-0000-000000002582', 'live', '00000000-0000-0000-0000-000000002581', '2026-10-20 10:00+00', '2026-10-20 10:00+00', null),
  ('70000000-0000-0000-0000-000000002531', '60000000-0000-0000-0000-000000002583', 'lobby', '00000000-0000-0000-0000-000000002581', '2026-10-20 10:00+00', null, null),
  ('70000000-0000-0000-0000-000000002532', '60000000-0000-0000-0000-000000002583', 'lobby', '00000000-0000-0000-0000-000000002581', '2026-10-20 10:00+00', null, null);
alter table public.stage_session_states disable trigger stage_session_states_operator_guard;
update public.stage_session_states set is_running = true where stage_session_id = '70000000-0000-0000-0000-000000002512';
alter table public.stage_session_states enable trigger stage_session_states_operator_guard;
