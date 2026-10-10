-- CANTUM — B3: serviço operacional (PERMISSIONS.md §3.4, S1–S8), transições, itens genéricos
-- e Stage só com músicas.
\set ON_ERROR_STOP on
\o /dev/null
begin;

create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('app.user_id', coalesce(p_id, ''), true) $$;

create function pg_temp.ok(p_condition boolean, p_label text) returns void language plpgsql
as $$ begin if not coalesce(p_condition, false) then raise exception 'falhou: %', p_label; end if; end $$;

-- Falha com o SQLSTATE esperado (e, se informada, a mensagem exata).
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

do $$ begin
  execute format('grant usage on schema %s to cantum_user, cantum_anon', pg_my_temp_schema()::regnamespace);
end $$;

-- Fixtures: o owner · a admin · la Líder de TA · lb Líder de TB · m membro de TA
-- li Líder inativo de TA · i inactive em todas · x outra organização · n sem vínculo
insert into app.users (id, email, display_name) values
  ('00000000-0000-0000-0000-000000000501', 'owner@b3.local', 'Olga'),
  ('00000000-0000-0000-0000-000000000502', 'admin@b3.local', 'Abel'),
  ('00000000-0000-0000-0000-000000000503', 'lidera@b3.local', 'Lia'),
  ('00000000-0000-0000-0000-000000000504', 'liderb@b3.local', 'Lucas'),
  ('00000000-0000-0000-0000-000000000505', 'membro@b3.local', 'Mauro'),
  ('00000000-0000-0000-0000-000000000506', 'liderinativo@b3.local', 'Lara'),
  ('00000000-0000-0000-0000-000000000507', 'inativo@b3.local', 'Ivo'),
  ('00000000-0000-0000-0000-000000000509', 'outra@b3.local', 'Xena'),
  ('00000000-0000-0000-0000-00000000050a', 'semvinculo@b3.local', 'Nina');

select pg_temp.as_user('00000000-0000-0000-0000-000000000501');
select public.create_organization('10000000-0000-0000-0000-000000000501', 'Igreja B3');
insert into public.teams (id, organization_id, name) values
  ('30000000-0000-0000-0000-000000000501', '10000000-0000-0000-0000-000000000501', 'TA'),
  ('30000000-0000-0000-0000-000000000502', '10000000-0000-0000-0000-000000000501', 'TB');
select pg_temp.as_user('00000000-0000-0000-0000-000000000509');
select public.create_organization('10000000-0000-0000-0000-000000000502', 'Outra igreja');
insert into public.teams (id, organization_id, name) values
  ('30000000-0000-0000-0000-000000000509', '10000000-0000-0000-0000-000000000502', 'TX');
select pg_temp.as_user(null);

insert into public.organization_memberships (organization_id, user_id, role)
select '10000000-0000-0000-0000-000000000501', u, r from (values
  ('00000000-0000-0000-0000-000000000502'::uuid, 'admin'),
  ('00000000-0000-0000-0000-000000000503', 'member'), ('00000000-0000-0000-0000-000000000504', 'member'),
  ('00000000-0000-0000-0000-000000000505', 'member'), ('00000000-0000-0000-0000-000000000506', 'member'),
  ('00000000-0000-0000-0000-000000000507', 'member')) v(u, r);
insert into public.team_memberships (team_id, user_id, role, status) values
  ('30000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000503', 'leader', 'active'),
  ('30000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000504', 'leader', 'active'),
  ('30000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000505', 'member', 'active'),
  ('30000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000506', 'leader', 'inactive'),
  ('30000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000507', 'member', 'inactive');

insert into public.songs (user_id, id, title, original_key, current_key, lyrics, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000501', '40000000-0000-0000-0000-000000000501', 'Primeira', 'C', 'C', 'C', now(), now()),
  ('00000000-0000-0000-0000-000000000501', '40000000-0000-0000-0000-000000000502', 'Segunda', 'D', 'D', 'D', now(), now());
insert into public.organization_songs (organization_id, song_id) values
  ('10000000-0000-0000-0000-000000000501', '40000000-0000-0000-0000-000000000501'),
  ('10000000-0000-0000-0000-000000000501', '40000000-0000-0000-0000-000000000502');
-- Serviço da equipe TB (draft) e um de TA já ready, criados pelo dono do schema.
insert into public.services (id, organization_id, team_id, name, starts_at, created_by_user_id, status) values
  ('60000000-0000-0000-0000-000000000502', '10000000-0000-0000-0000-000000000501', '30000000-0000-0000-0000-000000000502', 'Culto TB', now(), '00000000-0000-0000-0000-000000000501', 'draft'),
  ('60000000-0000-0000-0000-000000000503', '10000000-0000-0000-0000-000000000501', '30000000-0000-0000-0000-000000000501', 'Culto TA pronto', now(), '00000000-0000-0000-0000-000000000501', 'ready');

-- S5: equipe de outra organização é barrada pela FK composta (mesmo sem RLS).
select pg_temp.fails($q$insert into public.services (organization_id, team_id, name, starts_at, created_by_user_id) values ('10000000-0000-0000-0000-000000000501', '30000000-0000-0000-0000-000000000509', 'Intruso', now(), '00000000-0000-0000-0000-000000000501')$q$, 'S5 FK composta', '23503');

set local role cantum_user;

-- ---------------------------------------------------------------------------
-- Contrastes positivos: Líder da equipe
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-000000000503');
insert into public.services (id, organization_id, team_id, name, starts_at, created_by_user_id, location, notes)
  values ('60000000-0000-0000-0000-000000000501', '10000000-0000-0000-0000-000000000501', '30000000-0000-0000-0000-000000000501',
          'Culto de domingo', now() + interval '3 days', '00000000-0000-0000-0000-000000000503', 'Templo', 'Santa Ceia');
select pg_temp.ok((select status = 'draft' from public.services where id = '60000000-0000-0000-0000-000000000501'), 'nasce draft');
select pg_temp.affects($q$update public.services set name = 'Culto da manhã', location = 'Salão' where id = '60000000-0000-0000-0000-000000000501'$q$, 1, 'Líder edita informações');
insert into public.service_items (id, service_id, type, title, position) values
  ('61000000-0000-0000-0000-000000000501', '60000000-0000-0000-0000-000000000501', 'opening', 'Abertura', 0),
  ('61000000-0000-0000-0000-000000000503', '60000000-0000-0000-0000-000000000501', 'prayer', 'Oração', 2);
insert into public.service_items (id, service_id, type, song_id, position, duration_minutes) values
  ('61000000-0000-0000-0000-000000000502', '60000000-0000-0000-0000-000000000501', 'song', '40000000-0000-0000-0000-000000000501', 1, 5),
  ('61000000-0000-0000-0000-000000000504', '60000000-0000-0000-0000-000000000501', 'song', '40000000-0000-0000-0000-000000000502', 3, null);
-- Renumerar: trocar posições na mesma transação (unique deferida).
update public.service_items set position = 1 where id = '61000000-0000-0000-0000-000000000501';
update public.service_items set position = 0 where id = '61000000-0000-0000-0000-000000000502';
set constraints service_items_service_id_position_key immediate;
set constraints service_items_service_id_position_key deferred;
select pg_temp.ok((select type = 'song' from public.service_items where service_id = '60000000-0000-0000-0000-000000000501' and position = 0), 'reordenação');
select pg_temp.fails($q$set constraints all immediate; update public.service_items set position = 2 where id = '61000000-0000-0000-0000-000000000501'$q$, 'posição duplicada no fim', '23505');
set constraints all deferred;
select public.transition_service('60000000-0000-0000-0000-000000000501', 'ready');
select public.transition_service('60000000-0000-0000-0000-000000000501', 'draft');
select public.transition_service('60000000-0000-0000-0000-000000000501', 'ready');

-- Membro ativo lê serviço e ordem.
select pg_temp.as_user('00000000-0000-0000-0000-000000000505');
select pg_temp.ok((select count(*) = 3 from public.services), 'Membro lê os serviços da organização');
select pg_temp.ok((select count(*) = 4 from public.service_items where service_id = '60000000-0000-0000-0000-000000000501'), 'Membro lê a ordem');

-- ---------------------------------------------------------------------------
-- Checks de item (RN-04)
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-000000000503');
select pg_temp.fails($q$insert into public.service_items (service_id, type, position) values ('60000000-0000-0000-0000-000000000501', 'song', 9)$q$, 'song sem música', '23514');
select pg_temp.fails($q$insert into public.service_items (service_id, type, position) values ('60000000-0000-0000-0000-000000000501', 'prayer', 9)$q$, 'não musical sem título', '23514');
select pg_temp.fails($q$insert into public.service_items (service_id, type, title, position) values ('60000000-0000-0000-0000-000000000501', 'prayer', '   ', 9)$q$, 'título em branco', '23514');
select pg_temp.fails($q$insert into public.service_items (service_id, type, title, position) values ('60000000-0000-0000-0000-000000000501', 'prayer', repeat('x', 121), 9)$q$, 'título > 120', '23514');
select pg_temp.fails($q$insert into public.service_items (service_id, type, title, song_id, position) values ('60000000-0000-0000-0000-000000000501', 'prayer', 'Oração', '40000000-0000-0000-0000-000000000501', 9)$q$, 'não musical com música', '23514');
select pg_temp.fails($q$insert into public.service_items (service_id, type, title, position) values ('60000000-0000-0000-0000-000000000501', 'dance', 'Dança', 9)$q$, 'tipo desconhecido', '23514');
select pg_temp.fails($q$insert into public.service_items (service_id, type, title, position, duration_minutes) values ('60000000-0000-0000-0000-000000000501', 'other', 'Aviso', 9, 0)$q$, 'duração 0', '23514');
select pg_temp.fails($q$insert into public.service_items (service_id, type, title, position, duration_minutes) values ('60000000-0000-0000-0000-000000000501', 'other', 'Aviso', 9, 601)$q$, 'duração > 600', '23514');

-- ---------------------------------------------------------------------------
-- S1 — Líder de TA no serviço de TB
-- ---------------------------------------------------------------------------
select pg_temp.fails($q$insert into public.services (organization_id, team_id, name, starts_at, created_by_user_id) values ('10000000-0000-0000-0000-000000000501', '30000000-0000-0000-0000-000000000502', 'Em TB', now(), '00000000-0000-0000-0000-000000000503')$q$, 'S1 cria em TB', '42501');
select pg_temp.affects($q$update public.services set name = 'Invadido' where id = '60000000-0000-0000-0000-000000000502'$q$, 0, 'S1 edita serviço de TB');
select pg_temp.fails($q$insert into public.service_items (service_id, type, title, position) values ('60000000-0000-0000-0000-000000000502', 'other', 'Intruso', 0)$q$, 'S1 edita ordem de TB', '42501');
select pg_temp.fails($q$select public.transition_service('60000000-0000-0000-0000-000000000502', 'ready')$q$, 'S1 transiciona TB', 'P0001', 'service not found or not authorized');
select pg_temp.fails($q$update public.services set team_id = '30000000-0000-0000-0000-000000000502' where id = '60000000-0000-0000-0000-000000000501'$q$, 'S1 move o serviço para TB', '42501');
select pg_temp.affects($q$delete from public.services where id = '60000000-0000-0000-0000-000000000502'$q$, 0, 'S1 exclui serviço de TB');

-- S2 — Membro
select pg_temp.as_user('00000000-0000-0000-0000-000000000505');
select pg_temp.fails($q$insert into public.services (organization_id, team_id, name, starts_at, created_by_user_id) values ('10000000-0000-0000-0000-000000000501', '30000000-0000-0000-0000-000000000501', 'Do membro', now(), '00000000-0000-0000-0000-000000000505')$q$, 'S2 cria', '42501');
select pg_temp.affects($q$update public.services set name = 'Pelo membro' where id = '60000000-0000-0000-0000-000000000501'$q$, 0, 'S2 edita');
select pg_temp.fails($q$insert into public.service_items (service_id, type, title, position) values ('60000000-0000-0000-0000-000000000501', 'other', 'Do membro', 9)$q$, 'S2 edita ordem', '42501');
select pg_temp.affects($q$delete from public.service_items where service_id = '60000000-0000-0000-0000-000000000501'$q$, 0, 'S2 remove itens');
select pg_temp.fails($q$select public.transition_service('60000000-0000-0000-0000-000000000501', 'in_progress')$q$, 'S2 transiciona', 'P0001', 'service not found or not authorized');
select pg_temp.affects($q$delete from public.services where id = '60000000-0000-0000-0000-000000000501'$q$, 0, 'S2 exclui');

-- S3 — status por escrita direta, para qualquer papel (privilégio de coluna)
select pg_temp.as_user('00000000-0000-0000-0000-000000000501');
select pg_temp.fails($q$update public.services set status = 'in_progress' where id = '60000000-0000-0000-0000-000000000501'$q$, 'S3 Owner update', '42501');
select pg_temp.fails($q$insert into public.services (id, organization_id, team_id, name, starts_at, created_by_user_id, status) values ('60000000-0000-0000-0000-000000000501', '10000000-0000-0000-0000-000000000501', '30000000-0000-0000-0000-000000000501', 'x', now(), '00000000-0000-0000-0000-000000000501', 'completed') on conflict (id) do update set status = excluded.status$q$, 'S3 upsert do sync', '42501');
select pg_temp.as_user('00000000-0000-0000-0000-000000000503');
select pg_temp.fails($q$update public.services set status = 'completed' where id = '60000000-0000-0000-0000-000000000501'$q$, 'S3 Líder update', '42501');

-- S3 sem o reforço de coluna: o trigger de guarda barra sozinho.
reset role;
grant insert (status), update (status) on public.services to cantum_user;
set local role cantum_user;
select pg_temp.as_user('00000000-0000-0000-0000-000000000502');
select pg_temp.fails($q$update public.services set status = 'in_progress' where id = '60000000-0000-0000-0000-000000000501'$q$, 'S3 trigger Admin', '42501');
select pg_temp.fails($q$insert into public.services (organization_id, team_id, name, starts_at, created_by_user_id, status) values ('10000000-0000-0000-0000-000000000501', '30000000-0000-0000-0000-000000000501', 'Já pronto', now(), '00000000-0000-0000-0000-000000000502', 'ready')$q$, 'S3 trigger insert', '42501');
select pg_temp.fails($q$update public.services set created_by_user_id = '00000000-0000-0000-0000-000000000502' where id = '60000000-0000-0000-0000-000000000501'$q$, 'autor imutável', '42501');
reset role;
revoke insert (status), update (status) on public.services from cantum_user;
set local role cantum_user;

-- S4 — transições inválidas pela RPC
select pg_temp.as_user('00000000-0000-0000-0000-000000000503');
select pg_temp.fails($q$select public.transition_service('60000000-0000-0000-0000-000000000501', 'completed')$q$, 'S4 ready → completed', 'P0001', 'invalid service transition');
select pg_temp.fails($q$select public.transition_service('60000000-0000-0000-0000-000000000501', 'ready')$q$, 'S4 ready → ready', 'P0001', 'invalid service transition');
select pg_temp.fails($q$select public.transition_service('60000000-0000-0000-0000-000000000501', 'planned')$q$, 'S4 estado antigo', 'P0001', 'invalid service status');
select public.transition_service('60000000-0000-0000-0000-000000000501', 'in_progress');
select pg_temp.fails($q$select public.transition_service('60000000-0000-0000-0000-000000000501', 'draft')$q$, 'S4 in_progress → draft', 'P0001', 'invalid service transition');
select pg_temp.fails($q$select public.transition_service('60000000-0000-0000-0000-000000000501', 'ready')$q$, 'S4 in_progress → ready', 'P0001', 'invalid service transition');
select pg_temp.affects($q$update public.services set notes = 'Em andamento' where id = '60000000-0000-0000-0000-000000000501'$q$, 1, 'in_progress ainda edita');
select public.transition_service('60000000-0000-0000-0000-000000000501', 'completed');
select pg_temp.fails($q$select public.transition_service('60000000-0000-0000-0000-000000000501', 'draft')$q$, 'S4 completed → draft', 'P0001', 'invalid service transition');
select pg_temp.fails($q$select public.transition_service('60000000-0000-0000-0000-000000000501', 'cancelled')$q$, 'S4 completed → cancelled', 'P0001', 'invalid service transition');

insert into public.services (id, organization_id, team_id, name, starts_at, created_by_user_id)
  values ('60000000-0000-0000-0000-000000000504', '10000000-0000-0000-0000-000000000501', '30000000-0000-0000-0000-000000000501', 'Cancelado', now(), '00000000-0000-0000-0000-000000000503');
select pg_temp.fails($q$select public.transition_service('60000000-0000-0000-0000-000000000504', 'in_progress')$q$, 'S4 draft → in_progress', 'P0001', 'invalid service transition');
select pg_temp.fails($q$select public.transition_service('60000000-0000-0000-0000-000000000504', 'completed')$q$, 'S4 draft → completed', 'P0001', 'invalid service transition');
select public.transition_service('60000000-0000-0000-0000-000000000504', 'cancelled');
select pg_temp.fails($q$select public.transition_service('60000000-0000-0000-0000-000000000504', 'ready')$q$, 'S4 cancelled → ready', 'P0001', 'invalid service transition');
select pg_temp.fails($q$select public.transition_service('60000000-0000-0000-0000-000000000504', 'draft')$q$, 'S4 cancelled → draft', 'P0001', 'invalid service transition');

-- S6 — serviço completed ou cancelled não aceita edição, nem do Owner
select pg_temp.fails($q$update public.services set name = 'Depois' where id = '60000000-0000-0000-0000-000000000501'$q$, 'S6 Líder edita completed', '42501', 'service is completed or cancelled');
select pg_temp.fails($q$insert into public.service_items (service_id, type, title, position) values ('60000000-0000-0000-0000-000000000501', 'other', 'Depois', 9)$q$, 'S6 ordem de completed', '42501');
select pg_temp.affects($q$update public.service_items set title = 'Depois' where id = '61000000-0000-0000-0000-000000000503'$q$, 0, 'S6 item de completed');
select pg_temp.affects($q$delete from public.service_items where service_id = '60000000-0000-0000-0000-000000000501'$q$, 0, 'S6 remove item de completed');
select pg_temp.as_user('00000000-0000-0000-0000-000000000501');
select pg_temp.fails($q$update public.services set name = 'Depois' where id = '60000000-0000-0000-0000-000000000504'$q$, 'S6 Owner edita cancelled', '42501', 'service is completed or cancelled');

-- S7 — Líder exclui só em draft; Owner e Admin excluem sempre
select pg_temp.as_user('00000000-0000-0000-0000-000000000503');
select pg_temp.affects($q$delete from public.services where id = '60000000-0000-0000-0000-000000000503'$q$, 0, 'S7 Líder exclui ready');
select pg_temp.affects($q$delete from public.services where id = '60000000-0000-0000-0000-000000000504'$q$, 0, 'S7 Líder exclui cancelled');
insert into public.services (id, organization_id, team_id, name, starts_at, created_by_user_id)
  values ('60000000-0000-0000-0000-000000000505', '10000000-0000-0000-0000-000000000501', '30000000-0000-0000-0000-000000000501', 'Rascunho', now(), '00000000-0000-0000-0000-000000000503');
select pg_temp.affects($q$delete from public.services where id = '60000000-0000-0000-0000-000000000505'$q$, 1, 'Líder exclui draft');
select pg_temp.as_user('00000000-0000-0000-0000-000000000502');
select pg_temp.affects($q$delete from public.services where id = '60000000-0000-0000-0000-000000000504'$q$, 1, 'Admin exclui cancelled');

-- S8 — Líder inativo da equipe do serviço
select pg_temp.as_user('00000000-0000-0000-0000-000000000506');
select pg_temp.fails($q$insert into public.services (organization_id, team_id, name, starts_at, created_by_user_id) values ('10000000-0000-0000-0000-000000000501', '30000000-0000-0000-0000-000000000501', 'Do inativo', now(), '00000000-0000-0000-0000-000000000506')$q$, 'S8 cria', '42501');
select pg_temp.affects($q$update public.services set name = 'Pelo inativo' where id = '60000000-0000-0000-0000-000000000503'$q$, 0, 'S8 edita');
select pg_temp.fails($q$select public.transition_service('60000000-0000-0000-0000-000000000503', 'draft')$q$, 'S8 transiciona', 'P0001', 'service not found or not authorized');
select pg_temp.fails($q$insert into public.service_items (service_id, type, title, position) values ('60000000-0000-0000-0000-000000000503', 'other', 'Do inativo', 0)$q$, 'S8 ordem', '42501');
reset role;
insert into public.services (id, organization_id, team_id, name, starts_at, created_by_user_id)
  values ('60000000-0000-0000-0000-000000000506', '10000000-0000-0000-0000-000000000501', '30000000-0000-0000-0000-000000000501', 'Rascunho 2', now(), '00000000-0000-0000-0000-000000000501');
set local role cantum_user;
select pg_temp.affects($q$delete from public.services where id = '60000000-0000-0000-0000-000000000506'$q$, 0, 'S8 exclui draft');

-- Leitura: inactive em todas, outra organização, sem vínculo e anônimo não leem.
select pg_temp.as_user('00000000-0000-0000-0000-000000000507');
select pg_temp.ok((select count(*) = 0 from public.services), 'inactive lê serviços');
select pg_temp.ok((select count(*) = 0 from public.service_items), 'inactive lê ordem');
select pg_temp.as_user('00000000-0000-0000-0000-000000000509');
select pg_temp.ok((select count(*) = 0 from public.services where organization_id = '10000000-0000-0000-0000-000000000501'), 'outra organização lê serviços');
select pg_temp.fails($q$insert into public.services (organization_id, team_id, name, starts_at, created_by_user_id) values ('10000000-0000-0000-0000-000000000501', '30000000-0000-0000-0000-000000000509', 'Intruso', now(), '00000000-0000-0000-0000-000000000509')$q$, 'S5 outra organização pela RLS', '42501');
select pg_temp.fails($q$select public.transition_service('60000000-0000-0000-0000-000000000503', 'draft')$q$, 'outra organização transiciona', 'P0001', 'service not found or not authorized');
select pg_temp.as_user('00000000-0000-0000-0000-00000000050a');
select pg_temp.ok((select count(*) = 0 from public.services), 'sem vínculo lê serviços');
select pg_temp.as_user(null);
select pg_temp.ok((select count(*) = 0 from public.services), 'anônimo lê serviços');
select pg_temp.fails($q$select public.transition_service('60000000-0000-0000-0000-000000000503', 'draft')$q$, 'anônimo transiciona', 'P0001', 'authentication required');
reset role;
set local role cantum_anon;
select pg_temp.fails($q$select 1 from public.services$q$, 'cantum_anon lê serviços', '42501');
reset role;
set local role cantum_user;

-- ---------------------------------------------------------------------------
-- Equipe com serviços não é excluída
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-000000000501');
select pg_temp.fails($q$delete from public.teams where id = '30000000-0000-0000-0000-000000000502'$q$, 'equipe com serviços', '23503');

-- ---------------------------------------------------------------------------
-- Stage só com músicas (RN-07): opening(0) · song(1) · prayer(2) · song(3)
-- ---------------------------------------------------------------------------
insert into public.services (id, organization_id, team_id, name, starts_at, created_by_user_id)
  values ('60000000-0000-0000-0000-000000000507', '10000000-0000-0000-0000-000000000501', '30000000-0000-0000-0000-000000000501', 'Com Stage', now(), '00000000-0000-0000-0000-000000000501');
insert into public.service_items (id, service_id, type, title, song_id, position) values
  ('62000000-0000-0000-0000-000000000500', '60000000-0000-0000-0000-000000000507', 'opening', 'Abertura', null, 0),
  ('62000000-0000-0000-0000-000000000501', '60000000-0000-0000-0000-000000000507', 'song', null, '40000000-0000-0000-0000-000000000501', 1),
  ('62000000-0000-0000-0000-000000000502', '60000000-0000-0000-0000-000000000507', 'prayer', 'Oração', null, 2),
  ('62000000-0000-0000-0000-000000000503', '60000000-0000-0000-0000-000000000507', 'song', null, '40000000-0000-0000-0000-000000000502', 3),
  ('62000000-0000-0000-0000-000000000504', '60000000-0000-0000-0000-000000000507', 'closing', 'Bênção', null, 4);
select public.create_target_stage_session('60000000-0000-0000-0000-000000000507', '70000000-0000-0000-0000-000000000501');
select pg_temp.ok((select current_index = 1 and current_song_id = '40000000-0000-0000-0000-000000000501'
  from public.stage_session_states where stage_session_id = '70000000-0000-0000-0000-000000000501'), 'Stage começa na primeira música');
select public.target_stage_start('70000000-0000-0000-0000-000000000501');
select pg_temp.ok((select (public.target_stage_next('70000000-0000-0000-0000-000000000501')).current_index = 3), 'next pula o item não musical');
select pg_temp.ok((select (public.target_stage_next('70000000-0000-0000-0000-000000000501')).current_index = 3), 'next na última música não sai dela');
select pg_temp.ok((select (public.target_stage_previous('70000000-0000-0000-0000-000000000501')).current_index = 1), 'previous pula o item não musical');
select pg_temp.ok((select (public.target_stage_previous('70000000-0000-0000-0000-000000000501')).current_index = 1), 'previous na primeira música não sai dela');
select pg_temp.fails($q$select public.target_stage_goto('70000000-0000-0000-0000-000000000501', 2)$q$, 'goto em item não musical', 'P0001', 'stage item not found');
select pg_temp.ok((select (public.target_stage_goto('70000000-0000-0000-0000-000000000501', 3)).current_index = 3), 'goto em música');
select pg_temp.fails($q$select public.target_stage_prepare_next('70000000-0000-0000-0000-000000000501', 4, null)$q$, 'prepare_next em item não musical', 'P0001', 'stage item not found');
select pg_temp.ok((select (public.target_stage_prepare_next('70000000-0000-0000-0000-000000000501', 1, '40000000-0000-0000-0000-000000000501')).prepared_index = 1), 'prepare_next em música');
select pg_temp.ok((select array_agg(position order by position) = array[1, 3] from public.get_service_stage_songs('70000000-0000-0000-0000-000000000501')), 'Stage lista só as músicas');

insert into public.services (id, organization_id, team_id, name, starts_at, created_by_user_id)
  values ('60000000-0000-0000-0000-000000000508', '10000000-0000-0000-0000-000000000501', '30000000-0000-0000-0000-000000000501', 'Sem música', now(), '00000000-0000-0000-0000-000000000501');
insert into public.service_items (service_id, type, title, position)
  values ('60000000-0000-0000-0000-000000000508', 'preaching', 'Ministração', 0);
select pg_temp.fails($q$select public.create_target_stage_session('60000000-0000-0000-0000-000000000508')$q$, 'Stage sem música', 'P0001', 'service must contain at least one song before starting stage');

-- Excluir a organização apaga serviços e equipes juntos (FK "no action", não "restrict").
-- A sessão de palco sai antes: com ela viva, o cascade esbarra no guarda do operador
-- do Stage (bug anterior ao B3, relatado à parte).
reset role;
delete from public.stage_sessions where id = '70000000-0000-0000-0000-000000000501';
set local role cantum_user;
select pg_temp.affects($q$delete from public.organizations where id = '10000000-0000-0000-0000-000000000501'$q$, 1, 'Owner exclui a organização com serviços');

reset role;
rollback;
