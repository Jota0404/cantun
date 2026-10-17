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

-- Bruno na MESMA organização e equipe da Ana, com escala e disponibilidade próprias.
insert into public.organization_memberships (organization_id, user_id, role) values ('10000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-000000000b02', 'member');
insert into public.teams (id, organization_id, name) values ('30000000-0000-0000-0000-000000000b01', '10000000-0000-0000-0000-000000000b01', 'Banda X');
insert into public.team_memberships (team_id, user_id) values ('30000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-000000000b02');
insert into public.team_musical_functions (team_membership_id, musical_function)
  select id, case user_id when '00000000-0000-0000-0000-000000000b01' then 'vocals' else 'drums' end
  from public.team_memberships where team_id = '30000000-0000-0000-0000-000000000b01';
insert into public.services (id, organization_id, team_id, name, starts_at, created_by_user_id)
  values ('60000000-0000-0000-0000-000000000b01', '10000000-0000-0000-0000-000000000b01', '30000000-0000-0000-0000-000000000b01', 'Culto X', now() + interval '1 day', '00000000-0000-0000-0000-000000000b01');
insert into public.service_positions (id, service_id, musical_function, quantity) values
  ('70000000-0000-0000-0000-000000000b01', '60000000-0000-0000-0000-000000000b01', 'vocals', 1),
  ('70000000-0000-0000-0000-000000000b02', '60000000-0000-0000-0000-000000000b01', 'drums', 1);
insert into public.assignments (position_id, user_id, status) values
  ('70000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-000000000b01', 'invited'),
  ('70000000-0000-0000-0000-000000000b02', '00000000-0000-0000-0000-000000000b02', 'confirmed');
insert into public.member_availability (user_id, organization_id, date, status, note) values
  ('00000000-0000-0000-0000-000000000b01', '10000000-0000-0000-0000-000000000b01', current_date + 1, 'available', 'nota da Ana'),
  ('00000000-0000-0000-0000-000000000b02', '10000000-0000-0000-0000-000000000b01', current_date + 1, 'unavailable', 'nota do Bruno');
-- Cópia do Ministério de autoria da Ana: conteúdo da organização, fica fora.
insert into public.songs (user_id, id, organization_id, source_song_id, title, original_key, current_key, lyrics, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000b01', '41000000-0000-0000-0000-000000000b03', '10000000-0000-0000-0000-000000000b01', '41000000-0000-0000-0000-000000000b01', 'Cópia Ministério', 'C', 'C', '[C]a', now(), now());

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
select pg_temp.ok((select j::text not like '%00000000-0000-0000-0000-000000000b02%' and j::text not like '%bruno@x.local%'
                          and j::text not like '%nota do Bruno%' and j::text not like '%password%' from pg_temp.ana_export), 'nada do Bruno (mesma organização) nem segredo');
select pg_temp.ok((select j::text not like '%Cópia Ministério%' from pg_temp.ana_export), 'cópia do Ministério fora');
select pg_temp.ok((select jsonb_array_length(j->'assignments') = 1 and j->'assignments'->0->>'musical_function' = 'vocals' and j->'assignments'->0->>'status' = 'invited' from pg_temp.ana_export), 'escala da Ana');
select pg_temp.ok((select jsonb_array_length(j->'availability') = 1 and j->'availability'->0->>'note' = 'nota da Ana' from pg_temp.ana_export), 'disponibilidade da Ana');
select pg_temp.ok((select jsonb_array_length(j->'team_memberships') = 1 and j->'team_memberships'->0->'musical_functions' = '["vocals"]'::jsonb from pg_temp.ana_export), 'equipe e funções da Ana');

-- Bruno vê o dele, sem nada da Ana.
select pg_temp.as_user('00000000-0000-0000-0000-000000000b02');
select pg_temp.ok((select public.export_my_data()::text not like '%ana@x.local%' and public.export_my_data()::text not like '%nota da Ana%' and public.export_my_data()::text like '%Rep Bruno%'), 'Bruno só vê o próprio');
reset role;
rollback;
