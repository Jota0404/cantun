-- CANTUM — B8 fatia 4: team_member.remove e admin_events (VS-07 RN-07, RN-09; N3–N7).
\set ON_ERROR_STOP on
\o /dev/null
begin;

create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('app.user_id', coalesce(p_id, ''), true) $$;

create function pg_temp.ok(p_condition boolean, p_label text) returns void language plpgsql
as $$ begin if not coalesce(p_condition, false) then raise exception 'falhou: %', p_label; end if; end $$;

create function pg_temp.denied(p_sql text, p_label text) returns void language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception
    when insufficient_privilege or raise_exception then return;
  end;
  raise exception 'deveria ser negado: %', p_label;
end $$;

do $$ begin
  execute format('grant usage on schema %s to cantum_user, cantum_anon', pg_my_temp_schema()::regnamespace);
end $$;

-- 01 owner · 02 admin · 03 Líder TA · 04 Líder TA · 05 membro TA · 06 membro TA · 07 Líder TB
-- 08 Líder inativo TA · 09 outra organização · 10 segundo admin
insert into app.users (id, email, display_name, email_verified_at) values
  ('00000000-0000-0000-0000-0000000b1101', 'owner@b8.local', 'Olga', now()),
  ('00000000-0000-0000-0000-0000000b1102', 'admin@b8.local', 'Abel', now()),
  ('00000000-0000-0000-0000-0000000b1103', 'lider@b8.local', 'Lia', now()),
  ('00000000-0000-0000-0000-0000000b1104', 'lider2@b8.local', 'Lis', now()),
  ('00000000-0000-0000-0000-0000000b1105', 'membro@b8.local', 'Mauro', now()),
  ('00000000-0000-0000-0000-0000000b1106', 'membro2@b8.local', 'Mel', now()),
  ('00000000-0000-0000-0000-0000000b1107', 'liderb@b8.local', 'Lucas', now()),
  ('00000000-0000-0000-0000-0000000b1108', 'liderinativo@b8.local', 'Lara', now()),
  ('00000000-0000-0000-0000-0000000b1109', 'outra@b8.local', 'Xena', now()),
  ('00000000-0000-0000-0000-0000000b1110', 'admin2@b8.local', 'Ana', now());

select pg_temp.as_user('00000000-0000-0000-0000-0000000b1101');
select public.create_organization('10000000-0000-0000-0000-000000000b11', 'Igreja B8');
insert into public.teams (id, organization_id, name) values
  ('30000000-0000-0000-0000-000000000b11', '10000000-0000-0000-0000-000000000b11', 'TA'),
  ('30000000-0000-0000-0000-000000000b12', '10000000-0000-0000-0000-000000000b11', 'TB');
select pg_temp.as_user('00000000-0000-0000-0000-0000000b1109');
select public.create_organization('10000000-0000-0000-0000-000000000b12', 'Outra igreja');
select pg_temp.as_user(null);

insert into public.organization_memberships (organization_id, user_id, role)
select '10000000-0000-0000-0000-000000000b11', u, r from (values
  ('00000000-0000-0000-0000-0000000b1102'::uuid, 'admin'), ('00000000-0000-0000-0000-0000000b1110', 'admin'), ('00000000-0000-0000-0000-0000000b1103', 'member'), ('00000000-0000-0000-0000-0000000b1104', 'member'), ('00000000-0000-0000-0000-0000000b1105', 'member'),
  ('00000000-0000-0000-0000-0000000b1106', 'member'), ('00000000-0000-0000-0000-0000000b1107', 'member'), ('00000000-0000-0000-0000-0000000b1108', 'member')) v(u, r);

insert into public.team_memberships (id, team_id, user_id, role, status) values
  ('31000000-0000-0000-0000-000000000b03', '30000000-0000-0000-0000-000000000b11', '00000000-0000-0000-0000-0000000b1103', 'leader', 'active'),
  ('31000000-0000-0000-0000-000000000b04', '30000000-0000-0000-0000-000000000b11', '00000000-0000-0000-0000-0000000b1104', 'leader', 'active'),
  ('31000000-0000-0000-0000-000000000b05', '30000000-0000-0000-0000-000000000b11', '00000000-0000-0000-0000-0000000b1105', 'member', 'active'),
  ('31000000-0000-0000-0000-000000000b06', '30000000-0000-0000-0000-000000000b11', '00000000-0000-0000-0000-0000000b1106', 'member', 'active'),
  ('31000000-0000-0000-0000-000000000b07', '30000000-0000-0000-0000-000000000b12', '00000000-0000-0000-0000-0000000b1107', 'leader', 'active'),
  ('31000000-0000-0000-0000-000000000b08', '30000000-0000-0000-0000-000000000b11', '00000000-0000-0000-0000-0000000b1108', 'leader', 'inactive'),
  ('31000000-0000-0000-0000-000000000b02', '30000000-0000-0000-0000-000000000b11', '00000000-0000-0000-0000-0000000b1102', 'member', 'active'),
  ('31000000-0000-0000-0000-000000000b15', '30000000-0000-0000-0000-000000000b12', '00000000-0000-0000-0000-0000000b1105', 'member', 'active');

-- Autoria (cópia do Ministério) e atribuições: 05 tem uma futura e uma passada em TA, e uma futura em TB.
insert into public.songs (user_id, id, organization_id, title, original_key, current_key, lyrics, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000b1105', '40000000-0000-0000-0000-000000000b05', '10000000-0000-0000-0000-000000000b11', 'Do Mauro', 'C', 'C', 'C', now(), now());
insert into public.services (id, organization_id, team_id, name, starts_at, created_by_user_id) values
  ('60000000-0000-0000-0000-000000000b01', '10000000-0000-0000-0000-000000000b11', '30000000-0000-0000-0000-000000000b11', 'Futuro TA', now() + interval '7 days', '00000000-0000-0000-0000-0000000b1101'),
  ('60000000-0000-0000-0000-000000000b02', '10000000-0000-0000-0000-000000000b11', '30000000-0000-0000-0000-000000000b11', 'Passado TA', now() - interval '7 days', '00000000-0000-0000-0000-0000000b1101'),
  ('60000000-0000-0000-0000-000000000b03', '10000000-0000-0000-0000-000000000b11', '30000000-0000-0000-0000-000000000b12', 'Futuro TB', now() + interval '7 days', '00000000-0000-0000-0000-0000000b1101');
insert into public.service_positions (id, service_id, musical_function, quantity) values
  ('61000000-0000-0000-0000-000000000b01', '60000000-0000-0000-0000-000000000b01', 'bass', 2),
  ('61000000-0000-0000-0000-000000000b02', '60000000-0000-0000-0000-000000000b02', 'bass', 2),
  ('61000000-0000-0000-0000-000000000b03', '60000000-0000-0000-0000-000000000b03', 'bass', 2);
insert into public.assignments (id, position_id, user_id, status) values
  ('62000000-0000-0000-0000-000000000b01', '61000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-0000000b1105', 'confirmed'),
  ('62000000-0000-0000-0000-000000000b02', '61000000-0000-0000-0000-000000000b02', '00000000-0000-0000-0000-0000000b1105', 'confirmed'),
  ('62000000-0000-0000-0000-000000000b03', '61000000-0000-0000-0000-000000000b03', '00000000-0000-0000-0000-0000000b1105', 'confirmed'),
  ('62000000-0000-0000-0000-000000000b04', '61000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-0000000b1106', 'confirmed');

set local role cantum_user;

-- Negativos (N3–N6)
select pg_temp.as_user('00000000-0000-0000-0000-0000000b1105'); -- membro comum
select pg_temp.denied($q$select public.team_member_remove('31000000-0000-0000-0000-000000000b06')$q$, 'N3 membro remove membro');
select pg_temp.as_user('00000000-0000-0000-0000-0000000b1103'); -- Líder de TA
select pg_temp.denied($q$select public.team_member_remove('31000000-0000-0000-0000-000000000b04')$q$, 'N6 Líder remove Líder');
select pg_temp.denied($q$select public.team_member_remove('31000000-0000-0000-0000-000000000b03')$q$, 'Líder remove a si mesmo');
select pg_temp.denied($q$select public.team_member_remove('31000000-0000-0000-0000-000000000b02')$q$, 'Líder remove Admin da organização');
select pg_temp.denied($q$select public.team_member_remove('31000000-0000-0000-0000-000000000b15')$q$, 'N4 Líder remove membro de outra equipe');
select pg_temp.as_user('00000000-0000-0000-0000-0000000b1107'); -- Líder de TB
select pg_temp.denied($q$select public.team_member_remove('31000000-0000-0000-0000-000000000b05')$q$, 'N4 Líder de TB remove membro de TA');
select pg_temp.as_user('00000000-0000-0000-0000-0000000b1108'); -- Líder inativo
select pg_temp.denied($q$select public.team_member_remove('31000000-0000-0000-0000-000000000b05')$q$, 'N5 Líder inativo remove');
select pg_temp.as_user('00000000-0000-0000-0000-0000000b1109'); -- outra organização
select pg_temp.denied($q$select public.team_member_remove('31000000-0000-0000-0000-000000000b05')$q$, 'N4 outra organização remove');
select pg_temp.as_user(null);
select pg_temp.denied($q$select public.team_member_remove('31000000-0000-0000-0000-000000000b05')$q$, 'anônimo remove');
select pg_temp.as_user('00000000-0000-0000-0000-0000000b1102'); -- Admin
select pg_temp.denied($q$select public.team_member_remove((select id from public.team_memberships where user_id = '00000000-0000-0000-0000-0000000b1101' and team_id = '30000000-0000-0000-0000-000000000b11'))$q$, 'N6 Admin remove Owner');
select pg_temp.ok((select count(*) = 8 from public.team_memberships where team_id in ('30000000-0000-0000-0000-000000000b11', '30000000-0000-0000-0000-000000000b12') and user_id <> '00000000-0000-0000-0000-0000000b1101'), 'negativos não alteraram vínculos');

-- Delete direto de vínculo não existe mais (nem Owner, Admin ou Líder)
select pg_temp.as_user('00000000-0000-0000-0000-0000000b1101');
select pg_temp.denied($q$delete from public.team_memberships where id = '31000000-0000-0000-0000-000000000b06'$q$, 'Owner deleta vínculo direto');
select pg_temp.as_user('00000000-0000-0000-0000-0000000b1102');
select pg_temp.denied($q$delete from public.team_memberships where id = '31000000-0000-0000-0000-000000000b06'$q$, 'Admin deleta vínculo direto');
select pg_temp.as_user('00000000-0000-0000-0000-0000000b1103');
select pg_temp.denied($q$delete from public.team_memberships where id = '31000000-0000-0000-0000-000000000b06'$q$, 'Líder deleta vínculo direto');
select pg_temp.as_user('00000000-0000-0000-0000-0000000b1102');

-- N9: sem escrita direta em admin_events
select pg_temp.denied($q$insert into public.admin_events (organization_id, action) values ('10000000-0000-0000-0000-000000000b11', 'team_member.remove')$q$, 'N9 insert direto');
select pg_temp.denied($q$delete from public.admin_events$q$, 'N9 delete direto');
select pg_temp.denied($q$update public.admin_events set action = 'team_member.remove'$q$, 'N9 update direto');

-- Positivos
select pg_temp.as_user('00000000-0000-0000-0000-0000000b1103'); -- Líder remove membro: vínculo e futuras saem; passada, outra equipe e autoria ficam
select public.team_member_remove('31000000-0000-0000-0000-000000000b05');
select pg_temp.ok(not exists (select 1 from public.team_memberships where id = '31000000-0000-0000-0000-000000000b05'), 'vínculo removido');
select pg_temp.ok(not exists (select 1 from public.assignments where id = '62000000-0000-0000-0000-000000000b01'), 'atribuição futura da equipe removida');
select pg_temp.ok(exists (select 1 from public.assignments where id = '62000000-0000-0000-0000-000000000b02'), 'atribuição passada mantida');
select pg_temp.ok(exists (select 1 from public.assignments where id = '62000000-0000-0000-0000-000000000b03'), 'atribuição de outra equipe mantida');
select pg_temp.ok(exists (select 1 from public.assignments where id = '62000000-0000-0000-0000-000000000b04'), 'atribuição de outro membro mantida');
select pg_temp.ok(exists (select 1 from public.team_memberships where id = '31000000-0000-0000-0000-000000000b15'), 'vínculo em outra equipe mantido');
select pg_temp.as_user('00000000-0000-0000-0000-0000000b1102'); -- Admin remove Líder
select public.team_member_remove('31000000-0000-0000-0000-000000000b04');
select pg_temp.as_user('00000000-0000-0000-0000-0000000b1101'); -- Owner remove Líder inativo
select public.team_member_remove('31000000-0000-0000-0000-000000000b08');

-- N7: leitura de admin_events
select pg_temp.ok((select count(*) = 3 from public.admin_events), 'Owner lê os 3 eventos');
select pg_temp.as_user('00000000-0000-0000-0000-0000000b1110');
select pg_temp.ok((select count(*) = 3 from public.admin_events), 'Admin lê os eventos');
select pg_temp.as_user('00000000-0000-0000-0000-0000000b1106'); -- membro
select pg_temp.ok((select count(*) = 0 from public.admin_events), 'N7 membro não lê');
select pg_temp.as_user('00000000-0000-0000-0000-0000000b1107'); -- Líder
select pg_temp.ok((select count(*) = 0 from public.admin_events), 'N7 Líder não lê');
select pg_temp.as_user('00000000-0000-0000-0000-0000000b1109'); -- Owner de outra organização
select pg_temp.ok((select count(*) = 0 from public.admin_events), 'N7 Owner de outra organização não lê');

reset role;
select pg_temp.ok((select count(*) = 1 from public.songs where id = '40000000-0000-0000-0000-000000000b05' and user_id = '00000000-0000-0000-0000-0000000b1105'), 'autoria mantida');
select pg_temp.ok(exists (select 1 from app.users where id = '00000000-0000-0000-0000-0000000b1105'), 'conta mantida');
select pg_temp.ok((select count(*) = 1 from public.admin_events where actor_user_id = '00000000-0000-0000-0000-0000000b1103' and target_user_id = '00000000-0000-0000-0000-0000000b1105' and action = 'team_member.remove'), 'evento registra ator e alvo');

rollback;
