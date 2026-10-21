-- CANTUM — B6 fatia 3: reprise e medley (service_items.ref_item_id), RN-10, RN-11, D6.
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

-- 01 owner · 02 Líder TA · 03 Líder TB · 04 membro TA · 07 owner de outra org · 08 sem vínculo
insert into app.users (id, email, display_name) select ('00000000-0000-0000-0000-0000000019' || lpad(n::text, 2, '0'))::uuid, 'r' || n || '@r.local', 'U' || n from generate_series(1, 8) n;
select pg_temp.as_user('00000000-0000-0000-0000-000000001901');
select public.create_organization('10000000-0000-0000-0000-000000001901', 'Ministério R');
select pg_temp.as_user('00000000-0000-0000-0000-000000001907');
select public.create_organization('10000000-0000-0000-0000-000000001907', 'Outro');
select pg_temp.as_user(null);
insert into public.organization_memberships (organization_id, user_id, role)
  select '10000000-0000-0000-0000-000000001901', ('00000000-0000-0000-0000-0000000019' || lpad(n::text, 2, '0'))::uuid, 'member' from generate_series(2, 4) n;
insert into public.teams (id, organization_id, name) values
  ('30000000-0000-0000-0000-000000001901', '10000000-0000-0000-0000-000000001901', 'TA'),
  ('30000000-0000-0000-0000-000000001902', '10000000-0000-0000-0000-000000001901', 'TB');
insert into public.team_memberships (team_id, user_id, role, status) values
  ('30000000-0000-0000-0000-000000001901', '00000000-0000-0000-0000-000000001902', 'leader', 'active'),
  ('30000000-0000-0000-0000-000000001902', '00000000-0000-0000-0000-000000001903', 'leader', 'active'),
  ('30000000-0000-0000-0000-000000001901', '00000000-0000-0000-0000-000000001904', 'member', 'active');
insert into public.songs (user_id, id, organization_id, title, original_key, current_key, lyrics, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000001901', '40000000-0000-0000-0000-000000001901', '10000000-0000-0000-0000-000000001901', 'Maior', 'C', 'D', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000001901', '40000000-0000-0000-0000-000000001902', '10000000-0000-0000-0000-000000001901', 'Outra', 'G', 'G', 'x', now(), now());
insert into public.services (id, organization_id, team_id, name, starts_at, created_by_user_id, status) values
  ('60000000-0000-0000-0000-000000001901', '10000000-0000-0000-0000-000000001901', '30000000-0000-0000-0000-000000001901', 'Draft', now() + interval '1 day', '00000000-0000-0000-0000-000000001901', 'draft'),
  ('60000000-0000-0000-0000-000000001902', '10000000-0000-0000-0000-000000001901', '30000000-0000-0000-0000-000000001901', 'Outro serviço', now() + interval '2 day', '00000000-0000-0000-0000-000000001901', 'draft'),
  ('60000000-0000-0000-0000-000000001903', '10000000-0000-0000-0000-000000001901', '30000000-0000-0000-0000-000000001901', 'Completed', now(), '00000000-0000-0000-0000-000000001901', 'completed');
insert into public.service_items (id, service_id, type, song_id, title, position) values
  ('61000000-0000-0000-0000-000000001901', '60000000-0000-0000-0000-000000001901', 'song', '40000000-0000-0000-0000-000000001901', null, 0),
  ('61000000-0000-0000-0000-000000001902', '60000000-0000-0000-0000-000000001901', 'song', '40000000-0000-0000-0000-000000001902', null, 1),
  ('61000000-0000-0000-0000-000000001903', '60000000-0000-0000-0000-000000001901', 'prayer', null, 'Oração', 2),
  ('61000000-0000-0000-0000-000000001904', '60000000-0000-0000-0000-000000001902', 'song', '40000000-0000-0000-0000-000000001901', null, 0),
  ('61000000-0000-0000-0000-000000001905', '60000000-0000-0000-0000-000000001903', 'song', '40000000-0000-0000-0000-000000001901', null, 0);

-- Constraints e gatilhos (como dono do schema).
insert into public.service_items (id, service_id, type, title, ref_item_id, position)
  values ('61000000-0000-0000-0000-000000001911', '60000000-0000-0000-0000-000000001901', 'reprise', 'Reprise: Maior', '61000000-0000-0000-0000-000000001901', 3);
select pg_temp.ok((select song_id is null and ref_item_id = '61000000-0000-0000-0000-000000001901' from public.service_items where id = '61000000-0000-0000-0000-000000001911'), 'RN-10 reprise com alvo song');
select pg_temp.fails($q$insert into public.service_items (service_id, type, title, ref_item_id, position) values ('60000000-0000-0000-0000-000000001901', 'reprise', 'R', '61000000-0000-0000-0000-000000001903', 9)$q$, 'RN-10 alvo não é song', '23514');
select pg_temp.fails($q$insert into public.service_items (service_id, type, title, ref_item_id, position) values ('60000000-0000-0000-0000-000000001901', 'reprise', 'R', '61000000-0000-0000-0000-000000001911', 9)$q$, 'RN-10 alvo é outra reprise', '23514');
select pg_temp.fails($q$insert into public.service_items (service_id, type, title, ref_item_id, position) values ('60000000-0000-0000-0000-000000001901', 'medley', 'M', '61000000-0000-0000-0000-000000001904', 9)$q$, 'RN-10 alvo de outro serviço', '23514');
select pg_temp.fails($q$insert into public.service_items (service_id, type, title, ref_item_id, position) values ('60000000-0000-0000-0000-000000001901', 'reprise', 'R', null, 9)$q$, 'RN-10 reprise sem ref_item_id', '23514');
select pg_temp.fails($q$insert into public.service_items (service_id, type, song_id, ref_item_id, position) values ('60000000-0000-0000-0000-000000001901', 'song', '40000000-0000-0000-0000-000000001902', '61000000-0000-0000-0000-000000001901', 9)$q$, 'RN-10 ref_item_id em song', '23514');
select pg_temp.fails($q$insert into public.service_items (service_id, type, title, ref_item_id, position) values ('60000000-0000-0000-0000-000000001901', 'prayer', 'P', '61000000-0000-0000-0000-000000001901', 9)$q$, 'RN-10 ref_item_id em tipo comum', '23514');
select pg_temp.fails($q$update public.service_items set ref_item_id = '61000000-0000-0000-0000-000000001903' where id = '61000000-0000-0000-0000-000000001911'$q$, 'RN-10 reapontar para não-song', '23514');
select pg_temp.fails($q$update public.service_items set type = 'prayer', song_id = null, title = 'X' where id = '61000000-0000-0000-0000-000000001901'$q$, 'RN-10 alvo deixa de ser song', '23514');
select pg_temp.fails($q$update public.service_items set type = 'other', song_id = null, title = 'X' where id = '61000000-0000-0000-0000-000000001901'$q$, 'RN-10 alvo deixa de ser song (other)', '23514');
select pg_temp.fails($q$update public.service_items set ref_item_id = null where id = '61000000-0000-0000-0000-000000001911'$q$, 'RN-10 limpar ref_item_id da reprise', '23514');
-- Sem reprise apontando, o item song ainda pode mudar de tipo.
select pg_temp.affects($q$update public.service_items set type = 'prayer', song_id = null, title = 'X' where id = '61000000-0000-0000-0000-000000001902'$q$, 1, 'song sem reprise muda de tipo');
update public.service_items set type = 'song', song_id = '40000000-0000-0000-0000-000000001902', title = null where id = '61000000-0000-0000-0000-000000001902';

-- Palco (D6): só 'song'; reprise e medley não aparecem.
insert into public.service_items (id, service_id, type, title, ref_item_id, position)
  values ('61000000-0000-0000-0000-000000001912', '60000000-0000-0000-0000-000000001901', 'medley', 'Medley: Maior', '61000000-0000-0000-0000-000000001901', 4);

set local role cantum_user;

select pg_temp.as_user('00000000-0000-0000-0000-000000001901');
select public.create_target_stage_session('60000000-0000-0000-0000-000000001901', '70000000-0000-0000-0000-000000001901');
select pg_temp.ok((select array_agg(position order by position) = array[0, 1] from public.get_service_stage_songs('70000000-0000-0000-0000-000000001901')), 'D6 Palco lista só song (sem reprise/medley)');
select pg_temp.ok((select count(*) = 2 from public.get_service_stage_songs('70000000-0000-0000-0000-000000001901') where song_id is not null), 'D6 Palco sem linha não musical');

-- Líder da equipe grava e apaga (service.edit).
select pg_temp.as_user('00000000-0000-0000-0000-000000001902');
select pg_temp.affects($q$insert into public.service_items (id, service_id, type, title, ref_item_id, position) values ('61000000-0000-0000-0000-000000001913', '60000000-0000-0000-0000-000000001901', 'reprise', 'Reprise: Outra', '61000000-0000-0000-0000-000000001902', 5)$q$, 1, 'Líder cria reprise');
select pg_temp.affects($q$delete from public.service_items where id = '61000000-0000-0000-0000-000000001913'$q$, 1, 'Líder exclui reprise');

-- Sem service.edit / outra organização / anônimo: nada é criado nem excluído.
select pg_temp.as_user('00000000-0000-0000-0000-000000001903');
select pg_temp.fails($q$insert into public.service_items (service_id, type, title, ref_item_id, position) values ('60000000-0000-0000-0000-000000001901', 'reprise', 'R', '61000000-0000-0000-0000-000000001901', 9)$q$, 'N-B1 Líder de outra equipe cria', '42501');
select pg_temp.affects($q$delete from public.service_items where id = '61000000-0000-0000-0000-000000001911'$q$, 0, 'N-B1 Líder de outra equipe exclui');
select pg_temp.as_user('00000000-0000-0000-0000-000000001904');
select pg_temp.fails($q$insert into public.service_items (service_id, type, title, ref_item_id, position) values ('60000000-0000-0000-0000-000000001901', 'reprise', 'R', '61000000-0000-0000-0000-000000001901', 9)$q$, 'N-B5 membro comum cria', '42501');
select pg_temp.affects($q$delete from public.service_items where id = '61000000-0000-0000-0000-000000001911'$q$, 0, 'N-B5 membro comum exclui');
select pg_temp.as_user('00000000-0000-0000-0000-000000001907');
select pg_temp.fails($q$insert into public.service_items (service_id, type, title, ref_item_id, position) values ('60000000-0000-0000-0000-000000001901', 'reprise', 'R', '61000000-0000-0000-0000-000000001901', 9)$q$, 'N-B2 outra organização cria', '42501');
select pg_temp.affects($q$delete from public.service_items where id = '61000000-0000-0000-0000-000000001911'$q$, 0, 'N-B2 outra organização exclui');
select pg_temp.as_user('00000000-0000-0000-0000-000000001908');
select pg_temp.fails($q$insert into public.service_items (service_id, type, title, ref_item_id, position) values ('60000000-0000-0000-0000-000000001901', 'reprise', 'R', '61000000-0000-0000-0000-000000001901', 9)$q$, 'sem vínculo cria', '42501');
select pg_temp.as_user(null);
select pg_temp.fails($q$insert into public.service_items (service_id, type, title, ref_item_id, position) values ('60000000-0000-0000-0000-000000001901', 'reprise', 'R', '61000000-0000-0000-0000-000000001901', 9)$q$, 'N-B3 anônimo cria', '42501');

-- N-B7: serviço completed bloqueia (inclusive o owner).
select pg_temp.as_user('00000000-0000-0000-0000-000000001901');
select pg_temp.fails($q$insert into public.service_items (service_id, type, title, ref_item_id, position) values ('60000000-0000-0000-0000-000000001903', 'reprise', 'R', '61000000-0000-0000-0000-000000001905', 9)$q$, 'N-B7 completed cria', '42501');

-- RN-11: excluir o alvo apaga as reprises/medleys dele; as de outro alvo ficam.
select pg_temp.as_user('00000000-0000-0000-0000-000000001902');
select pg_temp.affects($q$insert into public.service_items (id, service_id, type, title, ref_item_id, position) values ('61000000-0000-0000-0000-000000001914', '60000000-0000-0000-0000-000000001901', 'reprise', 'Reprise: Outra', '61000000-0000-0000-0000-000000001902', 6)$q$, 1, 'reprise de outro alvo');
select pg_temp.affects($q$delete from public.service_items where id = '61000000-0000-0000-0000-000000001901'$q$, 1, 'RN-11 exclui o alvo');
select pg_temp.ok((select count(*) = 0 from public.service_items where id in ('61000000-0000-0000-0000-000000001911', '61000000-0000-0000-0000-000000001912')), 'RN-11 cascata apaga reprise e medley');
select pg_temp.ok((select count(*) = 1 from public.service_items where id = '61000000-0000-0000-0000-000000001914'), 'RN-11 reprise de outro alvo permanece');
reset role;
rollback;
