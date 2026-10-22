-- CANTUM — B7 fatia 3: registro da execução (VS-06 RN-01…09, RN-16, RN-18; casos H1–H7 e H9; D1/D2/D3).
\set ON_ERROR_STOP on
\o /dev/null
begin;

create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('app.user_id', coalesce(p_id, ''), true) $$;

create function pg_temp.ok(p_condition boolean, p_label text) returns void language plpgsql
as $$ begin if not coalesce(p_condition, false) then raise exception 'falhou: %', p_label; end if; end $$;

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

-- Registros, músicas e membros visíveis ao usuário atual (RLS).
create function pg_temp.seen() returns integer language sql as $$
  select ((select count(*) from public.service_executions) * 100 + (select count(*) from public.service_execution_songs) * 10
          + (select count(*) from public.service_execution_members))::integer $$;

-- 01 owner · 02 Líder TA · 03 Líder TB · 04 membro TA · 05 membro TA (convidado) · 06 membro inativo (só TA)
-- 07 owner de outra org · 08 sem vínculo · 09 admin · 10 membro TB · 11 Líder inativo TA e membro ativo TB · 12 membro TA
insert into app.users (id, email, display_name) select ('00000000-0000-0000-0000-0000000023' || lpad(n::text, 2, '0'))::uuid, 'h' || n || '@h.local', 'U' || n from generate_series(1, 12) n;
select pg_temp.as_user('00000000-0000-0000-0000-000000002301');
select public.create_organization('10000000-0000-0000-0000-000000002301', 'Ministério H');
select pg_temp.as_user('00000000-0000-0000-0000-000000002307');
select public.create_organization('10000000-0000-0000-0000-000000002307', 'Outro');
select pg_temp.as_user(null);
insert into public.organization_memberships (organization_id, user_id, role)
  select '10000000-0000-0000-0000-000000002301', ('00000000-0000-0000-0000-0000000023' || lpad(n::text, 2, '0'))::uuid,
         case n when 9 then 'admin' else 'member' end
  from generate_series(2, 12) n where n not in (7, 8);
insert into public.teams (id, organization_id, name) values
  ('30000000-0000-0000-0000-000000002301', '10000000-0000-0000-0000-000000002301', 'TA'),
  ('30000000-0000-0000-0000-000000002302', '10000000-0000-0000-0000-000000002301', 'TB');
insert into public.team_memberships (id, team_id, user_id, role, status) values
  ('31000000-0000-0000-0000-000000002302', '30000000-0000-0000-0000-000000002301', '00000000-0000-0000-0000-000000002302', 'leader', 'active'),
  ('31000000-0000-0000-0000-000000002303', '30000000-0000-0000-0000-000000002302', '00000000-0000-0000-0000-000000002303', 'leader', 'active'),
  ('31000000-0000-0000-0000-000000002304', '30000000-0000-0000-0000-000000002301', '00000000-0000-0000-0000-000000002304', 'member', 'active'),
  ('31000000-0000-0000-0000-000000002305', '30000000-0000-0000-0000-000000002301', '00000000-0000-0000-0000-000000002305', 'member', 'active'),
  ('31000000-0000-0000-0000-000000002306', '30000000-0000-0000-0000-000000002301', '00000000-0000-0000-0000-000000002306', 'member', 'inactive'),
  ('31000000-0000-0000-0000-000000002310', '30000000-0000-0000-0000-000000002302', '00000000-0000-0000-0000-000000002310', 'member', 'active'),
  ('31000000-0000-0000-0000-000000002311', '30000000-0000-0000-0000-000000002301', '00000000-0000-0000-0000-000000002311', 'leader', 'inactive'),
  ('31000000-0000-0000-0000-000000002312', '30000000-0000-0000-0000-000000002302', '00000000-0000-0000-0000-000000002311', 'member', 'active'),
  ('31000000-0000-0000-0000-000000002313', '30000000-0000-0000-0000-000000002301', '00000000-0000-0000-0000-000000002312', 'member', 'active');
-- Músicas A (C), B (G), C (E).
insert into public.songs (user_id, id, organization_id, title, artist, original_key, current_key, lyrics, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000002301', '40000000-0000-0000-0000-000000002301', '10000000-0000-0000-0000-000000002301', 'Música A', 'Artista', 'C', 'C', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000002301', '40000000-0000-0000-0000-000000002302', '10000000-0000-0000-0000-000000002301', 'Música B', null, 'G', 'G', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000002301', '40000000-0000-0000-0000-000000002303', '10000000-0000-0000-0000-000000002301', 'Música C', null, 'E', 'E', 'x', now(), now());
-- S1 (Palco encerrado) · S2 (Palco ao vivo) · S3 (sem Palco) · S4 (para cancelar): todos in_progress na TA.
insert into public.services (id, organization_id, team_id, name, starts_at, created_by_user_id, status)
select ('60000000-0000-0000-0000-00000000230' || n)::uuid, '10000000-0000-0000-0000-000000002301', '30000000-0000-0000-0000-000000002301',
       'S' || n, now() - interval '1 day', '00000000-0000-0000-0000-000000002301', 'in_progress'
from generate_series(1, 8) n;
insert into public.service_items (id, service_id, type, song_id, title, key, ref_item_id, position) values
  ('61000000-0000-0000-0000-000000002301', '60000000-0000-0000-0000-000000002301', 'song', '40000000-0000-0000-0000-000000002301', null, 'D', null, 0),
  ('61000000-0000-0000-0000-000000002302', '60000000-0000-0000-0000-000000002301', 'prayer', null, 'Oração', null, null, 1),
  ('61000000-0000-0000-0000-000000002303', '60000000-0000-0000-0000-000000002301', 'song', '40000000-0000-0000-0000-000000002302', null, null, null, 2),
  ('61000000-0000-0000-0000-000000002304', '60000000-0000-0000-0000-000000002301', 'reprise', null, 'Reprise A', null, '61000000-0000-0000-0000-000000002301', 3),
  ('61000000-0000-0000-0000-000000002305', '60000000-0000-0000-0000-000000002302', 'song', '40000000-0000-0000-0000-000000002302', null, null, null, 0),
  ('61000000-0000-0000-0000-000000002306', '60000000-0000-0000-0000-000000002303', 'song', '40000000-0000-0000-0000-000000002301', null, null, null, 0),
  ('61000000-0000-0000-0000-000000002307', '60000000-0000-0000-0000-000000002303', 'song', '40000000-0000-0000-0000-000000002303', null, null, null, 1),
  ('61000000-0000-0000-0000-000000002308', '60000000-0000-0000-0000-000000002304', 'song', '40000000-0000-0000-0000-000000002301', null, null, null, 0);
insert into public.service_positions (id, service_id, musical_function, quantity) values
  ('70000000-0000-0000-0000-000000002301', '60000000-0000-0000-0000-000000002301', 'vocals', 3),
  ('70000000-0000-0000-0000-000000002302', '60000000-0000-0000-0000-000000002301', 'keys', 1),
  ('70000000-0000-0000-0000-000000002303', '60000000-0000-0000-0000-000000002303', 'vocals', 1),
  ('70000000-0000-0000-0000-000000002304', '60000000-0000-0000-0000-000000002304', 'vocals', 1);
-- D3: só confirmed entra (04 e 12 em S1; 04 em S3); invited, declined e cancelled ficam de fora.
insert into public.assignments (position_id, user_id, status) values
  ('70000000-0000-0000-0000-000000002301', '00000000-0000-0000-0000-000000002304', 'confirmed'),
  ('70000000-0000-0000-0000-000000002301', '00000000-0000-0000-0000-000000002305', 'invited'),
  ('70000000-0000-0000-0000-000000002301', '00000000-0000-0000-0000-000000002302', 'declined'),
  ('70000000-0000-0000-0000-000000002302', '00000000-0000-0000-0000-000000002312', 'confirmed'),
  ('70000000-0000-0000-0000-000000002303', '00000000-0000-0000-0000-000000002304', 'confirmed'),
  ('70000000-0000-0000-0000-000000002304', '00000000-0000-0000-0000-000000002304', 'confirmed');
insert into public.stage_sessions (id, service_id, status, started_at, ended_at, md_user_id) values
  ('80000000-0000-0000-0000-000000002301', '60000000-0000-0000-0000-000000002301', 'ended', '2026-10-20 18:30+00', '2026-10-20 20:00+00', '00000000-0000-0000-0000-000000002302'),
  ('80000000-0000-0000-0000-000000002302', '60000000-0000-0000-0000-000000002301', 'ended', '2026-10-20 19:00+00', '2026-10-20 21:00+00', '00000000-0000-0000-0000-000000002302'),
  ('80000000-0000-0000-0000-000000002303', '60000000-0000-0000-0000-000000002302', 'live', '2026-10-21 19:00+00', null, '00000000-0000-0000-0000-000000002302'),
  -- D2 com MD ausente: S5 MD 02 (conta excluída adiante) · S6 MD 06 (inativo) · S7 MD 08 (sem vínculo) · S8 MD 09 (Admin ativo).
  ('80000000-0000-0000-0000-000000002305', '60000000-0000-0000-0000-000000002305', 'live', '2026-10-21 19:00+00', null, '00000000-0000-0000-0000-000000002302'),
  ('80000000-0000-0000-0000-000000002306', '60000000-0000-0000-0000-000000002306', 'lobby', null, null, '00000000-0000-0000-0000-000000002306'),
  ('80000000-0000-0000-0000-000000002307', '60000000-0000-0000-0000-000000002307', 'live', '2026-10-21 19:00+00', null, '00000000-0000-0000-0000-000000002308'),
  ('80000000-0000-0000-0000-000000002308', '60000000-0000-0000-0000-000000002308', 'live', '2026-10-21 19:00+00', null, '00000000-0000-0000-0000-000000002309');

select pg_temp.ok((select bool_and(relrowsecurity) from pg_class where oid in
  ('public.service_executions'::regclass, 'public.service_execution_songs'::regclass, 'public.service_execution_members'::regclass)), 'RLS ligada');
select pg_temp.ok(not has_function_privilege('cantum_user', 'app.record_service_execution(uuid)', 'execute'), 'gerador sem EXECUTE para cantum_user');
select pg_temp.ok(not has_function_privilege('cantum_anon', 'public.get_service_execution(uuid)', 'execute')
                  and not has_function_privilege('cantum_anon', 'public.get_song_history(uuid)', 'execute'), 'leituras sem EXECUTE para anônimo');

set local role cantum_user;

-- Membro não conclui.
select pg_temp.as_user('00000000-0000-0000-0000-000000002304');
select pg_temp.fails_with($$select public.transition_service('60000000-0000-0000-0000-000000002301', 'completed')$$, 'service not found or not authorized');

-- H1: Líder conclui S1 → um registro com músicas na ordem, tom efetivo, só confirmed, duração do Palco.
select pg_temp.as_user('00000000-0000-0000-0000-000000002302');
select public.transition_service('60000000-0000-0000-0000-000000002301', 'completed');
select pg_temp.ok((select e.completed_by_user_id = '00000000-0000-0000-0000-000000002302'
                     and e.stage_started_at = '2026-10-20 18:30+00' and e.stage_ended_at = '2026-10-20 21:00+00'
                     and e.organization_id = '10000000-0000-0000-0000-000000002301'
                   from public.service_executions e where e.service_id = '60000000-0000-0000-0000-000000002301'), 'H1 registro e duração');
select pg_temp.ok((select jsonb_agg(jsonb_build_array(x.position, x.title, x.artist, x.key) order by x.position)
                   from public.service_execution_songs x where x.service_id = '60000000-0000-0000-0000-000000002301')
                  = '[[0, "Música A", "Artista", "D"], [2, "Música B", null, "G"]]', 'H1 músicas na ordem, tom efetivo, sem oração nem reprise (D1)');
select pg_temp.ok((select jsonb_agg(jsonb_build_array(m.user_id, m.musical_function) order by m.musical_function)
                   from public.service_execution_members m where m.service_id = '60000000-0000-0000-0000-000000002301')
                  = '[["00000000-0000-0000-0000-000000002312", "keys"], ["00000000-0000-0000-0000-000000002304", "vocals"]]', 'H1 só confirmed (D3)');
select pg_temp.fails_with($$select public.transition_service('60000000-0000-0000-0000-000000002301', 'completed')$$, 'invalid service transition');
select pg_temp.ok((select count(*) = 1 from public.service_executions where service_id = '60000000-0000-0000-0000-000000002301'), 'H1 não duplica');

-- D2 (b): Palco ao vivo bloqueia a conclusão; nada muda no Palco nem no serviço.
select pg_temp.fails_with($$select public.transition_service('60000000-0000-0000-0000-000000002302', 'completed')$$, 'stage session still open');
select pg_temp.ok((select status = 'in_progress' from public.services where id = '60000000-0000-0000-0000-000000002302')
                  and (select status = 'live' from public.stage_sessions where id = '80000000-0000-0000-0000-000000002303')
                  and not exists (select 1 from public.service_executions where service_id = '60000000-0000-0000-0000-000000002302'), 'D2 nada muda');
reset role;
update public.stage_sessions set status = 'lobby' where id = '80000000-0000-0000-0000-000000002303';
set local role cantum_user;
select pg_temp.fails_with($$select public.transition_service('60000000-0000-0000-0000-000000002302', 'completed')$$, 'stage session still open');
reset role;
update public.stage_sessions set status = 'ended', ended_at = '2026-10-21 20:30+00' where id = '80000000-0000-0000-0000-000000002303';
set local role cantum_user;
select public.transition_service('60000000-0000-0000-0000-000000002302', 'completed');
select pg_temp.ok((select stage_ended_at = '2026-10-21 20:30+00' from public.service_executions where service_id = '60000000-0000-0000-0000-000000002302'), 'D2 conclui depois de encerrar o Palco');

-- Concluir sem Palco: duração nula. Cancelar não gera registro.
select public.transition_service('60000000-0000-0000-0000-000000002303', 'completed');
select pg_temp.ok((select stage_started_at is null and stage_ended_at is null from public.service_executions
                   where service_id = '60000000-0000-0000-0000-000000002303'), 'sem Palco: duração nula');
select public.transition_service('60000000-0000-0000-0000-000000002304', 'cancelled');
select pg_temp.ok(not exists (select 1 from public.service_executions where service_id = '60000000-0000-0000-0000-000000002304'), 'cancelar não registra');
-- 3 registros · S1 2 músicas + S2 1 + S3 2 = 5 · S1 2 membros + S3 1 = 3.
select pg_temp.ok(pg_temp.seen() = 353, 'Líder lê tudo');

-- Leituras por RPC.
select pg_temp.ok((select j->'songs'->0->>'key' = 'D' and jsonb_array_length(j->'members') = 2
                     and j->>'completed_by_user_id' = '00000000-0000-0000-0000-000000002302'
                   from (select public.get_service_execution('60000000-0000-0000-0000-000000002301') as j) r), 'get_service_execution');
select pg_temp.ok(public.get_service_execution('60000000-0000-0000-0000-000000002304') is null, 'cancelado sem registro na RPC');
select pg_temp.ok((select (j->>'plays_last_12_months')::int = 2 and j->'keys' = '[{"key": "C", "count": 1}, {"key": "D", "count": 1}]'
                     and jsonb_array_length(j->'recent') = 2 and j->>'last_played_at' is not null
                   from (select public.get_song_history('40000000-0000-0000-0000-000000002301') as j) r), 'get_song_history A');
select pg_temp.ok((select j->'keys' = '[{"key": "G", "count": 2}]' and j->'recent'->0 ? 'service_name'
                   from (select public.get_song_history('40000000-0000-0000-0000-000000002302') as j) r), 'get_song_history B');

-- H2: escrita direta negada para Owner, Admin, Líder e Membro.
do $$
declare v_user text;
begin
  foreach v_user in array array['00000000-0000-0000-0000-000000002301', '00000000-0000-0000-0000-000000002309',
                                '00000000-0000-0000-0000-000000002302', '00000000-0000-0000-0000-000000002304'] loop
    perform pg_temp.as_user(v_user);
    perform pg_temp.fails($q$insert into public.service_executions (service_id, organization_id) values ('60000000-0000-0000-0000-000000002304', '10000000-0000-0000-0000-000000002301')$q$, 'H2 insert', '42501');
    perform pg_temp.fails($q$update public.service_executions set completed_at = now()$q$, 'H2 update', '42501');
    perform pg_temp.fails($q$delete from public.service_executions$q$, 'H2 delete', '42501');
    perform pg_temp.fails($q$insert into public.service_execution_songs (service_id, position, title) values ('60000000-0000-0000-0000-000000002301', 9, 'X')$q$, 'H2 insert música', '42501');
    perform pg_temp.fails($q$update public.service_execution_songs set key = 'E'$q$, 'H2 update música', '42501');
    perform pg_temp.fails($q$delete from public.service_execution_songs$q$, 'H2 delete música', '42501');
    perform pg_temp.fails($q$insert into public.service_execution_members (service_id, user_id, musical_function) values ('60000000-0000-0000-0000-000000002301', '00000000-0000-0000-0000-000000002305', 'bass')$q$, 'H2 insert membro', '42501');
    perform pg_temp.fails($q$update public.service_execution_members set user_id = null$q$, 'H2 update membro', '42501');
    perform pg_temp.fails($q$delete from public.service_execution_members$q$, 'H2 delete membro', '42501');
    perform pg_temp.fails($q$select app.record_service_execution('60000000-0000-0000-0000-000000002304')$q$, 'H2 gerador', '42501');
  end loop;
end $$;

-- H3: editar a música depois não muda o registro.
select pg_temp.as_user('00000000-0000-0000-0000-000000002302');
update public.songs set title = 'Renomeada', current_key = 'E' where id = '40000000-0000-0000-0000-000000002301';
select pg_temp.ok((select title = 'Música A' and key = 'D' from public.service_execution_songs
                   where service_id = '60000000-0000-0000-0000-000000002301' and position = 0), 'H3 snapshot imutável');

-- H4/H5/H6/H7: leitura por membro ativo da organização.
select pg_temp.as_user('00000000-0000-0000-0000-000000002301');
select pg_temp.ok(pg_temp.seen() = 353, 'Owner lê');
select pg_temp.as_user('00000000-0000-0000-0000-000000002309');
select pg_temp.ok(pg_temp.seen() = 353, 'Admin lê');
select pg_temp.as_user('00000000-0000-0000-0000-000000002304');
select pg_temp.ok(pg_temp.seen() = 353, 'Membro lê');
select pg_temp.as_user('00000000-0000-0000-0000-000000002310');
select pg_temp.ok(pg_temp.seen() = 353, 'H7 membro de outra equipe lê');
select pg_temp.as_user('00000000-0000-0000-0000-000000002311');
select pg_temp.ok(pg_temp.seen() = 353, 'H6 Líder inativo numa equipe e ativo noutra lê');
do $$
declare v_user text;
begin
  foreach v_user in array array['00000000-0000-0000-0000-000000002306', '00000000-0000-0000-0000-000000002307',
                                '00000000-0000-0000-0000-000000002308', null] loop
    perform pg_temp.as_user(v_user);
    perform pg_temp.ok(pg_temp.seen() = 0, 'H4/H5/H6 não lê: ' || coalesce(v_user, 'anônimo'));
    perform pg_temp.ok(public.get_service_execution('60000000-0000-0000-0000-000000002301') is null, 'H4/H5/H6 RPC registro: ' || coalesce(v_user, 'anônimo'));
    perform pg_temp.ok((select j->>'last_played_at' is null and (j->>'plays_last_12_months')::int = 0 and j->'recent' = '[]'
                        from (select public.get_song_history('40000000-0000-0000-0000-000000002301') as j) r), 'H4/H5/H6 RPC histórico: ' || coalesce(v_user, 'anônimo'));
  end loop;
end $$;

-- H9: export inclui as participações do titular e nada de terceiros.
select pg_temp.as_user('00000000-0000-0000-0000-000000002304');
select pg_temp.ok((select jsonb_array_length(j->'service_participations') = 2
                     and j->'service_participations' @> '[{"service_id": "60000000-0000-0000-0000-000000002301", "service_name": "S1", "musical_function": "vocals"}]'
                     and j->'service_participations' @> '[{"service_id": "60000000-0000-0000-0000-000000002303"}]'
                     and j ? 'service_preparations' and j ? 'assignments'
                   from (select public.export_my_data() as j) e), 'H9 export do membro');
select pg_temp.as_user('00000000-0000-0000-0000-000000002305');
select pg_temp.ok((select j->'service_participations' = '[]' from (select public.export_my_data() as j) e), 'H9 convidado sem participação');

-- H9: team_member.remove mantém participações passadas.
select pg_temp.as_user('00000000-0000-0000-0000-000000002301');
select public.team_member_remove('31000000-0000-0000-0000-000000002313');
select pg_temp.ok(exists (select 1 from public.service_execution_members where user_id = '00000000-0000-0000-0000-000000002312'), 'H9 remoção mantém participação');

-- H9: excluir a conta anonimiza membro e quem concluiu; o registro continua.
select set_config('app.session_reauth_at', now()::text, true);
select pg_temp.as_user('00000000-0000-0000-0000-000000002304');
select public.delete_my_account();
select pg_temp.as_user('00000000-0000-0000-0000-000000002302');
select public.delete_my_account();
select set_config('app.session_reauth_at', '', true);
select pg_temp.as_user('00000000-0000-0000-0000-000000002301');
select pg_temp.ok(pg_temp.seen() = 353, 'H9 registro intacto');
select pg_temp.ok((select count(*) = 2 from public.service_execution_members where user_id is null), 'H9 participações anonimizadas');
select pg_temp.ok((select bool_and(completed_by_user_id is null) from public.service_executions), 'H9 quem concluiu anonimizado');

-- H3: música excluída → song_id nulo, título preservado (S3 libera a música C).
reset role;
delete from public.service_items where id = '61000000-0000-0000-0000-000000002307';
delete from public.songs where id = '40000000-0000-0000-0000-000000002303';
select pg_temp.ok((select song_id is null and title = 'Música C' from public.service_execution_songs
                   where service_id = '60000000-0000-0000-0000-000000002303' and position = 1), 'H3 música excluída');

-- RN-02: o registro sai com o serviço (Owner exclui serviço concluído).
set local role cantum_user;
select pg_temp.as_user('00000000-0000-0000-0000-000000002301');
delete from public.services where id = '60000000-0000-0000-0000-000000002303';
select pg_temp.ok(pg_temp.seen() = 232, 'cascata ao excluir o serviço');

-- D2: sessão aberta de MD excluído (md nulo), inativo ou sem vínculo não trava; MD ativo (Admin) segue bloqueando.
select pg_temp.ok((select md_user_id is null from public.stage_sessions where id = '80000000-0000-0000-0000-000000002305'), 'MD excluído vira nulo');
select public.transition_service('60000000-0000-0000-0000-000000002305', 'completed');
select public.transition_service('60000000-0000-0000-0000-000000002306', 'completed');
select public.transition_service('60000000-0000-0000-0000-000000002307', 'completed');
select pg_temp.ok((select count(*) = 3 from public.service_executions where service_id in
  ('60000000-0000-0000-0000-000000002305', '60000000-0000-0000-0000-000000002306', '60000000-0000-0000-0000-000000002307')), 'D2 MD ausente: conclui e registra');
select pg_temp.fails_with($$select public.transition_service('60000000-0000-0000-0000-000000002308', 'completed')$$, 'stage session still open');

rollback;
