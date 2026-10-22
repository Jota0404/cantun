-- CANTUM — no máximo uma sessão de Palco aberta por serviço; create_target_stage_session idempotente (0025).
-- A limpeza das duplicadas existentes é coberta por db/upgrade/0025_pre.sql + 0025_post.sql.
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

create function pg_temp.fails(p_sql text, p_label text, p_state text) returns void language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = p_state then return; end if;
    raise exception '%: erro inesperado % "%"', p_label, sqlstate, sqlerrm;
  end;
  raise exception 'deveria falhar: %', p_label;
end $$;

create function pg_temp.create(p_service text, p_id text) returns public.stage_sessions language sql
as $$ select * from public.create_target_stage_session(p_service::uuid, p_id::uuid) $$;

-- 01 owner · 02 Líder TA · 03 Líder TA (fica inativo adiante) · 04 membro TA · 05 Líder inativo TA
-- 06 owner de outra org · 07 sem vínculo
insert into app.users (id, email, display_name) select ('00000000-0000-0000-0000-0000000025' || lpad(n::text, 2, '0'))::uuid, 'p' || n || '@p.local', 'U' || n from generate_series(1, 7) n;
select pg_temp.as_user('00000000-0000-0000-0000-000000002501');
select public.create_organization('10000000-0000-0000-0000-000000002501', 'Ministério P');
select pg_temp.as_user('00000000-0000-0000-0000-000000002506');
select public.create_organization('10000000-0000-0000-0000-000000002506', 'Outro');
select pg_temp.as_user(null);
insert into public.organization_memberships (organization_id, user_id, role)
  select '10000000-0000-0000-0000-000000002501', ('00000000-0000-0000-0000-0000000025' || lpad(n::text, 2, '0'))::uuid, 'member'
  from generate_series(2, 5) n;
insert into public.teams (id, organization_id, name) values ('30000000-0000-0000-0000-000000002501', '10000000-0000-0000-0000-000000002501', 'TA');
insert into public.team_memberships (team_id, user_id, role, status) values
  ('30000000-0000-0000-0000-000000002501', '00000000-0000-0000-0000-000000002502', 'leader', 'active'),
  ('30000000-0000-0000-0000-000000002501', '00000000-0000-0000-0000-000000002503', 'leader', 'active'),
  ('30000000-0000-0000-0000-000000002501', '00000000-0000-0000-0000-000000002504', 'member', 'active'),
  ('30000000-0000-0000-0000-000000002501', '00000000-0000-0000-0000-000000002505', 'leader', 'inactive');
insert into public.songs (user_id, id, organization_id, title, original_key, current_key, lyrics, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000002501', '40000000-0000-0000-0000-000000002501', '10000000-0000-0000-0000-000000002501', 'Música', 'C', 'C', 'x', now(), now());
-- S1, S2, S4 e S5 com música · S3 sem música; todos in_progress na TA.
insert into public.services (id, organization_id, team_id, name, starts_at, created_by_user_id, status)
select ('60000000-0000-0000-0000-00000000250' || n)::uuid, '10000000-0000-0000-0000-000000002501', '30000000-0000-0000-0000-000000002501',
       'S' || n, now(), '00000000-0000-0000-0000-000000002501', 'in_progress'
from generate_series(1, 5) n;
insert into public.service_items (service_id, type, song_id, position)
select ('60000000-0000-0000-0000-00000000250' || n)::uuid, 'song', '40000000-0000-0000-0000-000000002501', 0
from generate_series(1, 5) n where n <> 3;

select pg_temp.ok((select indisunique from pg_index where indexrelid = 'public.stage_sessions_open_service_key'::regclass), 'índice único parcial');
select pg_temp.ok(not has_function_privilege('cantum_user', 'private.close_stage_session(uuid)', 'execute'), 'close_stage_session sem EXECUTE para cantum_user');

set local role cantum_user;

-- Negativos: anônimo, sem vínculo, outra organização, membro sem stage.start, Líder inativo.
select pg_temp.as_user(null);
select pg_temp.fails_with($$select pg_temp.create('60000000-0000-0000-0000-000000002501', '80000000-0000-0000-0000-000000002599')$$, 'service not found or not authorized');
select pg_temp.as_user('00000000-0000-0000-0000-000000002507');
select pg_temp.fails_with($$select pg_temp.create('60000000-0000-0000-0000-000000002501', '80000000-0000-0000-0000-000000002599')$$, 'service not found or not authorized');
select pg_temp.as_user('00000000-0000-0000-0000-000000002506');
select pg_temp.fails_with($$select pg_temp.create('60000000-0000-0000-0000-000000002501', '80000000-0000-0000-0000-000000002599')$$, 'service not found or not authorized');
select pg_temp.as_user('00000000-0000-0000-0000-000000002504');
select pg_temp.fails_with($$select pg_temp.create('60000000-0000-0000-0000-000000002501', '80000000-0000-0000-0000-000000002599')$$, 'not authorized to create stage sessions');
select pg_temp.as_user('00000000-0000-0000-0000-000000002505');
select pg_temp.fails_with($$select pg_temp.create('60000000-0000-0000-0000-000000002501', '80000000-0000-0000-0000-000000002599')$$, 'not authorized to create stage sessions');
select pg_temp.as_user('00000000-0000-0000-0000-000000002502');
select pg_temp.fails_with($$select pg_temp.create('60000000-0000-0000-0000-000000002503', '80000000-0000-0000-0000-000000002599')$$, 'service must contain at least one song before starting stage');

-- Idempotência: Líder 02 cria; retry com o mesmo id e chamada com outro id devolvem a mesma sessão.
select pg_temp.ok((select status = 'lobby' and md_user_id = '00000000-0000-0000-0000-000000002502'
                   from pg_temp.create('60000000-0000-0000-0000-000000002501', '80000000-0000-0000-0000-000000002501')), 'cria em lobby com MD');
select pg_temp.ok((select id = '80000000-0000-0000-0000-000000002501'
                   from pg_temp.create('60000000-0000-0000-0000-000000002501', '80000000-0000-0000-0000-000000002501')), 'retry devolve a mesma');
select pg_temp.ok((select id = '80000000-0000-0000-0000-000000002501'
                   from pg_temp.create('60000000-0000-0000-0000-000000002501', '80000000-0000-0000-0000-000000002502')), 'outro id devolve a aberta');
-- Outro Líder e o owner recebem a mesma sessão; o MD continua 02 e só ele inicia.
select pg_temp.as_user('00000000-0000-0000-0000-000000002503');
select pg_temp.ok((select id = '80000000-0000-0000-0000-000000002501' and md_user_id = '00000000-0000-0000-0000-000000002502'
                   from pg_temp.create('60000000-0000-0000-0000-000000002501', '80000000-0000-0000-0000-000000002503')), 'outro Líder recebe a aberta');
select pg_temp.fails_with($$select public.target_stage_start('80000000-0000-0000-0000-000000002501')$$, 'only the current Stage MD can mutate execution state');
select pg_temp.as_user('00000000-0000-0000-0000-000000002502');
select public.target_stage_start('80000000-0000-0000-0000-000000002501');
select pg_temp.as_user('00000000-0000-0000-0000-000000002501');
select pg_temp.ok((select id = '80000000-0000-0000-0000-000000002501' and status = 'live'
                   from pg_temp.create('60000000-0000-0000-0000-000000002501', '80000000-0000-0000-0000-000000002504')), 'owner recebe a ao vivo');
select pg_temp.ok((select count(*) = 1 from public.stage_sessions where service_id = '60000000-0000-0000-0000-000000002501'), 'uma sessão só');
-- Id já usado por sessão de outro serviço.
select pg_temp.fails($$select pg_temp.create('60000000-0000-0000-0000-000000002502', '80000000-0000-0000-0000-000000002501')$$, 'stage session id already in use', '23505');
-- Outra organização não vê a sessão.
select pg_temp.as_user('00000000-0000-0000-0000-000000002506');
select pg_temp.ok((select count(*) = 0 from public.stage_sessions), 'outra organização não lê');

-- D2: aberta bloqueia concluir; encerrada não conflita com uma nova; encerrada não reabre.
select pg_temp.as_user('00000000-0000-0000-0000-000000002502');
select pg_temp.fails_with($$select public.transition_service('60000000-0000-0000-0000-000000002501', 'completed')$$, 'stage session still open');
select public.target_stage_end('80000000-0000-0000-0000-000000002501');
select pg_temp.ok((select id = '80000000-0000-0000-0000-000000002505' and status = 'lobby'
                   from pg_temp.create('60000000-0000-0000-0000-000000002501', '80000000-0000-0000-0000-000000002505')), 'nova depois da encerrada');
select pg_temp.fails_with($$select public.target_stage_start('80000000-0000-0000-0000-000000002501')$$, 'stage session is ended');
select pg_temp.fails_with($$select public.transition_service('60000000-0000-0000-0000-000000002501', 'completed')$$, 'stage session still open');
select public.target_stage_end('80000000-0000-0000-0000-000000002505');
select public.transition_service('60000000-0000-0000-0000-000000002501', 'completed');
select pg_temp.ok((select status = 'completed' from public.services where id = '60000000-0000-0000-0000-000000002501'), 'conclui com o Palco encerrado');
-- Serviço concluído ou cancelado não abre Palco (não fura a D2).
select pg_temp.fails_with($$select pg_temp.create('60000000-0000-0000-0000-000000002501', '80000000-0000-0000-0000-000000002590')$$, 'service is not open for Stage');
select public.transition_service('60000000-0000-0000-0000-000000002503', 'cancelled');
select pg_temp.fails_with($$select pg_temp.create('60000000-0000-0000-0000-000000002503', '80000000-0000-0000-0000-000000002590')$$, 'service is not open for Stage');

-- MD que não pode mais operar: a sessão dele é encerrada (revision + 1) e dá lugar à nova.
select pg_temp.as_user('00000000-0000-0000-0000-000000002503');
select pg_temp.create('60000000-0000-0000-0000-000000002502', '80000000-0000-0000-0000-000000002506');
reset role;
update public.team_memberships set status = 'inactive' where user_id = '00000000-0000-0000-0000-000000002503';
set local role cantum_user;
select pg_temp.as_user('00000000-0000-0000-0000-000000002502');
select pg_temp.ok((select id = '80000000-0000-0000-0000-000000002507' and md_user_id = '00000000-0000-0000-0000-000000002502'
                   from pg_temp.create('60000000-0000-0000-0000-000000002502', '80000000-0000-0000-0000-000000002507')), 'substitui a sessão do MD inativo');
select pg_temp.ok((select ss.status = 'ended' and ss.ended_at is not null and st.revision = 1 and not st.is_running
                   from public.stage_sessions ss join public.stage_session_states st on st.stage_session_id = ss.id
                   where ss.id = '80000000-0000-0000-0000-000000002506'), 'sessão do MD inativo encerrada');
select pg_temp.ok(coalesce(current_setting('app.stage_override', true), '') = '', 'override não vaza');
-- Fora do override, a guarda do MD continua: 03 (ativo de novo) não encerra a sessão de 02.
reset role;
update public.team_memberships set status = 'active' where user_id = '00000000-0000-0000-0000-000000002503';
set local role cantum_user;
select pg_temp.as_user('00000000-0000-0000-0000-000000002503');
select pg_temp.fails_with($$select public.target_stage_end('80000000-0000-0000-0000-000000002507')$$, 'only the current Stage MD can mutate execution state');

-- Tomada com MD de conta excluída (md_user_id nulo, como delete_my_account deixa) em S4.
select pg_temp.create('60000000-0000-0000-0000-000000002504', '80000000-0000-0000-0000-000000002509');
reset role;
update public.stage_sessions set md_user_id = null where id = '80000000-0000-0000-0000-000000002509';
set local role cantum_user;
select pg_temp.as_user('00000000-0000-0000-0000-000000002502');
select pg_temp.ok((select id = '80000000-0000-0000-0000-000000002510'
                   from pg_temp.create('60000000-0000-0000-0000-000000002504', '80000000-0000-0000-0000-000000002510')), 'substitui a sessão de MD nulo');
select pg_temp.ok((select status = 'ended' from public.stage_sessions where id = '80000000-0000-0000-0000-000000002509'), 'sessão de MD nulo encerrada');

-- Tomada com MD removido da organização em S5.
select pg_temp.as_user('00000000-0000-0000-0000-000000002503');
select pg_temp.create('60000000-0000-0000-0000-000000002505', '80000000-0000-0000-0000-000000002511');
reset role;
delete from public.team_memberships where user_id = '00000000-0000-0000-0000-000000002503';
delete from public.organization_memberships where user_id = '00000000-0000-0000-0000-000000002503';
set local role cantum_user;
select pg_temp.as_user('00000000-0000-0000-0000-000000002502');
select pg_temp.ok((select id = '80000000-0000-0000-0000-000000002512'
                   from pg_temp.create('60000000-0000-0000-0000-000000002505', '80000000-0000-0000-0000-000000002512')), 'substitui a sessão de MD removido');
select pg_temp.ok((select status = 'ended' from public.stage_sessions where id = '80000000-0000-0000-0000-000000002511'), 'sessão de MD removido encerrada');

-- O índice impede uma segunda aberta mesmo fora da RPC.
reset role;
select pg_temp.as_user(null);
do $$
begin
  insert into public.stage_sessions (id, service_id, status, md_user_id)
  values ('80000000-0000-0000-0000-000000002508', '60000000-0000-0000-0000-000000002502', 'lobby', '00000000-0000-0000-0000-000000002502');
  raise exception 'deveria violar o índice único';
exception when unique_violation then null;
end $$;

rollback;
