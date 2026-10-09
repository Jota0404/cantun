-- CANTUM — tempo real do Modo Palco: quem assina e o trigger de aviso (RT-01, RT-02).
\set ON_ERROR_STOP on
begin;

insert into app.users (id, email, display_name) values
  ('00000000-0000-0000-0000-0000000003a1', 'ana.rt@teste.local', 'Ana'),
  ('00000000-0000-0000-0000-0000000003b1', 'bruno.rt@teste.local', 'Bruno'),
  ('00000000-0000-0000-0000-0000000003c1', 'carla.rt@teste.local', 'Carla');

-- Ana: organização, serviço e sessão de palco. Bruno: outra organização. Carla: sem vínculo.
set local role cantum_user;
select set_config('app.user_id', '00000000-0000-0000-0000-0000000003a1', true);
select public.create_organization('20000000-0000-0000-0000-0000000003a1', 'Igreja da Ana');
insert into public.songs (user_id, id, title, original_key, current_key, lyrics, created_at, updated_at)
  values ('00000000-0000-0000-0000-0000000003a1', '40000000-0000-0000-0000-0000000003a1', 'Música', 'C', 'C', 'C', now(), now());
insert into public.services (id, organization_id, name, starts_at, created_by_user_id)
  values ('50000000-0000-0000-0000-0000000003a1', '20000000-0000-0000-0000-0000000003a1', 'Culto', now(), '00000000-0000-0000-0000-0000000003a1');
insert into public.service_items (service_id, song_id, position)
  values ('50000000-0000-0000-0000-0000000003a1', '40000000-0000-0000-0000-0000000003a1', 0);
select public.create_target_stage_session('50000000-0000-0000-0000-0000000003a1', '60000000-0000-0000-0000-0000000003a1');
select set_config('app.user_id', '00000000-0000-0000-0000-0000000003b1', true);
select public.create_organization('20000000-0000-0000-0000-0000000003b1', 'Igreja do Bruno');

-- RT-01
do $$
declare
  r record;
  v_allowed boolean;
begin
  for r in select * from (values ('ana', '00000000-0000-0000-0000-0000000003a1', true),
                                 ('bruno (outra organização)', '00000000-0000-0000-0000-0000000003b1', false),
                                 ('carla (sem vínculo)', '00000000-0000-0000-0000-0000000003c1', false),
                                 ('anônimo', '', false)) as u(label, id, expected) loop
    perform set_config('app.user_id', r.id, true);
    v_allowed := app.can_subscribe_stage_session('60000000-0000-0000-0000-0000000003a1');
    if v_allowed is distinct from r.expected then
      raise exception 'can_subscribe_stage_session para %: % (esperado %)', r.label, v_allowed, r.expected;
    end if;
  end loop;
  perform set_config('app.user_id', '00000000-0000-0000-0000-0000000003a1', true);
  if app.can_subscribe_stage_session('60000000-0000-0000-0000-0000000003ff') then
    raise exception 'sessão inexistente deveria dar false';
  end if;
end $$;
reset role;

-- cantum_anon nem executa a função.
set local role cantum_anon;
do $$
begin
  perform app.can_subscribe_stage_session('60000000-0000-0000-0000-0000000003a1');
  raise exception 'cantum_anon executou can_subscribe_stage_session';
exception when insufficient_privilege then null;
end $$;
reset role;

-- RT-02: o trigger existe, é AFTER UPDATE por linha e só dispara quando a revision muda.
do $$
declare
  v_def text;
begin
  select pg_get_triggerdef(t.oid) into v_def
  from pg_trigger t
  where t.tgrelid = 'public.stage_session_states'::regclass and t.tgname = 'stage_session_states_notify';
  if v_def is null then raise exception 'trigger stage_session_states_notify não existe'; end if;
  if v_def !~ 'AFTER UPDATE' or v_def !~ 'FOR EACH ROW' then raise exception 'trigger com formato errado: %', v_def; end if;
  if v_def !~ 'old\.revision IS DISTINCT FROM new\.revision' then raise exception 'trigger sem WHEN sobre revision: %', v_def; end if;
  if v_def !~ 'private\.notify_stage_state_changed' then raise exception 'trigger chama outra função: %', v_def; end if;
end $$;

rollback;
