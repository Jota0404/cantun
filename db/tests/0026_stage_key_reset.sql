-- CANTUM — goto/next/previous zeram o tom ao vivo (stage_session_states.current_key) ao trocar de item (0026).
\set ON_ERROR_STOP on
\o /dev/null
begin;

create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('app.user_id', coalesce(p_id, ''), true) $$;

create function pg_temp.ok(p_condition boolean, p_label text) returns void language plpgsql
as $$ begin if not coalesce(p_condition, false) then raise exception 'falhou: %', p_label; end if; end $$;

create function pg_temp.fails_with(p_sql text, p_message text) returns void language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm = p_message then return; end if;
    raise exception '%: erro inesperado % "%"', p_message, sqlstate, sqlerrm;
  end;
  raise exception 'deveria falhar: %', p_message;
end $$;

create function pg_temp.state() returns public.stage_session_states language sql
as $$ select * from public.stage_session_states where stage_session_id = '80000000-0000-0000-0000-000000002601' $$;

-- 01 owner · 02 Líder TA (MD) · 04 membro TA · 05 Líder inativo TA · 06 owner de outra org · 07 sem vínculo
insert into app.users (id, email, display_name) select ('00000000-0000-0000-0000-0000000026' || lpad(n::text, 2, '0'))::uuid, 'k' || n || '@k.local', 'U' || n from generate_series(1, 7) n;
select pg_temp.as_user('00000000-0000-0000-0000-000000002601');
select public.create_organization('10000000-0000-0000-0000-000000002601', 'Ministério K');
select pg_temp.as_user('00000000-0000-0000-0000-000000002606');
select public.create_organization('10000000-0000-0000-0000-000000002606', 'Outro');
select pg_temp.as_user(null);
insert into public.organization_memberships (organization_id, user_id, role)
  select '10000000-0000-0000-0000-000000002601', ('00000000-0000-0000-0000-0000000026' || lpad(n::text, 2, '0'))::uuid, 'member'
  from generate_series(2, 5) n;
insert into public.teams (id, organization_id, name) values ('30000000-0000-0000-0000-000000002601', '10000000-0000-0000-0000-000000002601', 'TA');
insert into public.team_memberships (team_id, user_id, role, status) values
  ('30000000-0000-0000-0000-000000002601', '00000000-0000-0000-0000-000000002602', 'leader', 'active'),
  ('30000000-0000-0000-0000-000000002601', '00000000-0000-0000-0000-000000002604', 'member', 'active'),
  ('30000000-0000-0000-0000-000000002601', '00000000-0000-0000-0000-000000002605', 'leader', 'inactive');
insert into public.songs (user_id, id, organization_id, title, original_key, current_key, lyrics, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000002601', '40000000-0000-0000-0000-000000002601', '10000000-0000-0000-0000-000000002601', 'A', 'C', 'C', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000002601', '40000000-0000-0000-0000-000000002602', '10000000-0000-0000-0000-000000002601', 'B', 'C', 'E', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000002601', '40000000-0000-0000-0000-000000002603', '10000000-0000-0000-0000-000000002601', 'C', 'C', 'C', 'x', now(), now());
insert into public.services (id, organization_id, team_id, name, starts_at, created_by_user_id, status) values
  ('60000000-0000-0000-0000-000000002601', '10000000-0000-0000-0000-000000002601', '30000000-0000-0000-0000-000000002601', 'S', now(), '00000000-0000-0000-0000-000000002601', 'in_progress');
-- Tom por serviço: posição 0 = D, 1 = herda (E), 2 = G.
insert into public.service_items (service_id, type, song_id, position, key) values
  ('60000000-0000-0000-0000-000000002601', 'song', '40000000-0000-0000-0000-000000002601', 0, 'D'),
  ('60000000-0000-0000-0000-000000002601', 'song', '40000000-0000-0000-0000-000000002602', 1, null),
  ('60000000-0000-0000-0000-000000002601', 'song', '40000000-0000-0000-0000-000000002603', 2, 'G');

set local role cantum_user;
select pg_temp.as_user('00000000-0000-0000-0000-000000002602');
select public.create_target_stage_session('60000000-0000-0000-0000-000000002601', '80000000-0000-0000-0000-000000002601');
select public.target_stage_start('80000000-0000-0000-0000-000000002601');
select public.target_stage_goto('80000000-0000-0000-0000-000000002601', 0);

-- next zera o tom ao vivo; o tom efetivo volta a ser o do serviço (item 1 herda E).
select public.target_stage_set_key('80000000-0000-0000-0000-000000002601', 'F');
select pg_temp.ok((pg_temp.state()).current_key = 'F', 'set_key grava');
select revision as r from pg_temp.state() \gset
select pg_temp.ok((select current_key is null and current_index = 1 and revision = :r + 1
                   from public.target_stage_next('80000000-0000-0000-0000-000000002601')), 'next zera com revision+1');
select pg_temp.ok((select current_key = 'E' from public.get_service_stage_songs('80000000-0000-0000-0000-000000002601') where position = 1), 'tom efetivo do item 1');

-- previous zera.
select public.target_stage_set_key('80000000-0000-0000-0000-000000002601', 'A');
select pg_temp.ok((select current_key is null and current_index = 0
                   from public.target_stage_previous('80000000-0000-0000-0000-000000002601')), 'previous zera');
select pg_temp.ok((select current_key = 'D' from public.get_service_stage_songs('80000000-0000-0000-0000-000000002601') where position = 0), 'tom efetivo do item 0');

-- goto para outro item zera; para o mesmo item preserva.
select public.target_stage_set_key('80000000-0000-0000-0000-000000002601', 'A');
select pg_temp.ok((select current_key = 'A' and current_index = 0
                   from public.target_stage_goto('80000000-0000-0000-0000-000000002601', 0)), 'goto ao mesmo item preserva');
select pg_temp.ok((select current_key is null and current_index = 2
                   from public.target_stage_goto('80000000-0000-0000-0000-000000002601', 2)), 'goto zera');

-- next no último item não tem efeito: tom e revision intactos.
select public.target_stage_set_key('80000000-0000-0000-0000-000000002601', 'B');
select revision as r from pg_temp.state() \gset
select pg_temp.ok((select current_key = 'B' and revision = :r
                   from public.target_stage_next('80000000-0000-0000-0000-000000002601')), 'next sem efeito preserva');

-- Negativos: membro, Líder inativo, outra organização, sem vínculo, anônimo.
select pg_temp.as_user('00000000-0000-0000-0000-000000002604');
select pg_temp.fails_with($$select public.target_stage_previous('80000000-0000-0000-0000-000000002601')$$, 'only the current Stage MD can mutate execution state');
select pg_temp.as_user('00000000-0000-0000-0000-000000002605');
select pg_temp.fails_with($$select public.target_stage_goto('80000000-0000-0000-0000-000000002601', 0)$$, 'only the current Stage MD can mutate execution state');
select pg_temp.as_user('00000000-0000-0000-0000-000000002606');
select pg_temp.fails_with($$select public.target_stage_previous('80000000-0000-0000-0000-000000002601')$$, 'stage session not found or not authorized');
select pg_temp.as_user('00000000-0000-0000-0000-000000002607');
select pg_temp.fails_with($$select public.target_stage_goto('80000000-0000-0000-0000-000000002601', 0)$$, 'stage session not found or not authorized');
select pg_temp.as_user(null);
select pg_temp.fails_with($$select public.target_stage_previous('80000000-0000-0000-0000-000000002601')$$, 'stage session not found or not authorized');
select pg_temp.as_user('00000000-0000-0000-0000-000000002602');
select pg_temp.ok((select current_key = 'B' and current_index = 2 from pg_temp.state()), 'negados não mudam o estado');

-- Sessão encerrada: navegação recusada, tom inalterado.
select public.target_stage_end('80000000-0000-0000-0000-000000002601');
select pg_temp.fails_with($$select public.target_stage_previous('80000000-0000-0000-0000-000000002601')$$, 'stage session is not live');
select pg_temp.fails_with($$select public.target_stage_goto('80000000-0000-0000-0000-000000002601', 0)$$, 'stage session is not live');
select pg_temp.ok((select current_key = 'B' and current_index = 2 from pg_temp.state()), 'encerrada inalterada');

rollback;
