-- CANTUM — B7 fatia 5: log de atividade (VS-06 RN-10…17; casos H2, H7, H8, H10; D4, D5).
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

-- Kinds visíveis ao usuário atual (RLS), ordenados.
create function pg_temp.seen() returns text language sql as $$
  select coalesce(string_agg(kind, ',' order by kind), '') from public.activity_events $$;

-- 01 owner · 02 Líder TA · 03 Líder TB · 04 membro TA · 05 membro TB · 06 inativo (só TA)
-- 07 owner de outra org · 08 sem vínculo · 09 admin · 10 membro TB · 11 membro TA
insert into app.users (id, email, display_name) select ('00000000-0000-0000-0000-0000000024' || lpad(n::text, 2, '0'))::uuid, 'a' || n || '@a.local', 'U' || n from generate_series(1, 11) n;
select pg_temp.as_user('00000000-0000-0000-0000-000000002401');
select public.create_organization('10000000-0000-0000-0000-000000002401', 'Ministério A');
select pg_temp.as_user('00000000-0000-0000-0000-000000002407');
select public.create_organization('10000000-0000-0000-0000-000000002407', 'Outro');
select pg_temp.as_user(null);
insert into public.organization_memberships (organization_id, user_id, role)
  select '10000000-0000-0000-0000-000000002401', ('00000000-0000-0000-0000-0000000024' || lpad(n::text, 2, '0'))::uuid,
         case n when 9 then 'admin' else 'member' end
  from generate_series(2, 11) n where n not in (7, 8);
insert into public.teams (id, organization_id, name) values
  ('30000000-0000-0000-0000-000000002401', '10000000-0000-0000-0000-000000002401', 'TA'),
  ('30000000-0000-0000-0000-000000002402', '10000000-0000-0000-0000-000000002401', 'TB');
insert into public.team_memberships (team_id, user_id, role, status) values
  ('30000000-0000-0000-0000-000000002401', '00000000-0000-0000-0000-000000002402', 'leader', 'active'),
  ('30000000-0000-0000-0000-000000002402', '00000000-0000-0000-0000-000000002403', 'leader', 'active'),
  ('30000000-0000-0000-0000-000000002401', '00000000-0000-0000-0000-000000002404', 'member', 'active'),
  ('30000000-0000-0000-0000-000000002402', '00000000-0000-0000-0000-000000002405', 'member', 'active'),
  ('30000000-0000-0000-0000-000000002401', '00000000-0000-0000-0000-000000002406', 'member', 'inactive'),
  ('30000000-0000-0000-0000-000000002402', '00000000-0000-0000-0000-000000002410', 'member', 'active'),
  ('30000000-0000-0000-0000-000000002401', '00000000-0000-0000-0000-000000002411', 'member', 'active');
insert into public.songs (user_id, id, organization_id, title, original_key, current_key, lyrics, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000002401', '40000000-0000-0000-0000-000000002401', '10000000-0000-0000-0000-000000002401', 'Música A', 'C', 'C', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000002401', '40000000-0000-0000-0000-000000002402', '10000000-0000-0000-0000-000000002401', 'Música B', 'G', 'G', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000002404', '40000000-0000-0000-0000-000000002404', null, 'Pessoal', 'D', 'D', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000002407', '40000000-0000-0000-0000-000000002407', '10000000-0000-0000-0000-000000002407', 'Outra', 'D', 'D', 'x', now(), now());
-- S1 draft TA (ready) · S2 in_progress TA (concluir) · S3 draft TA (cancelar) · S4 ready TA (escala) · S5 ready TB (escala)
insert into public.services (id, organization_id, team_id, name, starts_at, created_by_user_id, status) values
  ('60000000-0000-0000-0000-000000002401', '10000000-0000-0000-0000-000000002401', '30000000-0000-0000-0000-000000002401', 'S1', now(), '00000000-0000-0000-0000-000000002401', 'draft'),
  ('60000000-0000-0000-0000-000000002402', '10000000-0000-0000-0000-000000002401', '30000000-0000-0000-0000-000000002401', 'S2', now(), '00000000-0000-0000-0000-000000002401', 'in_progress'),
  ('60000000-0000-0000-0000-000000002403', '10000000-0000-0000-0000-000000002401', '30000000-0000-0000-0000-000000002401', 'S3', now(), '00000000-0000-0000-0000-000000002401', 'draft'),
  ('60000000-0000-0000-0000-000000002404', '10000000-0000-0000-0000-000000002401', '30000000-0000-0000-0000-000000002401', 'S4', now(), '00000000-0000-0000-0000-000000002401', 'ready'),
  ('60000000-0000-0000-0000-000000002405', '10000000-0000-0000-0000-000000002401', '30000000-0000-0000-0000-000000002402', 'S5', now(), '00000000-0000-0000-0000-000000002401', 'ready');
insert into public.service_positions (id, service_id, musical_function, quantity) values
  ('70000000-0000-0000-0000-000000002404', '60000000-0000-0000-0000-000000002404', 'vocals', 2),
  ('70000000-0000-0000-0000-000000002405', '60000000-0000-0000-0000-000000002405', 'vocals', 1);
insert into public.assignments (id, position_id, user_id, status) values
  ('71000000-0000-0000-0000-000000002404', '70000000-0000-0000-0000-000000002404', '00000000-0000-0000-0000-000000002404', 'invited'),
  ('71000000-0000-0000-0000-000000002411', '70000000-0000-0000-0000-000000002404', '00000000-0000-0000-0000-000000002411', 'invited'),
  ('71000000-0000-0000-0000-000000002405', '70000000-0000-0000-0000-000000002405', '00000000-0000-0000-0000-000000002405', 'invited');
select pg_temp.ok(not exists (select 1 from public.activity_events), 'fixture sem eventos');

select pg_temp.ok((select relrowsecurity from pg_class where oid = 'public.activity_events'::regclass), 'RLS ligada');
select pg_temp.ok(not has_function_privilege('cantum_user', 'app.log_activity(uuid, uuid, uuid, uuid, text)', 'execute'), 'gerador sem EXECUTE para cantum_user');
select pg_temp.ok(not has_function_privilege('cantum_anon', 'public.get_recent_activity(uuid, timestamptz)', 'execute'), 'leitura sem EXECUTE para anônimo');

set local role cantum_user;

-- Serviço: ready, completed (registro segue), cancelled; ready → draft não gera.
select pg_temp.as_user('00000000-0000-0000-0000-000000002402');
select public.transition_service('60000000-0000-0000-0000-000000002401', 'ready');
select public.transition_service('60000000-0000-0000-0000-000000002401', 'draft');
select public.transition_service('60000000-0000-0000-0000-000000002402', 'completed');
select public.transition_service('60000000-0000-0000-0000-000000002403', 'cancelled');
select pg_temp.ok(exists (select 1 from public.service_executions where service_id = '60000000-0000-0000-0000-000000002402'), 'conclusão grava o registro');
select pg_temp.ok((select status = 'draft' from public.services where id = '60000000-0000-0000-0000-000000002401'), 'transição segue funcionando');

-- Escala: confirmar, recusar (TA e TB), pedir substituição.
select pg_temp.as_user('00000000-0000-0000-0000-000000002404');
select public.respond_to_assignment('71000000-0000-0000-0000-000000002404', 'confirm');
select public.request_replacement('71000000-0000-0000-0000-000000002404');
select pg_temp.as_user('00000000-0000-0000-0000-000000002411');
select public.respond_to_assignment('71000000-0000-0000-0000-000000002411', 'decline');
select pg_temp.as_user('00000000-0000-0000-0000-000000002405');
select public.respond_to_assignment('71000000-0000-0000-0000-000000002405', 'decline');
select pg_temp.ok((select status = 'replacement_needed' from public.assignments where id = '71000000-0000-0000-0000-000000002404'), 'escala segue funcionando');

-- Ensaio e material; reenvio sem mudança (upsert) não gera.
select pg_temp.as_user('00000000-0000-0000-0000-000000002402');
insert into public.rehearsals (id, organization_id, service_id, starts_at)
  values ('62000000-0000-0000-0000-000000002401', '10000000-0000-0000-0000-000000002401', '60000000-0000-0000-0000-000000002404', now());
insert into public.materials (id, organization_id, service_id, title, url)
  values ('63000000-0000-0000-0000-000000002401', '10000000-0000-0000-0000-000000002401', '60000000-0000-0000-0000-000000002404', 'Playlist', 'https://x.example/p')
  on conflict (id) do update set title = excluded.title, url = excluded.url;
insert into public.materials (id, organization_id, service_id, title, url)
  values ('63000000-0000-0000-0000-000000002401', '10000000-0000-0000-0000-000000002401', '60000000-0000-0000-0000-000000002404', 'Playlist', 'https://x.example/p')
  on conflict (id) do update set title = excluded.title, url = excluded.url;
insert into public.materials (id, organization_id, rehearsal_id, title, url)
  values ('63000000-0000-0000-0000-000000002402', '10000000-0000-0000-0000-000000002401', '62000000-0000-0000-0000-000000002401', 'Mapa', 'https://x.example/m');
insert into public.rehearsals (id, organization_id, service_id, starts_at)
  values ('62000000-0000-0000-0000-000000002401', '10000000-0000-0000-0000-000000002401', '60000000-0000-0000-0000-000000002404', now())
  on conflict (id) do update set starts_at = excluded.starts_at;
select pg_temp.ok((select service_id = '60000000-0000-0000-0000-000000002404' and team_id = '30000000-0000-0000-0000-000000002401'
                   from public.activity_events where entity_id = '63000000-0000-0000-0000-000000002402'), 'material do ensaio leva serviço e equipe');

-- Repertório da organização: criar, item, renomear e renumerar no mesmo intervalo → um evento (RN-12).
select pg_temp.as_user('00000000-0000-0000-0000-000000002401');
insert into public.repertoires (id, organization_id, name, created_by_user_id)
  values ('50000000-0000-0000-0000-000000002401', '10000000-0000-0000-0000-000000002401', 'Domingo', '00000000-0000-0000-0000-000000002401');
insert into public.repertoire_items (id, repertoire_id, song_id, position) values
  ('51000000-0000-0000-0000-000000002401', '50000000-0000-0000-0000-000000002401', '40000000-0000-0000-0000-000000002401', 0);
update public.repertoires set name = 'Domingo manhã' where id = '50000000-0000-0000-0000-000000002401';
update public.repertoire_items set position = 1 where id = '51000000-0000-0000-0000-000000002401';
select pg_temp.ok((select count(*) = 1 from public.activity_events where kind = 'repertoire.updated'), 'RN-12 agrupado em 30 min');
-- Fora da janela: upsert sem mudança e troca de autor não geram; mudança real gera de novo.
reset role;
update public.activity_events set created_at = now() - interval '31 minutes' where kind = 'repertoire.updated';
set local role cantum_user;
insert into public.repertoire_items (id, repertoire_id, song_id, position) values
  ('51000000-0000-0000-0000-000000002401', '50000000-0000-0000-0000-000000002401', '40000000-0000-0000-0000-000000002401', 1)
  on conflict (id) do update set song_id = excluded.song_id, position = excluded.position;
update public.repertoires set name = 'Domingo manhã', updated_at = now() where id = '50000000-0000-0000-0000-000000002401';
select pg_temp.ok((select count(*) = 1 from public.activity_events where kind = 'repertoire.updated'), 'sem mudança não gera');
insert into public.repertoire_items (id, repertoire_id, song_id, position) values
  ('51000000-0000-0000-0000-000000002402', '50000000-0000-0000-0000-000000002401', '40000000-0000-0000-0000-000000002402', 2);
select pg_temp.ok((select count(*) = 2 from public.activity_events where kind = 'repertoire.updated'), 'fora da janela gera de novo');

-- Privacidade (RN-11): repertório pessoal, preparação e disponibilidade não geram.
select pg_temp.as_user('00000000-0000-0000-0000-000000002404');
insert into public.repertoires (id, organization_id, name, created_by_user_id)
  values ('50000000-0000-0000-0000-000000002404', null, 'Meu', '00000000-0000-0000-0000-000000002404');
insert into public.repertoire_items (repertoire_id, song_id, position) values ('50000000-0000-0000-0000-000000002404', '40000000-0000-0000-0000-000000002404', 0);
update public.repertoires set name = 'Meu 2' where id = '50000000-0000-0000-0000-000000002404';
delete from public.repertoires where id = '50000000-0000-0000-0000-000000002404';
insert into public.service_preparations (service_id, user_id) values ('60000000-0000-0000-0000-000000002404', '00000000-0000-0000-0000-000000002404');
insert into public.member_availability (user_id, organization_id, date, status)
  values ('00000000-0000-0000-0000-000000002404', '10000000-0000-0000-0000-000000002401', current_date + 7, 'unavailable');
reset role;
select pg_temp.ok((select count(*) = 12 from public.activity_events), 'privacidade: nada além dos 12 eventos');
select pg_temp.ok(not exists (select 1 from public.activity_events where entity_id = '50000000-0000-0000-0000-000000002404'), 'pessoal sem evento');
set local role cantum_user;

-- D4 + H7: Owner/Admin veem tudo; Líder TA não vê a recusa da TB; membros só os kinds abertos.
select pg_temp.as_user('00000000-0000-0000-0000-000000002401');
select pg_temp.ok(pg_temp.seen() = 'assignment.confirmed,assignment.declined,assignment.declined,assignment.replacement_needed,material.added,material.added,rehearsal.created,repertoire.updated,repertoire.updated,service.cancelled,service.completed,service.ready', 'Owner vê tudo');
select pg_temp.as_user('00000000-0000-0000-0000-000000002409');
select pg_temp.ok((select count(*) = 12 from public.activity_events), 'Admin vê tudo');
select pg_temp.as_user('00000000-0000-0000-0000-000000002402');
select pg_temp.ok(pg_temp.seen() = 'assignment.confirmed,assignment.declined,assignment.replacement_needed,material.added,material.added,rehearsal.created,repertoire.updated,repertoire.updated,service.cancelled,service.completed,service.ready', 'D4 Líder TA: só recusa da TA');
select pg_temp.as_user('00000000-0000-0000-0000-000000002403');
select pg_temp.ok(pg_temp.seen() = 'assignment.confirmed,assignment.declined,material.added,material.added,rehearsal.created,repertoire.updated,repertoire.updated,service.cancelled,service.completed,service.ready', 'D4 Líder TB: só recusa da TB');
do $$
declare v_user text;
begin
  foreach v_user in array array['00000000-0000-0000-0000-000000002404', '00000000-0000-0000-0000-000000002410', '00000000-0000-0000-0000-000000002411'] loop
    perform pg_temp.as_user(v_user);
    perform pg_temp.ok(pg_temp.seen() = 'assignment.confirmed,material.added,material.added,rehearsal.created,repertoire.updated,repertoire.updated,service.cancelled,service.completed,service.ready',
                       'H7/D4 membro lê sem recusa/substituição: ' || v_user);
    perform pg_temp.ok(jsonb_array_length(public.get_recent_activity('10000000-0000-0000-0000-000000002401')) = 9, 'H7 RPC: ' || v_user);
  end loop;
end $$;

-- D4 pela equipe atual: S5 passa da TB para a TA → Líder TA passa a ver a recusa, Líder TB deixa de ver.
reset role;
update public.services set team_id = '30000000-0000-0000-0000-000000002401' where id = '60000000-0000-0000-0000-000000002405';
set local role cantum_user;
select pg_temp.as_user('00000000-0000-0000-0000-000000002402');
select pg_temp.ok((select count(*) = 2 from public.activity_events where kind = 'assignment.declined')
                  and (select count(*) = 2 from jsonb_array_elements(public.get_recent_activity('10000000-0000-0000-0000-000000002401')) x
                       where x->>'kind' = 'assignment.declined'), 'D4 Líder da nova equipe vê');
select pg_temp.as_user('00000000-0000-0000-0000-000000002403');
select pg_temp.ok(not exists (select 1 from public.activity_events where kind = 'assignment.declined'), 'D4 Líder da equipe antiga não vê');
reset role;
update public.services set team_id = '30000000-0000-0000-0000-000000002402' where id = '60000000-0000-0000-0000-000000002405';
set local role cantum_user;

-- RPC: títulos por junção; entidade excluída → título nulo.
select pg_temp.as_user('00000000-0000-0000-0000-000000002402');
delete from public.materials where id = '63000000-0000-0000-0000-000000002401';
select pg_temp.as_user('00000000-0000-0000-0000-000000002401');
select pg_temp.ok((select jsonb_agg(jsonb_build_array(x->>'kind', x->>'entity_title') order by x->>'kind', x->>'entity_title')
                   from jsonb_array_elements(public.get_recent_activity('10000000-0000-0000-0000-000000002401')) x)
                  = '[["assignment.confirmed", "S4"], ["assignment.declined", "S4"], ["assignment.declined", "S5"], ["assignment.replacement_needed", "S4"], ["material.added", "Mapa"], ["material.added", null], ["rehearsal.created", "S4"], ["repertoire.updated", "Domingo manhã"], ["repertoire.updated", "Domingo manhã"], ["service.cancelled", "S3"], ["service.completed", "S2"], ["service.ready", "S1"]]',
                  'títulos e item excluído');
select pg_temp.ok((select x ?& array['id', 'kind', 'actor_user_id', 'service_id', 'entity_id', 'entity_title', 'created_at']
                     and x->>'actor_user_id' = '00000000-0000-0000-0000-000000002402' and x->>'entity_id' = '60000000-0000-0000-0000-000000002401'
                   from jsonb_array_elements(public.get_recent_activity('10000000-0000-0000-0000-000000002401')) x where x->>'kind' = 'service.ready'), 'formato do evento');

-- H2: escrita direta negada para Owner, Admin, Líder e Membro.
do $$
declare v_user text;
begin
  foreach v_user in array array['00000000-0000-0000-0000-000000002401', '00000000-0000-0000-0000-000000002409',
                                '00000000-0000-0000-0000-000000002402', '00000000-0000-0000-0000-000000002404'] loop
    perform pg_temp.as_user(v_user);
    perform pg_temp.fails($q$insert into public.activity_events (organization_id, kind) values ('10000000-0000-0000-0000-000000002401', 'service.ready')$q$, 'H2 insert', '42501');
    perform pg_temp.fails($q$update public.activity_events set kind = 'service.ready'$q$, 'H2 update', '42501');
    perform pg_temp.fails($q$delete from public.activity_events$q$, 'H2 delete', '42501');
    perform pg_temp.fails($q$select app.log_activity('10000000-0000-0000-0000-000000002401', null, null, null, 'service.ready')$q$, 'H2 gerador', '42501');
  end loop;
end $$;

-- H8: inativo, outra organização, sem vínculo e anônimo não leem.
do $$
declare v_user text;
begin
  foreach v_user in array array['00000000-0000-0000-0000-000000002406', '00000000-0000-0000-0000-000000002407',
                                '00000000-0000-0000-0000-000000002408', null] loop
    perform pg_temp.as_user(v_user);
    perform pg_temp.ok(pg_temp.seen() = '', 'H8 tabela: ' || coalesce(v_user, 'anônimo'));
    perform pg_temp.ok(public.get_recent_activity('10000000-0000-0000-0000-000000002401') = '[]', 'H8 RPC: ' || coalesce(v_user, 'anônimo'));
  end loop;
end $$;

-- ADR-063: excluir a conta anonimiza o autor; a troca de autor do repertório não gera evento.
reset role;
insert into public.repertoires (id, organization_id, name, created_by_user_id)
  values ('50000000-0000-0000-0000-000000002402', '10000000-0000-0000-0000-000000002401', 'Do Líder', '00000000-0000-0000-0000-000000002402');
set local role cantum_user;
select pg_temp.as_user('00000000-0000-0000-0000-000000002402');
select set_config('app.session_reauth_at', now()::text, true);
select public.delete_my_account();
select set_config('app.session_reauth_at', '', true);
reset role;
select pg_temp.ok((select count(*) = 13 from public.activity_events), 'exclusão da conta não gera evento');
select pg_temp.ok(not exists (select 1 from public.activity_events where actor_user_id = '00000000-0000-0000-0000-000000002402')
                  and (select actor_user_id is null from public.activity_events where kind = 'service.ready'), 'autor anonimizado');

-- Excluir a organização com repertório não quebra (cascata dispara os triggers).
select pg_temp.as_user('00000000-0000-0000-0000-000000002407');
insert into public.repertoires (id, organization_id, name, created_by_user_id)
  values ('50000000-0000-0000-0000-000000002407', '10000000-0000-0000-0000-000000002407', 'Outro', '00000000-0000-0000-0000-000000002407');
insert into public.repertoire_items (repertoire_id, song_id, position) values ('50000000-0000-0000-0000-000000002407', '40000000-0000-0000-0000-000000002407', 0);
delete from public.organizations where id = '10000000-0000-0000-0000-000000002407';
select pg_temp.ok(not exists (select 1 from public.activity_events where organization_id = '10000000-0000-0000-0000-000000002407'), 'organização excluída sem eventos');

-- H10 (D5): purga > 90 dias na inserção; leitura limita 30 dias e 50 por página.
insert into public.activity_events (organization_id, kind, created_at)
  select '10000000-0000-0000-0000-000000002401', 'service.ready', now() - interval '91 days' from generate_series(1, 3);
insert into public.activity_events (organization_id, kind, created_at)
  select '10000000-0000-0000-0000-000000002401', 'service.ready', now() - interval '40 days' from generate_series(1, 2);
insert into public.activity_events (organization_id, kind, created_at)
  select '10000000-0000-0000-0000-000000002401', 'service.ready', now() - n * interval '1 minute' from generate_series(1, 50) n;
set local role cantum_user;
select pg_temp.as_user('00000000-0000-0000-0000-000000002401');
select public.transition_service('60000000-0000-0000-0000-000000002401', 'ready');
reset role;
select pg_temp.ok(not exists (select 1 from public.activity_events where created_at < now() - interval '90 days'), 'H10 purga > 90 dias');
select pg_temp.ok((select count(*) = 2 from public.activity_events where created_at < now() - interval '30 days'), 'H10 30–90 dias ficam');
set local role cantum_user;
select pg_temp.ok((select jsonb_array_length(j) = 50 and j @> '[{"kind": "service.ready", "entity_id": "60000000-0000-0000-0000-000000002401"}]'
                   from (select public.get_recent_activity('10000000-0000-0000-0000-000000002401') as j) r), 'H10 página de 50 com o evento novo');
-- 13 + 1 + 50 = 64 em 30 dias → segunda página com 14; nada de 40 dias.
select pg_temp.ok(jsonb_array_length(public.get_recent_activity('10000000-0000-0000-0000-000000002401',
                    (select (x->>'created_at')::timestamptz from jsonb_array_elements(public.get_recent_activity('10000000-0000-0000-0000-000000002401')) with ordinality t(x, i) where i = 50))) = 14,
                  'H10 segunda página até 30 dias');

-- Empate: lote de 51 eventos na mesma transação (um único insert) pagina sem perder nenhum.
set local role cantum_user;
select pg_temp.as_user('00000000-0000-0000-0000-000000002408');
select public.create_organization('10000000-0000-0000-0000-000000002408', 'Lote');
insert into public.repertoires (organization_id, name, created_by_user_id)
  select '10000000-0000-0000-0000-000000002408', 'R' || n, '00000000-0000-0000-0000-000000002408' from generate_series(1, 51) n;
select pg_temp.ok((select jsonb_array_length(p1) = 50
                     and jsonb_array_length(public.get_recent_activity('10000000-0000-0000-0000-000000002408', (p1->49->>'created_at')::timestamptz)) = 1
                   from (select public.get_recent_activity('10000000-0000-0000-0000-000000002408') as p1) r), 'lote na mesma transação: p1 50, p2 1');

rollback;
