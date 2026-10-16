-- CANTUM — FIX-01 / Fatia B: ordem em lote, sem música repetida no serviço e stage.start (D4).
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


-- o owner 801 · l Líder de TA 803 · lb Líder de TB 807 · m Membro de TA 804 · i Líder inativo de TA 806
insert into app.users (id, email, display_name) values
  ('00000000-0000-0000-0000-000000000801', 'owner@g.local', 'Olga'),
  ('00000000-0000-0000-0000-000000000803', 'lider@g.local', 'Lia'),
  ('00000000-0000-0000-0000-000000000804', 'membro@g.local', 'Mauro'),
  ('00000000-0000-0000-0000-000000000806', 'inativo@g.local', 'Ivo'),
  ('00000000-0000-0000-0000-000000000807', 'liderb@g.local', 'Bia'),
  ('00000000-0000-0000-0000-000000000802', 'admin@g.local', 'Abel'),
  ('00000000-0000-0000-0000-000000000808', 'membrob@g.local', 'Beto');

select pg_temp.as_user('00000000-0000-0000-0000-000000000801');
select public.create_organization('10000000-0000-0000-0000-000000000801', 'Ministério G');
insert into public.teams (id, organization_id, name) values
  ('30000000-0000-0000-0000-000000000801', '10000000-0000-0000-0000-000000000801', 'TA'),
  ('30000000-0000-0000-0000-000000000802', '10000000-0000-0000-0000-000000000801', 'TB');
select pg_temp.as_user(null);

insert into public.organization_memberships (organization_id, user_id, role)
select '10000000-0000-0000-0000-000000000801', u, 'member' from (values
  ('00000000-0000-0000-0000-000000000803'::uuid), ('00000000-0000-0000-0000-000000000804'),
  ('00000000-0000-0000-0000-000000000806'), ('00000000-0000-0000-0000-000000000807'),
  ('00000000-0000-0000-0000-000000000808'), ('00000000-0000-0000-0000-000000000802')) v(u);
update public.organization_memberships set role = 'admin'
  where organization_id = '10000000-0000-0000-0000-000000000801' and user_id = '00000000-0000-0000-0000-000000000802';
insert into public.team_memberships (team_id, user_id, role, status) values
  ('30000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000803', 'leader', 'active'),
  ('30000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000804', 'member', 'active'),
  ('30000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000806', 'leader', 'inactive'),
  ('30000000-0000-0000-0000-000000000802', '00000000-0000-0000-0000-000000000807', 'leader', 'active'),
  ('30000000-0000-0000-0000-000000000802', '00000000-0000-0000-0000-000000000808', 'member', 'active');

-- Cópias do Ministério (autor 801) e um repertório com 3 itens.
insert into public.songs (user_id, id, organization_id, title, original_key, current_key, lyrics, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000801', '41000000-0000-0000-0000-000000000801', '10000000-0000-0000-0000-000000000801', 'Um', 'C', 'C', 'C', now(), now()),
  ('00000000-0000-0000-0000-000000000801', '41000000-0000-0000-0000-000000000802', '10000000-0000-0000-0000-000000000801', 'Dois', 'C', 'C', 'C', now(), now()),
  ('00000000-0000-0000-0000-000000000801', '41000000-0000-0000-0000-000000000803', '10000000-0000-0000-0000-000000000801', 'Três', 'C', 'C', 'C', now(), now());
insert into public.repertoires (id, organization_id, name, created_by_user_id)
  values ('50000000-0000-0000-0000-000000000801', '10000000-0000-0000-0000-000000000801', 'R', '00000000-0000-0000-0000-000000000801');
insert into public.repertoire_items (id, repertoire_id, song_id, position) values
  ('51000000-0000-0000-0000-000000000801', '50000000-0000-0000-0000-000000000801', '41000000-0000-0000-0000-000000000801', 0),
  ('51000000-0000-0000-0000-000000000802', '50000000-0000-0000-0000-000000000801', '41000000-0000-0000-0000-000000000802', 1),
  ('51000000-0000-0000-0000-000000000803', '50000000-0000-0000-0000-000000000801', '41000000-0000-0000-0000-000000000803', 2);
insert into public.services (id, organization_id, team_id, name, starts_at, created_by_user_id, status) values
  ('60000000-0000-0000-0000-000000000801', '10000000-0000-0000-0000-000000000801', '30000000-0000-0000-0000-000000000801', 'Culto TA', now() + interval '1 day', '00000000-0000-0000-0000-000000000801', 'draft'),
  ('60000000-0000-0000-0000-000000000802', '10000000-0000-0000-0000-000000000801', '30000000-0000-0000-0000-000000000802', 'Culto TB', now() + interval '1 day', '00000000-0000-0000-0000-000000000801', 'draft'),
  ('60000000-0000-0000-0000-000000000803', '10000000-0000-0000-0000-000000000801', '30000000-0000-0000-0000-000000000802', 'Culto TB 2', now() + interval '2 day', '00000000-0000-0000-0000-000000000801', 'draft');
insert into public.service_items (service_id, type, song_id, position) values
  ('60000000-0000-0000-0000-000000000801', 'song', '41000000-0000-0000-0000-000000000801', 0),
  ('60000000-0000-0000-0000-000000000802', 'song', '41000000-0000-0000-0000-000000000801', 0),
  ('60000000-0000-0000-0000-000000000803', 'song', '41000000-0000-0000-0000-000000000801', 0);

set local role cantum_user;
select pg_temp.as_user('00000000-0000-0000-0000-000000000801');

-- RN-B1: troca de posições numa só transação (unique deferida).
select pg_temp.affects($q$update public.repertoire_items set position = 1 - position where repertoire_id = '50000000-0000-0000-0000-000000000801' and position < 2$q$, 2, 'trocar posições num comando');
select pg_temp.ok((select position = 1 from public.repertoire_items where id = '51000000-0000-0000-0000-000000000801'), 'posição trocada');
set constraints all immediate;
select pg_temp.fails($q$update public.repertoire_items set position = 0 where id = '51000000-0000-0000-0000-000000000803'$q$, 'posição repetida', '23505');
set constraints all deferred;

-- RN-A8: sem música repetida na ordem do serviço; item não musical não conta.
select pg_temp.fails($q$insert into public.service_items (service_id, type, song_id, position) values ('60000000-0000-0000-0000-000000000801', 'song', '41000000-0000-0000-0000-000000000801', 1)$q$, 'música repetida no serviço', '23505');
select pg_temp.affects($q$insert into public.service_items (service_id, type, song_id, position) values ('60000000-0000-0000-0000-000000000801', 'song', '41000000-0000-0000-0000-000000000802', 1)$q$, 1, 'outra música entra');
select pg_temp.affects($q$insert into public.service_items (service_id, type, title, position) values ('60000000-0000-0000-0000-000000000801', 'other', 'Aviso', 2), ('60000000-0000-0000-0000-000000000801', 'other', 'Aviso', 3)$q$, 2, 'itens não musicais repetidos');

-- D4: stage.start.
select pg_temp.as_user('00000000-0000-0000-0000-000000000804'); -- Membro
select pg_temp.fails($q$select public.create_target_stage_session('60000000-0000-0000-0000-000000000801')$q$, 'Membro não inicia', 'P0001', 'not authorized to create stage sessions');
select pg_temp.as_user('00000000-0000-0000-0000-000000000807'); -- Líder de outra equipe
select pg_temp.fails($q$select public.create_target_stage_session('60000000-0000-0000-0000-000000000801')$q$, 'Líder de outra equipe não inicia', 'P0001', 'not authorized to create stage sessions');
select pg_temp.as_user('00000000-0000-0000-0000-000000000806'); -- Líder inativo
select pg_temp.fails($q$select public.create_target_stage_session('60000000-0000-0000-0000-000000000801')$q$, 'Líder inativo não inicia', 'P0001', 'not authorized to create stage sessions');
select pg_temp.as_user('00000000-0000-0000-0000-000000000803'); -- Líder de TA
select pg_temp.fails($q$select public.create_target_stage_session('60000000-0000-0000-0000-000000000802')$q$, 'Líder de TA não inicia serviço de TB', 'P0001', 'not authorized to create stage sessions');
select pg_temp.ok((select status = 'lobby' from public.create_target_stage_session('60000000-0000-0000-0000-000000000801', '70000000-0000-0000-0000-000000000801')), 'Líder da equipe do serviço inicia');
select pg_temp.as_user('00000000-0000-0000-0000-000000000808'); -- Membro de TB, não da equipe do serviço (TA)
select pg_temp.fails($q$select public.create_target_stage_session('60000000-0000-0000-0000-000000000801')$q$, 'Membro de outra equipe não inicia', 'P0001', 'not authorized to create stage sessions');
select pg_temp.as_user('00000000-0000-0000-0000-000000000802'); -- Admin
select pg_temp.ok((select status = 'lobby' from public.create_target_stage_session('60000000-0000-0000-0000-000000000802', '70000000-0000-0000-0000-000000000803')), 'Admin inicia o Palco');
select pg_temp.as_user('00000000-0000-0000-0000-000000000801'); -- Owner
select pg_temp.ok((select status = 'lobby' from public.create_target_stage_session('60000000-0000-0000-0000-000000000803', '70000000-0000-0000-0000-000000000802')), 'Owner inicia serviço de qualquer equipe');

reset role;
rollback;
