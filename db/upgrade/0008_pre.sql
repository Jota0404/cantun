-- Dados no schema da 0007: música repetida na ordem de um serviço, com o duplicado em uso pelo Palco
-- (ponteiros do estado) e por uma escala (assignments.service_item_id).
insert into app.users (id, email, display_name) values
  ('00000000-0000-0000-0000-000000000881', 'a@up8.local', 'A');
insert into public.organizations (id, name) values ('10000000-0000-0000-0000-000000000881', 'O');
insert into public.organization_memberships (organization_id, user_id, role)
  values ('10000000-0000-0000-0000-000000000881', '00000000-0000-0000-0000-000000000881', 'owner');
insert into public.teams (id, organization_id, name)
  values ('30000000-0000-0000-0000-000000000881', '10000000-0000-0000-0000-000000000881', 'T');
insert into public.songs (user_id, id, organization_id, title, original_key, current_key, lyrics, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000881', '41000000-0000-0000-0000-000000000881', '10000000-0000-0000-0000-000000000881', 'Repetida', 'C', 'C', 'C', now(), now());
insert into public.services (id, organization_id, team_id, name, starts_at, created_by_user_id)
  values ('60000000-0000-0000-0000-000000000881', '10000000-0000-0000-0000-000000000881', '30000000-0000-0000-0000-000000000881', 'V', now(), '00000000-0000-0000-0000-000000000881');
insert into public.service_items (id, service_id, type, song_id, position) values
  ('61000000-0000-0000-0000-000000000881', '60000000-0000-0000-0000-000000000881', 'song', '41000000-0000-0000-0000-000000000881', 0),
  ('61000000-0000-0000-0000-000000000882', '60000000-0000-0000-0000-000000000881', 'song', '41000000-0000-0000-0000-000000000881', 1);
insert into public.service_positions (id, service_id, musical_function, quantity)
  values ('71000000-0000-0000-0000-000000000881', '60000000-0000-0000-0000-000000000881', 'vocals', 1);
insert into public.assignments (id, position_id, user_id, service_item_id, status)
  values ('72000000-0000-0000-0000-000000000881', '71000000-0000-0000-0000-000000000881', '00000000-0000-0000-0000-000000000881', '61000000-0000-0000-0000-000000000882', 'invited');
insert into public.stage_sessions (id, service_id, status, md_user_id)
  values ('70000000-0000-0000-0000-000000000881', '60000000-0000-0000-0000-000000000881', 'lobby', '00000000-0000-0000-0000-000000000881');
-- O Palco aponta para o duplicado (semeio pelo dono do schema, sem a guarda do operador).
alter table public.stage_session_states disable trigger stage_session_states_operator_guard;
update public.stage_session_states
set current_service_item_id = '61000000-0000-0000-0000-000000000882', prepared_service_item_id = '61000000-0000-0000-0000-000000000882'
where stage_session_id = '70000000-0000-0000-0000-000000000881';
alter table public.stage_session_states enable trigger stage_session_states_operator_guard;
