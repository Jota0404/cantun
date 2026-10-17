-- CANTUM — B8 fatia 7: export_my_data devolve só dados do titular (N1, RN-08).
\set ON_ERROR_STOP on
\o /dev/null
begin;

create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('app.user_id', coalesce(p_id, ''), true) $$;

create function pg_temp.ok(p_condition boolean, p_label text) returns void language plpgsql
as $$ begin if not coalesce(p_condition, false) then raise exception 'falhou: %', p_label; end if; end $$;

insert into app.users (id, email, display_name) values
  ('00000000-0000-0000-0000-000000000b01', 'ana@x.local', 'Ana'),
  ('00000000-0000-0000-0000-000000000b02', 'bruno@x.local', 'Bruno');
select pg_temp.as_user('00000000-0000-0000-0000-000000000b01');
select public.create_organization('10000000-0000-0000-0000-000000000b01', 'Ministério X');
insert into public.songs (user_id, id, title, original_key, current_key, lyrics, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000b01', '41000000-0000-0000-0000-000000000b01', 'Da Ana', 'C', 'C', '[C]a', now(), now()),
         ('00000000-0000-0000-0000-000000000b02', '41000000-0000-0000-0000-000000000b02', 'Do Bruno', 'D', 'D', '[D]b', now(), now());
insert into public.repertoires (id, name, created_by_user_id) values ('51000000-0000-0000-0000-000000000b02', 'Rep Bruno', '00000000-0000-0000-0000-000000000b02');

set local role cantum_user;

-- N1: anônimo é negado.
select pg_temp.as_user(null);
do $$ begin
  begin perform public.export_my_data(); exception when others then
    if sqlerrm = 'authentication required' then return; end if; raise;
  end;
  raise exception 'deveria falhar: anônimo exporta';
end $$;

-- Isolamento: a exportação da Ana não contém nada do Bruno nem segredos.
select pg_temp.as_user('00000000-0000-0000-0000-000000000b01');
create temp table pg_temp.ana_export as select public.export_my_data() as j;
grant select on pg_temp.ana_export to public;
select pg_temp.ok((select j->'profile'->>'email' = 'ana@x.local' from pg_temp.ana_export), 'perfil da Ana');
select pg_temp.ok((select jsonb_array_length(j->'personal_songs') = 1 and j->'personal_songs'->0->>'title' = 'Da Ana' from pg_temp.ana_export), 'só a música da Ana');
select pg_temp.ok((select jsonb_array_length(j->'organization_memberships') = 1 from pg_temp.ana_export), 'vínculo da Ana');
select pg_temp.ok((select jsonb_array_length(j->'personal_repertoires') = 0 from pg_temp.ana_export), 'sem repertório do Bruno');
select pg_temp.ok((select j::text not like '%bruno%' and j::text not like '%Bruno%' and j::text not like '%password%' from pg_temp.ana_export), 'nada de outro usuário nem segredo');

-- Bruno vê o dele, sem nada da Ana.
select pg_temp.as_user('00000000-0000-0000-0000-000000000b02');
select pg_temp.ok((select public.export_my_data()::text not like '%ana@x.local%' and public.export_my_data()::text like '%Rep Bruno%'), 'Bruno só vê o próprio');
reset role;
rollback;
