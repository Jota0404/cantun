-- CANTUM — B2: papéis, status, permissões (docs/PERMISSIONS.md §5, N1–N18, com contrastes),
-- convites, nome de exibição e stage.run.
\set ON_ERROR_STOP on
\o /dev/null
begin;

-- Helpers (invoker; rodam com o papel corrente)
create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('app.user_id', coalesce(p_id, ''), true) $$;

create function pg_temp.ok(p_condition boolean, p_label text) returns void language plpgsql
as $$ begin if not coalesce(p_condition, false) then raise exception 'falhou: %', p_label; end if; end $$;

-- Negado por RLS/privilégio/trigger (42501) ou por RPC (P0001, opcionalmente com a mensagem).
create function pg_temp.denied(p_sql text, p_label text, p_message text default null) returns void language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception
    when insufficient_privilege then return;
    when raise_exception then
      if p_message is null or sqlerrm = p_message then return; end if;
      raise exception '%: erro inesperado "%"', p_label, sqlerrm;
  end;
  raise exception 'deveria ser negado: %', p_label;
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

-- Fixtures (dono do schema: o trigger de guarda não se aplica)
-- o owner · a admin · l Líder de TA · m e m2 membros de TA · lb Líder de TB · i inactive em todas
-- li Líder inativo de TA · x outra organização · n sem vínculo · v e-mail não verificado · w verificado
insert into app.users (id, email, display_name, email_verified_at) values
  ('00000000-0000-0000-0000-000000000401', 'owner@b2.local', 'Olga', now()),
  ('00000000-0000-0000-0000-000000000402', 'admin@b2.local', 'Abel', now()),
  ('00000000-0000-0000-0000-000000000403', 'lider@b2.local', 'Lia', now()),
  ('00000000-0000-0000-0000-000000000404', 'membro@b2.local', 'Mauro', now()),
  ('00000000-0000-0000-0000-000000000405', 'membro2@b2.local', 'Mel', now()),
  ('00000000-0000-0000-0000-000000000406', 'liderb@b2.local', 'Lucas', now()),
  ('00000000-0000-0000-0000-000000000407', 'inativo@b2.local', 'Ivo', now()),
  ('00000000-0000-0000-0000-000000000408', 'liderinativo@b2.local', 'Lara', now()),
  ('00000000-0000-0000-0000-000000000409', 'outra@b2.local', 'Xena', now()),
  ('00000000-0000-0000-0000-00000000040a', 'semvinculo@b2.local', 'Nina', now()),
  ('00000000-0000-0000-0000-00000000040b', 'naoverificado@b2.local', 'Vera', null),
  ('00000000-0000-0000-0000-00000000040c', 'verificado@b2.local', 'Wil', now());

select pg_temp.as_user('00000000-0000-0000-0000-000000000401');
select public.create_organization('10000000-0000-0000-0000-000000000401', 'Igreja B2');
insert into public.teams (id, organization_id, name) values
  ('30000000-0000-0000-0000-000000000401', '10000000-0000-0000-0000-000000000401', 'TA'),
  ('30000000-0000-0000-0000-000000000402', '10000000-0000-0000-0000-000000000401', 'TB');
select pg_temp.as_user('00000000-0000-0000-0000-000000000409');
select public.create_organization('10000000-0000-0000-0000-000000000402', 'Outra igreja');
insert into public.teams (id, organization_id, name) values
  ('30000000-0000-0000-0000-000000000409', '10000000-0000-0000-0000-000000000402', 'TX');
select pg_temp.as_user(null);

insert into public.organization_memberships (organization_id, user_id, role)
select '10000000-0000-0000-0000-000000000401', u, r from (values
  ('00000000-0000-0000-0000-000000000402'::uuid, 'admin'),
  ('00000000-0000-0000-0000-000000000403', 'member'), ('00000000-0000-0000-0000-000000000404', 'member'),
  ('00000000-0000-0000-0000-000000000405', 'member'), ('00000000-0000-0000-0000-000000000406', 'member'),
  ('00000000-0000-0000-0000-000000000407', 'member'), ('00000000-0000-0000-0000-000000000408', 'member')) v(u, r);

insert into public.team_memberships (id, team_id, user_id, role, status) values
  ('31000000-0000-0000-0000-000000000403', '30000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000403', 'leader', 'active'),
  ('31000000-0000-0000-0000-000000000404', '30000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000404', 'member', 'active'),
  ('31000000-0000-0000-0000-000000000405', '30000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000405', 'member', 'active'),
  ('31000000-0000-0000-0000-000000000407', '30000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000407', 'member', 'inactive'),
  ('31000000-0000-0000-0000-000000000408', '30000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000408', 'leader', 'inactive'),
  ('31000000-0000-0000-0000-000000000406', '30000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000406', 'leader', 'active'),
  ('31000000-0000-0000-0000-000000000415', '30000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000405', 'member', 'active');
insert into public.team_musical_functions (team_membership_id, musical_function) values
  ('31000000-0000-0000-0000-000000000405', 'bass'), ('31000000-0000-0000-0000-000000000407', 'drums');

insert into public.songs (user_id, id, title, original_key, current_key, lyrics, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000404', '40000000-0000-0000-0000-000000000404', 'Do Mauro', 'C', 'C', 'C', now(), now()),
  ('00000000-0000-0000-0000-000000000403', '40000000-0000-0000-0000-000000000403', 'Da Lia', 'D', 'D', 'D', now(), now()),
  ('00000000-0000-0000-0000-000000000407', '40000000-0000-0000-0000-000000000407', 'Do Ivo', 'E', 'E', 'E', now(), now()),
  ('00000000-0000-0000-0000-000000000404', '40000000-0000-0000-0000-000000000414', 'Do Mauro, nova', 'G', 'G', 'G', now(), now());
insert into public.organization_songs (organization_id, song_id) values
  ('10000000-0000-0000-0000-000000000401', '40000000-0000-0000-0000-000000000404'),
  ('10000000-0000-0000-0000-000000000401', '40000000-0000-0000-0000-000000000403');
insert into public.repertoires (id, organization_id, name, created_by_user_id) values
  ('50000000-0000-0000-0000-000000000404', '10000000-0000-0000-0000-000000000401', 'Do Mauro', '00000000-0000-0000-0000-000000000404'),
  ('50000000-0000-0000-0000-000000000401', '10000000-0000-0000-0000-000000000401', 'Da Olga', '00000000-0000-0000-0000-000000000401');
insert into public.services (id, organization_id, name, starts_at, created_by_user_id) values
  ('60000000-0000-0000-0000-000000000401', '10000000-0000-0000-0000-000000000401', 'Culto', now(), '00000000-0000-0000-0000-000000000401');
insert into public.service_items (service_id, song_id, position) values
  ('60000000-0000-0000-0000-000000000401', '40000000-0000-0000-0000-000000000404', 0);
select pg_temp.as_user('00000000-0000-0000-0000-000000000401');
select public.create_target_stage_session('60000000-0000-0000-0000-000000000401', '70000000-0000-0000-0000-000000000401');

-- RN-03: o criador (Owner) virou Líder de TA e TB pelo trigger.
select pg_temp.ok((select count(*) = 2 from public.team_memberships
  where user_id = '00000000-0000-0000-0000-000000000401' and role = 'leader' and status = 'active'), 'criador vira leader');

set local role cantum_user;

-- ---------------------------------------------------------------------------
-- Contrastes positivos
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-000000000403'); -- Líder de TA
select pg_temp.affects($q$update public.teams set name = 'TA renomeada' where id = '30000000-0000-0000-0000-000000000401'$q$, 1, 'Líder renomeia a própria equipe');
insert into public.team_memberships (team_id, user_id) values ('30000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000406');
select public.set_team_member_status('31000000-0000-0000-0000-000000000404', 'inactive');
select public.set_team_member_status('31000000-0000-0000-0000-000000000404', 'active');
select pg_temp.ok((select array_agg(musical_function) = array['keys', 'vocals'] from public.set_team_member_functions('31000000-0000-0000-0000-000000000404', array['vocals', 'keys'])), 'Líder define funções de membro');
select pg_temp.affects($q$update public.songs set title = 'Editada pela Lia' where id = '40000000-0000-0000-0000-000000000404'$q$, 1, 'Líder edita música de outro');
select pg_temp.affects($q$update public.repertoires set name = 'Editado pela Lia' where id = '50000000-0000-0000-0000-000000000404'$q$, 1, 'Líder edita repertório de outro');

select pg_temp.as_user('00000000-0000-0000-0000-000000000404'); -- Membro
select pg_temp.ok((select array_agg(musical_function) = array['bass'] from public.set_my_team_musical_functions('30000000-0000-0000-0000-000000000401', array['bass'])), 'Membro define as próprias funções');
select pg_temp.affects($q$update public.songs set title = 'Minha' where id = '40000000-0000-0000-0000-000000000404'$q$, 1, 'Membro edita a própria música');
insert into public.organization_songs (organization_id, song_id) values ('10000000-0000-0000-0000-000000000401', '40000000-0000-0000-0000-000000000414');
insert into public.repertoires (id, organization_id, name, created_by_user_id)
  values ('50000000-0000-0000-0000-000000000414', '10000000-0000-0000-0000-000000000401', 'Novo do Mauro', '00000000-0000-0000-0000-000000000404');
insert into public.repertoire_items (repertoire_id, song_id, position)
  values ('50000000-0000-0000-0000-000000000414', '40000000-0000-0000-0000-000000000404', 0);
select pg_temp.ok((select count(*) = 1 from public.team_musical_functions where team_membership_id = '31000000-0000-0000-0000-000000000405'), 'Membro lê funções da equipe');
select pg_temp.ok(app.can_subscribe_stage_session('70000000-0000-0000-0000-000000000401'), 'Membro ativo assina o Stage');
select pg_temp.ok((select public.get_target_stage_snapshot('70000000-0000-0000-0000-000000000401') is not null), 'Membro ativo lê snapshot');
select pg_temp.ok((select (public.get_service_stage_session('70000000-0000-0000-0000-000000000401')).id is not null), 'Membro ativo lê a sessão');
select pg_temp.ok((select count(*) = 1 from public.get_service_stage_songs('70000000-0000-0000-0000-000000000401')), 'Membro ativo lê músicas do Stage');
select pg_temp.affects($q$delete from public.repertoires where id = '50000000-0000-0000-0000-000000000414'$q$, 1, 'Membro exclui o próprio repertório');

select pg_temp.as_user('00000000-0000-0000-0000-000000000401'); -- Owner
select public.set_team_member_role('31000000-0000-0000-0000-000000000404', 'leader');
select public.set_team_member_role('31000000-0000-0000-0000-000000000404', 'member');
select pg_temp.ok(app.has_permission('10000000-0000-0000-0000-000000000401', null, 'organization.delete'), 'Owner exclui a organização');

select pg_temp.as_user('00000000-0000-0000-0000-000000000402'); -- Admin
select pg_temp.affects($q$update public.organizations set name = 'Renomeada pelo Admin' where id = '10000000-0000-0000-0000-000000000401'$q$, 1, 'Admin renomeia a organização');
select public.set_team_member_status('31000000-0000-0000-0000-000000000408', 'active');
select public.set_team_member_status('31000000-0000-0000-0000-000000000408', 'inactive');
select public.set_team_member_role('31000000-0000-0000-0000-000000000405', 'leader');
select public.set_team_member_role('31000000-0000-0000-0000-000000000405', 'member');
select public.set_team_member_functions('31000000-0000-0000-0000-000000000407', array['drums', 'piano']);

-- ---------------------------------------------------------------------------
-- N1 — Líder de TA na equipe TB
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-000000000403');
select pg_temp.affects($q$update public.teams set name = 'Invadida' where id = '30000000-0000-0000-0000-000000000402'$q$, 0, 'N1 renomear TB');
select pg_temp.denied($q$insert into public.team_memberships (team_id, user_id) values ('30000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000404')$q$, 'N1 adicionar em TB');
select pg_temp.denied($q$select public.set_team_member_status('31000000-0000-0000-0000-000000000415', 'inactive')$q$, 'N1 inativar em TB', 'not authorized to change team member status');
select pg_temp.denied($q$select public.set_team_member_functions('31000000-0000-0000-0000-000000000415', array['keys'])$q$, 'N1 funções em TB', 'not authorized to change musical functions');
select pg_temp.denied($q$insert into public.team_musical_functions (team_membership_id, musical_function) values ('31000000-0000-0000-0000-000000000415', 'keys')$q$, 'N1 funções em TB por escrita direta');

-- N2 — Líder promove ou rebaixa
select pg_temp.denied($q$select public.set_team_member_role('31000000-0000-0000-0000-000000000404', 'leader')$q$, 'N2 promover', 'not authorized to change team role');
select pg_temp.denied($q$select public.set_team_member_role('31000000-0000-0000-0000-000000000408', 'member')$q$, 'N2 rebaixar', 'not authorized to change team role');

-- N3 — Líder inativa/reativa outro Líder ou a si mesmo
select pg_temp.denied($q$select public.set_team_member_status('31000000-0000-0000-0000-000000000408', 'active')$q$, 'N3 reativar Líder', 'not authorized to change team member status');
select pg_temp.denied($q$select public.set_team_member_status('31000000-0000-0000-0000-000000000403', 'inactive')$q$, 'N3 a si mesmo', 'not authorized to change team member status');

-- N5 — Líder sobre membro inactive: só reativar
select pg_temp.denied($q$select public.set_team_member_functions('31000000-0000-0000-0000-000000000407', array['bass'])$q$, 'N5 funções de inactive', 'not authorized to change musical functions');
select pg_temp.denied($q$select public.set_team_member_role('31000000-0000-0000-0000-000000000407', 'leader')$q$, 'N5 papel de inactive', 'not authorized to change team role');
select public.set_team_member_status('31000000-0000-0000-0000-000000000407', 'active');
select public.set_team_member_status('31000000-0000-0000-0000-000000000407', 'inactive');

-- N7 (Líder) — edita, mas não exclui o que é de outra pessoa
select pg_temp.affects($q$delete from public.songs where id = '40000000-0000-0000-0000-000000000404'$q$, 0, 'N7 Líder exclui música de outro');
select pg_temp.affects($q$delete from public.repertoires where id = '50000000-0000-0000-0000-000000000404'$q$, 0, 'N7 Líder exclui repertório de outro');
select pg_temp.denied($q$update public.songs set user_id = '00000000-0000-0000-0000-000000000403' where id = '40000000-0000-0000-0000-000000000404'$q$, 'Líder se apropria da música');
select pg_temp.denied($q$update public.repertoires set created_by_user_id = '00000000-0000-0000-0000-000000000403' where id = '50000000-0000-0000-0000-000000000404'$q$, 'Líder se apropria do repertório');

-- N13 — Líder cria equipe
select pg_temp.denied($q$insert into public.teams (id, organization_id, name) values ('30000000-0000-0000-0000-000000000413', '10000000-0000-0000-0000-000000000401', 'Nova')$q$, 'N13 Líder cria equipe');

-- N4 — Líder inativo
select pg_temp.as_user('00000000-0000-0000-0000-000000000408');
select pg_temp.affects($q$update public.teams set name = 'Pelo inativo' where id = '30000000-0000-0000-0000-000000000401'$q$, 0, 'N4 renomear');
select pg_temp.denied($q$select public.set_team_member_status('31000000-0000-0000-0000-000000000404', 'inactive')$q$, 'N4 inativar', 'not authorized to change team member status');
select pg_temp.denied($q$select public.set_team_member_functions('31000000-0000-0000-0000-000000000404', array['bass'])$q$, 'N4 funções', 'not authorized to change musical functions');
select pg_temp.denied($q$insert into public.team_memberships (team_id, user_id) values ('30000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000402')$q$, 'N4 adicionar');
select pg_temp.affects($q$update public.songs set title = 'Pelo inativo' where id = '40000000-0000-0000-0000-000000000404'$q$, 0, 'N4 editar música de outro');

-- N6, N7 (Membro), N13 (Membro)
select pg_temp.as_user('00000000-0000-0000-0000-000000000404');
select pg_temp.denied($q$select public.set_team_member_functions('31000000-0000-0000-0000-000000000405', array['keys'])$q$, 'N6 RPC', 'not authorized to change musical functions');
select pg_temp.denied($q$insert into public.team_musical_functions (team_membership_id, musical_function) values ('31000000-0000-0000-0000-000000000405', 'keys')$q$, 'N6 insert');
select pg_temp.affects($q$delete from public.team_musical_functions where team_membership_id = '31000000-0000-0000-0000-000000000405'$q$, 0, 'N6 delete');
select pg_temp.affects($q$update public.songs set title = 'Invadida' where id = '40000000-0000-0000-0000-000000000403'$q$, 0, 'N7 Membro edita música de outro');
select pg_temp.affects($q$delete from public.songs where id = '40000000-0000-0000-0000-000000000403'$q$, 0, 'N7 Membro exclui música de outro');
select pg_temp.affects($q$update public.repertoires set name = 'Invadido' where id = '50000000-0000-0000-0000-000000000401'$q$, 0, 'N7 Membro edita repertório de outro');
select pg_temp.affects($q$delete from public.repertoires where id = '50000000-0000-0000-0000-000000000401'$q$, 0, 'N7 Membro exclui repertório de outro');
select pg_temp.denied($q$insert into public.repertoire_items (repertoire_id, song_id, position) values ('50000000-0000-0000-0000-000000000401', '40000000-0000-0000-0000-000000000404', 9)$q$, 'N7 Membro altera itens de repertório de outro');
select pg_temp.affects($q$delete from public.organization_songs where song_id = '40000000-0000-0000-0000-000000000403'$q$, 0, 'N7 Membro desvincula música de outro');
select pg_temp.denied($q$insert into public.teams (id, organization_id, name) values ('30000000-0000-0000-0000-000000000413', '10000000-0000-0000-0000-000000000401', 'Nova')$q$, 'N13 Membro cria equipe');
select pg_temp.affects($q$update public.organizations set name = 'Pelo membro'$q$, 0, 'Membro renomeia organização');

-- N8 — outra organização
select pg_temp.as_user('00000000-0000-0000-0000-000000000409');
select pg_temp.ok((select count(*) = 0 from public.teams where organization_id = '10000000-0000-0000-0000-000000000401'), 'N8 lê equipes');
select pg_temp.ok((select count(*) = 0 from public.songs), 'N8 lê músicas');
select pg_temp.ok((select count(*) = 0 from public.repertoires), 'N8 lê repertórios');
select pg_temp.ok((select count(*) = 0 from public.team_musical_functions), 'N8 lê funções');
select pg_temp.denied($q$insert into public.repertoires (organization_id, name, created_by_user_id) values ('10000000-0000-0000-0000-000000000401', 'Intruso', '00000000-0000-0000-0000-000000000409')$q$, 'N8 cria repertório');
select pg_temp.affects($q$update public.songs set title = 'Intrusa' where id = '40000000-0000-0000-0000-000000000404'$q$, 0, 'N8 edita música');
select pg_temp.denied($q$insert into public.team_memberships (team_id, user_id) values ('30000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000409')$q$, 'N8 entra em equipe');
select pg_temp.ok(not app.has_permission('10000000-0000-0000-0000-000000000401', null, 'stage.run'), 'N8 stage.run');
select pg_temp.ok((select count(*) = 0 from public.get_organization_member_profiles('10000000-0000-0000-0000-000000000401')), 'N8 perfis');
-- Equipe de outra organização (TX) só aceita membro dessa organização.
select pg_temp.denied($q$insert into public.team_memberships (team_id, user_id) values ('30000000-0000-0000-0000-000000000409', '00000000-0000-0000-0000-000000000404')$q$, 'Owner adiciona quem não é da organização');

-- N9 — sem vínculo
select pg_temp.as_user('00000000-0000-0000-0000-00000000040a');
select pg_temp.ok(not app.has_permission('10000000-0000-0000-0000-000000000401', null, 'song.create'), 'N9 song.create');
select pg_temp.ok(not app.has_permission('10000000-0000-0000-0000-000000000401', '30000000-0000-0000-0000-000000000401', 'team_member.set_own_functions'), 'N9 equipe');
select pg_temp.ok((select count(*) = 0 from public.teams), 'N9 lê equipes');
select pg_temp.denied($q$insert into public.repertoires (organization_id, name, created_by_user_id) values ('10000000-0000-0000-0000-000000000401', 'Sem vínculo', '00000000-0000-0000-0000-00000000040a')$q$, 'N9 cria repertório');
select pg_temp.denied($q$select public.set_team_member_functions('31000000-0000-0000-0000-000000000404', array['bass'])$q$, 'N9 funções', 'not authorized to change musical functions');
select pg_temp.ok(not app.can_subscribe_stage_session('70000000-0000-0000-0000-000000000401'), 'N9 Stage');

-- N10 — anônimo
select pg_temp.as_user(null);
select pg_temp.ok(not app.has_permission('10000000-0000-0000-0000-000000000401', null, 'stage.run'), 'N10 has_permission');
select pg_temp.ok((select count(*) = 0 from public.get_organization_member_profiles('10000000-0000-0000-0000-000000000401')), 'N10 perfis');
select pg_temp.denied($q$select public.set_team_member_role('31000000-0000-0000-0000-000000000404', 'leader')$q$, 'N10 RPC', 'authentication required');
select pg_temp.denied($q$select public.set_my_display_name('Anônimo')$q$, 'N10 nome', 'authentication required');
reset role;
set local role cantum_anon;
select pg_temp.denied($q$select 1 from public.teams$q$, 'N10 cantum_anon lê equipes');
select pg_temp.denied($q$select app.has_permission('10000000-0000-0000-0000-000000000401', null, 'stage.run')$q$, 'N10 cantum_anon executa has_permission');
select pg_temp.denied($q$select public.get_organization_member_profiles('10000000-0000-0000-0000-000000000401')$q$, 'N10 cantum_anon perfis');
reset role;
set local role cantum_user;

-- N11 — inactive em todas as equipes
select pg_temp.as_user('00000000-0000-0000-0000-000000000407');
select pg_temp.denied($q$insert into public.organization_songs (organization_id, song_id) values ('10000000-0000-0000-0000-000000000401', '40000000-0000-0000-0000-000000000407')$q$, 'N11 cria música na organização');
select pg_temp.denied($q$insert into public.repertoires (organization_id, name, created_by_user_id) values ('10000000-0000-0000-0000-000000000401', 'Inativo', '00000000-0000-0000-0000-000000000407')$q$, 'N11 cria repertório');
select pg_temp.ok(not app.can_subscribe_stage_session('70000000-0000-0000-0000-000000000401'), 'N11 assina o Stage');
select pg_temp.denied($q$select public.get_target_stage_snapshot('70000000-0000-0000-0000-000000000401')$q$, 'N11 snapshot', 'stage session not found or not authorized');
select pg_temp.ok((select (public.get_service_stage_session('70000000-0000-0000-0000-000000000401')).id is null), 'N11 sessão');
select pg_temp.ok((select count(*) = 0 from public.get_service_stage_songs('70000000-0000-0000-0000-000000000401')), 'N11 músicas do Stage');
select pg_temp.denied($q$select public.set_my_team_musical_functions('30000000-0000-0000-0000-000000000401', array['bass'])$q$, 'N11 próprias funções', 'not authorized to change musical functions');

-- N12 — Admin exclui a organização
select pg_temp.as_user('00000000-0000-0000-0000-000000000402');
select pg_temp.affects($q$delete from public.organizations where id = '10000000-0000-0000-0000-000000000401'$q$, 0, 'N12');

-- N14 — negação por padrão
select pg_temp.as_user('00000000-0000-0000-0000-000000000401');
select pg_temp.ok(not app.has_permission('10000000-0000-0000-0000-000000000401', null, 'team.destroy_everything'), 'N14 capacidade desconhecida');
select pg_temp.ok(not app.has_permission('10000000-0000-0000-0000-000000000401', '30000000-0000-0000-0000-000000000409', 'team.rename'), 'N14 equipe de outra organização');
select pg_temp.ok(not app.has_permission('10000000-0000-0000-0000-000000000401', '30000000-0000-0000-0000-000000000409', 'song.create'), 'N14 equipe de outra organização (escopo organização)');
select pg_temp.ok(not app.has_permission('10000000-0000-0000-0000-000000000401', null, 'team.rename'), 'N14 equipe nula');
select pg_temp.ok(not app.has_permission(null, null, 'stage.run'), 'N14 organização nula');

-- N15, N16, N18 — escrita direta de role/status (privilégio de coluna)
select pg_temp.as_user('00000000-0000-0000-0000-000000000404');
select pg_temp.denied($q$update public.team_memberships set role = 'leader' where id = '31000000-0000-0000-0000-000000000404'$q$, 'N15 Membro se promove');
select pg_temp.denied($q$insert into public.team_memberships (id, team_id, user_id, role, status) values ('31000000-0000-0000-0000-000000000404', '30000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000404', 'leader', 'active') on conflict (id) do update set role = excluded.role$q$, 'N15 upsert do sync');
select pg_temp.as_user('00000000-0000-0000-0000-000000000407');
select pg_temp.denied($q$update public.team_memberships set status = 'active' where id = '31000000-0000-0000-0000-000000000407'$q$, 'N15 reativar-se');
select pg_temp.as_user('00000000-0000-0000-0000-000000000403');
select pg_temp.denied($q$insert into public.team_memberships (team_id, user_id, role) values ('30000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000402', 'leader')$q$, 'N16 vínculo leader');
select pg_temp.denied($q$insert into public.team_memberships (team_id, user_id, status) values ('30000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000402', 'inactive')$q$, 'N16 vínculo inactive');
select pg_temp.denied($q$update public.team_memberships set role = 'member' where id = '31000000-0000-0000-0000-000000000408'$q$, 'N18 Líder');
select pg_temp.as_user('00000000-0000-0000-0000-000000000402');
select pg_temp.denied($q$update public.team_memberships set role = 'leader' where id = '31000000-0000-0000-0000-000000000404'$q$, 'N18 Admin');
select pg_temp.as_user('00000000-0000-0000-0000-000000000401');
select pg_temp.denied($q$update public.team_memberships set status = 'inactive' where id = '31000000-0000-0000-0000-000000000404'$q$, 'N18 Owner');

-- N17 — Owner cria equipe: o Líder vem do trigger; inserir o próprio leader é negado.
insert into public.teams (id, organization_id, name) values ('30000000-0000-0000-0000-000000000413', '10000000-0000-0000-0000-000000000401', 'Nova do Owner');
select pg_temp.ok((select role = 'leader' and status = 'active' from public.team_memberships
  where team_id = '30000000-0000-0000-0000-000000000413' and user_id = app.current_user_id()), 'N17 trigger cria o leader');
select pg_temp.denied($q$insert into public.team_memberships (team_id, user_id, role) values ('30000000-0000-0000-0000-000000000413', '00000000-0000-0000-0000-000000000402', 'leader')$q$, 'N17 leader por escrita direta');

-- N15–N18 sem o reforço de coluna: o trigger de guarda barra sozinho.
reset role;
grant insert (role, status), update (role, status) on public.team_memberships to cantum_user;
set local role cantum_user;
-- Líder passa pela RLS de update (team_member.add); quem barra é o trigger.
select pg_temp.as_user('00000000-0000-0000-0000-000000000403');
select pg_temp.denied($q$update public.team_memberships set role = 'leader' where id = '31000000-0000-0000-0000-000000000404'$q$, 'N18 trigger Líder promove');
select pg_temp.denied($q$update public.team_memberships set status = 'active' where id = '31000000-0000-0000-0000-000000000407'$q$, 'N15 trigger reativa');
select pg_temp.as_user('00000000-0000-0000-0000-000000000401');
select pg_temp.denied($q$update public.team_memberships set status = 'inactive' where id = '31000000-0000-0000-0000-000000000404'$q$, 'N18 trigger Owner');
select pg_temp.denied($q$insert into public.team_memberships (team_id, user_id, role) values ('30000000-0000-0000-0000-000000000413', '00000000-0000-0000-0000-000000000402', 'leader')$q$, 'N16/N17 trigger insert leader');
select pg_temp.denied($q$update public.team_memberships set team_id = '30000000-0000-0000-0000-000000000402' where id = '31000000-0000-0000-0000-000000000404'$q$, 'trigger move vínculo');
reset role;
revoke insert (role, status), update (role, status) on public.team_memberships from cantum_user;
set local role cantum_user;

-- ---------------------------------------------------------------------------
-- Convites (RN-14)
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-000000000401');
select pg_temp.denied($q$select public.create_organization_invite('10000000-0000-0000-0000-000000000401', '30000000-0000-0000-0000-000000000401', 'admin', null, 168)$q$, 'convite admin sem e-mail', 'invite without email can only grant member');
create temp table invites on commit drop as
select 'v' as who, token from public.create_organization_invite('10000000-0000-0000-0000-000000000401', '30000000-0000-0000-0000-000000000401', 'member', 'NaoVerificado@b2.local', 168)
union all
select 'w', token from public.create_organization_invite('10000000-0000-0000-0000-000000000401', '30000000-0000-0000-0000-000000000401', 'admin', 'verificado@b2.local', 168)
union all
select 'link', token from public.create_organization_invite('10000000-0000-0000-0000-000000000401', '30000000-0000-0000-0000-000000000402', 'member', null, 168);

select pg_temp.as_user('00000000-0000-0000-0000-000000000403');
select pg_temp.ok((select count(*) = 2 from public.organization_invites), 'Líder de TA lista só os convites de TA');
select pg_temp.as_user('00000000-0000-0000-0000-000000000404');
select pg_temp.ok((select count(*) = 0 from public.organization_invites), 'Membro não lista convites');

select pg_temp.as_user('00000000-0000-0000-0000-00000000040b');
select pg_temp.denied($q$select public.accept_organization_invite((select token from invites where who = 'v'))$q$, 'aceite sem e-mail verificado', 'invite requires verified email');
select pg_temp.as_user('00000000-0000-0000-0000-00000000040c');
select pg_temp.denied($q$select public.accept_organization_invite((select token from invites where who = 'v'))$q$, 'aceite com outro e-mail', 'invite is restricted to another email');
select pg_temp.ok((select role = 'admin' from public.accept_organization_invite((select token from invites where who = 'w'))), 'aceite verificado e igual');
select pg_temp.ok((select role = 'member' and status = 'active' from public.team_memberships where user_id = app.current_user_id()), 'aceite cria vínculo member/active');
select pg_temp.as_user('00000000-0000-0000-0000-00000000040b');
select pg_temp.ok((select role = 'member' from public.accept_organization_invite((select token from invites where who = 'link'))), 'convite por link sem e-mail verificado concede member');

-- ---------------------------------------------------------------------------
-- Nome de exibição (RN-15)
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-000000000404');
select pg_temp.ok(public.set_my_display_name('  Mauro Silva  ') = 'Mauro Silva', 'define o próprio nome');
select pg_temp.denied($q$select public.set_my_display_name('   ')$q$, 'nome vazio', 'display name must have 1 to 80 characters');
select pg_temp.denied($q$select public.set_my_display_name(repeat('x', 81))$q$, 'nome > 80', 'display name must have 1 to 80 characters');
select pg_temp.ok((select display_name = 'Mauro Silva' from public.get_organization_member_profiles('10000000-0000-0000-0000-000000000401')
  where user_id = '00000000-0000-0000-0000-000000000404'), 'perfil mostra o nome novo');
select pg_temp.ok((select display_name = 'Mel' from public.get_organization_member_profiles('10000000-0000-0000-0000-000000000401')
  where user_id = '00000000-0000-0000-0000-000000000405'), 'nome dos outros intacto');
reset role;
select pg_temp.ok((select count(*) = 1 from app.users where display_name = 'Mauro Silva'), 'só a própria linha mudou');
select pg_temp.ok((select pg_get_function_result(p.oid) = 'TABLE(user_id uuid, display_name text)'
  from pg_proc p where p.proname = 'get_organization_member_profiles'), 'perfil devolve só user_id e display_name');

-- ---------------------------------------------------------------------------
-- Admin exclui conteúdo de outra pessoa (por último: apaga dados)
-- ---------------------------------------------------------------------------
set local role cantum_user;
select pg_temp.as_user('00000000-0000-0000-0000-000000000402');
select pg_temp.affects($q$delete from public.repertoires where id = '50000000-0000-0000-0000-000000000404'$q$, 1, 'Admin exclui repertório de outro');
select pg_temp.affects($q$delete from public.songs where id = '40000000-0000-0000-0000-000000000403'$q$, 1, 'Admin exclui música de outro');

-- Música vinculada a duas organizações: terceiros não editam (salvaguarda 2).
reset role;
insert into public.organization_songs (organization_id, song_id) values ('10000000-0000-0000-0000-000000000402', '40000000-0000-0000-0000-000000000414');
set local role cantum_user;
select pg_temp.as_user('00000000-0000-0000-0000-000000000402');
select pg_temp.affects($q$update public.songs set title = 'Admin' where id = '40000000-0000-0000-0000-000000000414'$q$, 0, 'música em duas organizações');

reset role;
rollback;
