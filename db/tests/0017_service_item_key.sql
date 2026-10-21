-- CANTUM — B6 fatia 2: tom por serviço (service_items.key), RN-06…09, N-B8, N-B10, N-B11.
\set ON_ERROR_STOP on
\o /dev/null
begin;

create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('app.user_id', coalesce(p_id, ''), true) $$;

create function pg_temp.ok(p_condition boolean, p_label text) returns void language plpgsql
as $$ begin if not coalesce(p_condition, false) then raise exception 'falhou: %', p_label; end if; end $$;

create function pg_temp.fails(p_sql text, p_label text, p_state text, p_message text default null) returns void language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = p_state and (p_message is null or sqlerrm = p_message) then return; end if;
    raise exception '%: erro inesperado % "%"', p_label, sqlstate, sqlerrm;
  end;
  raise exception 'deveria falhar: %', p_label;
end $$;

create function pg_temp.affects(p_sql text, p_expected integer, p_label text) returns void language plpgsql
as $$
declare v_count integer;
begin
  execute p_sql;
  get diagnostics v_count = row_count;
  if v_count <> p_expected then raise exception '%: % linha(s), esperado %', p_label, v_count, p_expected; end if;
end $$;

-- 01 owner · 02 Líder TA · 03 Líder TB · 04 membro TA · 05 Líder inativo TA · 06 membro inativo TA · 07 owner de outra org · 08 sem vínculo
insert into app.users (id, email, display_name) select ('00000000-0000-0000-0000-0000000009' || lpad(n::text, 2, '0'))::uuid, 'k' || n || '@k.local', 'U' || n from generate_series(1, 8) n;
select pg_temp.as_user('00000000-0000-0000-0000-000000000901');
select public.create_organization('10000000-0000-0000-0000-000000000901', 'Ministério K');
select pg_temp.as_user('00000000-0000-0000-0000-000000000907');
select public.create_organization('10000000-0000-0000-0000-000000000907', 'Outro');
select pg_temp.as_user(null);
insert into public.organization_memberships (organization_id, user_id, role)
  select '10000000-0000-0000-0000-000000000901', ('00000000-0000-0000-0000-0000000009' || lpad(n::text, 2, '0'))::uuid, 'member' from generate_series(2, 6) n;
insert into public.teams (id, organization_id, name) values
  ('30000000-0000-0000-0000-000000000901', '10000000-0000-0000-0000-000000000901', 'TA'),
  ('30000000-0000-0000-0000-000000000902', '10000000-0000-0000-0000-000000000901', 'TB');
insert into public.team_memberships (team_id, user_id, role, status) values
  ('30000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000902', 'leader', 'active'),
  ('30000000-0000-0000-0000-000000000902', '00000000-0000-0000-0000-000000000903', 'leader', 'active'),
  ('30000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000904', 'member', 'active'),
  ('30000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000905', 'leader', 'inactive'),
  ('30000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000906', 'member', 'inactive');
insert into public.songs (user_id, id, organization_id, title, original_key, current_key, lyrics, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000901', '40000000-0000-0000-0000-000000000901', '10000000-0000-0000-0000-000000000901', 'Maior', 'C', 'D', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000000901', '40000000-0000-0000-0000-000000000902', '10000000-0000-0000-0000-000000000901', 'Menor', 'F#m', 'Fm', 'x', now(), now());
insert into public.services (id, organization_id, team_id, name, starts_at, created_by_user_id, status) values
  ('60000000-0000-0000-0000-000000000901', '10000000-0000-0000-0000-000000000901', '30000000-0000-0000-0000-000000000901', 'Draft', now() + interval '1 day', '00000000-0000-0000-0000-000000000901', 'draft'),
  ('60000000-0000-0000-0000-000000000902', '10000000-0000-0000-0000-000000000901', '30000000-0000-0000-0000-000000000901', 'Completed', now(), '00000000-0000-0000-0000-000000000901', 'completed'),
  ('60000000-0000-0000-0000-000000000903', '10000000-0000-0000-0000-000000000901', '30000000-0000-0000-0000-000000000901', 'Cancelled', now(), '00000000-0000-0000-0000-000000000901', 'cancelled');
insert into public.service_items (id, service_id, type, song_id, title, position) values
  ('61000000-0000-0000-0000-000000000901', '60000000-0000-0000-0000-000000000901', 'song', '40000000-0000-0000-0000-000000000901', null, 0),
  ('61000000-0000-0000-0000-000000000902', '60000000-0000-0000-0000-000000000901', 'song', '40000000-0000-0000-0000-000000000902', null, 1),
  ('61000000-0000-0000-0000-000000000903', '60000000-0000-0000-0000-000000000901', 'prayer', null, 'Oração', 2),
  ('61000000-0000-0000-0000-000000000904', '60000000-0000-0000-0000-000000000902', 'song', '40000000-0000-0000-0000-000000000901', null, 0),
  ('61000000-0000-0000-0000-000000000905', '60000000-0000-0000-0000-000000000903', 'song', '40000000-0000-0000-0000-000000000901', null, 0);

-- Constraints (como dono do schema).
select pg_temp.fails($q$update public.service_items set key = 'H' where id = '61000000-0000-0000-0000-000000000901'$q$, 'tom inválido', '23514');
select pg_temp.fails($q$update public.service_items set key = 'c' where id = '61000000-0000-0000-0000-000000000901'$q$, 'tom em minúscula', '23514');
select pg_temp.fails($q$update public.service_items set key = 'C' where id = '61000000-0000-0000-0000-000000000903'$q$, 'N-B8 key em item não musical', '23514');

set local role cantum_user;

-- Líder da equipe define; qualquer dos 24 tons do mesmo modo.
select pg_temp.as_user('00000000-0000-0000-0000-000000000902');
select pg_temp.affects($q$update public.service_items set key = 'Bb' where id = '61000000-0000-0000-0000-000000000901'$q$, 1, 'Líder define tom maior');
select pg_temp.affects($q$update public.service_items set key = 'Abm' where id = '61000000-0000-0000-0000-000000000902'$q$, 1, 'Líder define tom menor');
select pg_temp.affects($q$update public.service_items set key = null where id = '61000000-0000-0000-0000-000000000902'$q$, 1, 'Líder limpa o tom');
select pg_temp.affects($q$update public.service_items set key = 'Abm' where id = '61000000-0000-0000-0000-000000000902'$q$, 1, 'Líder redefine');
-- N-B8: outro modo, nas duas direções, e troca de música com tom incompatível.
select pg_temp.fails($q$update public.service_items set key = 'Am' where id = '61000000-0000-0000-0000-000000000901'$q$, 'N-B8 menor em música maior', '23514');
select pg_temp.fails($q$update public.service_items set key = 'C' where id = '61000000-0000-0000-0000-000000000902'$q$, 'N-B8 maior em música menor', '23514');
select pg_temp.fails($q$update public.service_items set song_id = '40000000-0000-0000-0000-000000000902' where id = '61000000-0000-0000-0000-000000000901'$q$, 'N-B8 troca de música com tom de outro modo', '23514');
select pg_temp.fails($q$update public.service_items set key = 'C' where id = '61000000-0000-0000-0000-000000000903'$q$, 'N-B8 key em item não musical (Líder)', '23514');
select pg_temp.fails($q$insert into public.service_items (service_id, type, title, key, position) values ('60000000-0000-0000-0000-000000000901', 'opening', 'A', 'C', 9)$q$, 'N-B8 insert não musical com key', '23514');

-- N-B1: Líder de outra equipe; N-B5: membro comum; N-B4: inativos; N-B2/N-B3: outra org e anônimo.
select pg_temp.as_user('00000000-0000-0000-0000-000000000903');
select pg_temp.affects($q$update public.service_items set key = 'D' where id = '61000000-0000-0000-0000-000000000901'$q$, 0, 'N-B1 Líder de outra equipe');
select pg_temp.as_user('00000000-0000-0000-0000-000000000904');
select pg_temp.affects($q$update public.service_items set key = 'D' where id = '61000000-0000-0000-0000-000000000901'$q$, 0, 'N-B5 membro comum');
select pg_temp.as_user('00000000-0000-0000-0000-000000000905');
select pg_temp.affects($q$update public.service_items set key = 'D' where id = '61000000-0000-0000-0000-000000000901'$q$, 0, 'N-B4 Líder inativo');
select pg_temp.as_user('00000000-0000-0000-0000-000000000906');
select pg_temp.affects($q$update public.service_items set key = 'D' where id = '61000000-0000-0000-0000-000000000901'$q$, 0, 'N-B4 membro inativo');
select pg_temp.as_user('00000000-0000-0000-0000-000000000907');
select pg_temp.affects($q$update public.service_items set key = 'D' where id = '61000000-0000-0000-0000-000000000901'$q$, 0, 'N-B2 outra organização');
select pg_temp.as_user('00000000-0000-0000-0000-000000000908');
select pg_temp.affects($q$update public.service_items set key = 'D' where id = '61000000-0000-0000-0000-000000000901'$q$, 0, 'sem vínculo');
select pg_temp.as_user(null);
select pg_temp.affects($q$update public.service_items set key = 'D' where id = '61000000-0000-0000-0000-000000000901'$q$, 0, 'N-B3 anônimo');

-- N-B7: serviço completed/cancelled bloqueia (inclusive o owner).
select pg_temp.as_user('00000000-0000-0000-0000-000000000901');
select pg_temp.affects($q$update public.service_items set key = 'D' where id = '61000000-0000-0000-0000-000000000904'$q$, 0, 'N-B7 completed');
select pg_temp.affects($q$update public.service_items set key = 'D' where id = '61000000-0000-0000-0000-000000000905'$q$, 0, 'N-B7 cancelled');

-- N-B11: Stage online devolve o tom do serviço; sem tom, o atual da música.
select public.create_target_stage_session('60000000-0000-0000-0000-000000000901', '70000000-0000-0000-0000-000000000901');
select pg_temp.ok((select current_key = 'Bb' and original_key = 'C' from public.get_service_stage_songs('70000000-0000-0000-0000-000000000901') where position = 0), 'N-B11 Palco devolve o tom do serviço');
select pg_temp.ok((select current_key = 'Abm' from public.get_service_stage_songs('70000000-0000-0000-0000-000000000901') where position = 1), 'N-B11 tom do serviço menor');
select pg_temp.affects($q$update public.service_items set key = null where service_id = '60000000-0000-0000-0000-000000000901'$q$, 3, 'dono limpa os tons');
select pg_temp.ok((select current_key = 'D' from public.get_service_stage_songs('70000000-0000-0000-0000-000000000901') where position = 0), 'sem tom do serviço: current_key da música');
-- A música nunca muda por causa do tom do serviço (RN-06).
select pg_temp.ok((select original_key = 'C' and current_key = 'D' from public.songs where id = '40000000-0000-0000-0000-000000000901'), 'RN-06 música intacta');

-- Música muda de modo depois do tom: o upsert de reorder (key e song_id reescritos iguais) continua passando.
select pg_temp.as_user('00000000-0000-0000-0000-000000000901');
update public.service_items set key = 'Bb' where id = '61000000-0000-0000-0000-000000000901';
reset role;
update public.songs set original_key = 'Am' where id = '40000000-0000-0000-0000-000000000901';
set local role cantum_user;
select pg_temp.as_user('00000000-0000-0000-0000-000000000902');
select pg_temp.affects($q$update public.service_items set key = 'Bb', song_id = '40000000-0000-0000-0000-000000000901', position = 5 where id = '61000000-0000-0000-0000-000000000901'$q$, 1, 'reorder com tom órfão passa');
select pg_temp.fails($q$update public.service_items set key = 'C' where id = '61000000-0000-0000-0000-000000000901'$q$, 'tom novo ainda valida o modo', '23514');
-- Música de outra organização não vaza o modo: erro do scope, igual para os dois modos.
reset role;
insert into public.songs (user_id, id, organization_id, title, original_key, current_key, lyrics, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000907', '40000000-0000-0000-0000-000000000907', '10000000-0000-0000-0000-000000000907', 'Alheia', 'Am', 'Am', 'x', now(), now());
set local role cantum_user;
select pg_temp.as_user('00000000-0000-0000-0000-000000000902');
create function pg_temp.state_of(p_sql text) returns text language plpgsql as $$ begin execute p_sql; return 'ok'; exception when others then return sqlstate; end $$;
select pg_temp.ok(pg_temp.state_of($q$update public.service_items set song_id = '40000000-0000-0000-0000-000000000907', key = 'C' where id = '61000000-0000-0000-0000-000000000901'$q$)
  = pg_temp.state_of($q$update public.service_items set song_id = '40000000-0000-0000-0000-000000000907', key = 'Cm' where id = '61000000-0000-0000-0000-000000000901'$q$)
  and pg_temp.state_of($q$update public.service_items set song_id = '40000000-0000-0000-0000-000000000907', key = 'C' where id = '61000000-0000-0000-0000-000000000901'$q$) <> '23514', 'outra organização não vaza o modo');
reset role;
rollback;
