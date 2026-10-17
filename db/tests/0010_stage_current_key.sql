-- CANTUM — FIX-01: o Palco do serviço devolve o tom atual da música, não o original.
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

insert into app.users (id, email, display_name) values ('00000000-0000-0000-0000-000000000a01', 'owner@i.local', 'Olga');
select pg_temp.as_user('00000000-0000-0000-0000-000000000a01');
select public.create_organization('10000000-0000-0000-0000-000000000a01', 'Ministério I');
insert into public.teams (id, organization_id, name) values ('30000000-0000-0000-0000-000000000a01', '10000000-0000-0000-0000-000000000a01', 'TA');
insert into public.songs (user_id, id, organization_id, title, original_key, current_key, lyrics, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000a01', '41000000-0000-0000-0000-000000000a01', '10000000-0000-0000-0000-000000000a01', 'Rocha', 'F#m', 'Fm', '[Fm]x', now(), now());
insert into public.services (id, organization_id, team_id, name, starts_at, created_by_user_id)
  values ('60000000-0000-0000-0000-000000000a01', '10000000-0000-0000-0000-000000000a01', '30000000-0000-0000-0000-000000000a01', 'Culto', now() + interval '1 day', '00000000-0000-0000-0000-000000000a01');
insert into public.service_items (service_id, type, song_id, position) values ('60000000-0000-0000-0000-000000000a01', 'song', '41000000-0000-0000-0000-000000000a01', 0);
set local role cantum_user;
select pg_temp.as_user('00000000-0000-0000-0000-000000000a01');
select public.create_target_stage_session('60000000-0000-0000-0000-000000000a01', '70000000-0000-0000-0000-000000000a01');
select pg_temp.ok((select original_key = 'F#m' and current_key = 'Fm' from public.get_service_stage_songs('70000000-0000-0000-0000-000000000a01')), 'Palco devolve original e atual distintos');
reset role;
rollback;
