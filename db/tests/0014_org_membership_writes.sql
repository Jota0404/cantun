-- CANTUM — issue #99: organization_memberships sem escrita direta (ADR-051, docs/PERMISSIONS.md).
-- Antes da 0014 um Admin promovia a si ou a outro para owner, e apagava ou rebaixava o Owner, direto na tabela.
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
    when insufficient_privilege or raise_exception or check_violation then return;
  end;
  raise exception 'deveria ser negado: %', p_label;
end $$;

do $$ begin
  execute format('grant usage on schema %s to cantum_user, cantum_anon', pg_my_temp_schema()::regnamespace);
end $$;

-- 01 owner · 02 admin · 03 segundo admin · 04 membro · 05 membro · 06 outra organização · 07 sem organização
insert into app.users (id, email, display_name, email_verified_at) values
  ('00000000-0000-0000-0000-0000000d1401', 'owner@d14.local', 'Olga', now()),
  ('00000000-0000-0000-0000-0000000d1402', 'admin@d14.local', 'Abel', now()),
  ('00000000-0000-0000-0000-0000000d1403', 'admin2@d14.local', 'Ana', now()),
  ('00000000-0000-0000-0000-0000000d1404', 'membro@d14.local', 'Mauro', now()),
  ('00000000-0000-0000-0000-0000000d1405', 'membro2@d14.local', 'Mel', now()),
  ('00000000-0000-0000-0000-0000000d1406', 'outra@d14.local', 'Xena', now()),
  ('00000000-0000-0000-0000-0000000d1407', 'solo@d14.local', 'Solo', now());

-- Criar organização (create_organization) cria o vínculo owner sem escrita direta.
set local role cantum_user;
select pg_temp.as_user('00000000-0000-0000-0000-0000000d1401');
select public.create_organization('10000000-0000-0000-0000-000000000d14', 'Igreja D14');
select pg_temp.as_user('00000000-0000-0000-0000-0000000d1406');
select public.create_organization('10000000-0000-0000-0000-000000000d15', 'Outra igreja');
select pg_temp.as_user('00000000-0000-0000-0000-0000000d1401');
insert into public.teams (id, organization_id, name) values
  ('30000000-0000-0000-0000-000000000d14', '10000000-0000-0000-0000-000000000d14', 'TA');
reset role;
select pg_temp.ok((select role = 'owner' from public.organization_memberships where organization_id = '10000000-0000-0000-0000-000000000d14' and user_id = '00000000-0000-0000-0000-0000000d1401'), 'create_organization cria o Owner');

insert into public.organization_memberships (id, organization_id, user_id, role) values
  ('20000000-0000-0000-0000-000000000d02', '10000000-0000-0000-0000-000000000d14', '00000000-0000-0000-0000-0000000d1402', 'admin'),
  ('20000000-0000-0000-0000-000000000d03', '10000000-0000-0000-0000-000000000d14', '00000000-0000-0000-0000-0000000d1403', 'admin'),
  ('20000000-0000-0000-0000-000000000d04', '10000000-0000-0000-0000-000000000d14', '00000000-0000-0000-0000-0000000d1404', 'member'),
  ('20000000-0000-0000-0000-000000000d05', '10000000-0000-0000-0000-000000000d14', '00000000-0000-0000-0000-0000000d1405', 'member');
create temp table owner_row as
  select id from public.organization_memberships where organization_id = '10000000-0000-0000-0000-000000000d14' and role = 'owner';
grant select on owner_row to cantum_user;
select pg_temp.as_user('00000000-0000-0000-0000-0000000d1401');
create temp table invite_token as
  select token from public.create_organization_invite('10000000-0000-0000-0000-000000000d14', '30000000-0000-0000-0000-000000000d14', 'member', null, 168);
grant select on invite_token to cantum_user;
select pg_temp.as_user(null);

set local role cantum_user;

-- Escrita direta é negada a todos, em qualquer papel (a RLS ALL de Owner/Admin e o grant caíram).
select pg_temp.as_user('00000000-0000-0000-0000-0000000d1402'); -- Admin
select pg_temp.denied($q$update public.organization_memberships set role = 'owner' where user_id = '00000000-0000-0000-0000-0000000d1402'$q$, 'Admin promove a si a owner');
select pg_temp.denied($q$update public.organization_memberships set role = 'owner' where id = '20000000-0000-0000-0000-000000000d04'$q$, 'Admin promove outro a owner');
select pg_temp.denied($q$update public.organization_memberships set role = 'admin' where id = '20000000-0000-0000-0000-000000000d04'$q$, 'Admin promove a admin direto');
select pg_temp.denied($q$update public.organization_memberships set role = 'member' where id = (select id from owner_row)$q$, 'Admin rebaixa o Owner');
select pg_temp.denied($q$delete from public.organization_memberships where id = (select id from owner_row)$q$, 'Admin apaga o vínculo do Owner');
select pg_temp.denied($q$delete from public.organization_memberships where id = '20000000-0000-0000-0000-000000000d04'$q$, 'Admin apaga membro direto');
select pg_temp.denied($q$insert into public.organization_memberships (organization_id, user_id, role) values ('10000000-0000-0000-0000-000000000d14', '00000000-0000-0000-0000-0000000d1407', 'owner')$q$, 'Admin insere owner');
select pg_temp.denied($q$insert into public.organization_memberships (organization_id, user_id, role) values ('10000000-0000-0000-0000-000000000d14', '00000000-0000-0000-0000-0000000d1407', 'member')$q$, 'Admin insere member');
select pg_temp.as_user('00000000-0000-0000-0000-0000000d1401'); -- Owner
select pg_temp.denied($q$update public.organization_memberships set role = 'admin' where id = '20000000-0000-0000-0000-000000000d04'$q$, 'Owner promove direto');
select pg_temp.denied($q$delete from public.organization_memberships where id = '20000000-0000-0000-0000-000000000d04'$q$, 'Owner apaga direto');
select pg_temp.denied($q$delete from public.organization_memberships where id = (select id from owner_row)$q$, 'Owner apaga o próprio vínculo direto');
select pg_temp.denied($q$insert into public.organization_memberships (organization_id, user_id, role) values ('10000000-0000-0000-0000-000000000d14', '00000000-0000-0000-0000-0000000d1407', 'member')$q$, 'Owner insere direto');
select pg_temp.as_user('00000000-0000-0000-0000-0000000d1404'); -- membro
select pg_temp.denied($q$update public.organization_memberships set role = 'owner' where user_id = '00000000-0000-0000-0000-0000000d1404'$q$, 'membro promove a si a owner');
select pg_temp.denied($q$delete from public.organization_memberships where user_id = '00000000-0000-0000-0000-0000000d1404'$q$, 'membro apaga o próprio vínculo direto');
select pg_temp.as_user('00000000-0000-0000-0000-0000000d1407'); -- sem organização
select pg_temp.denied($q$insert into public.organization_memberships (organization_id, user_id, role) values ('10000000-0000-0000-0000-000000000d14', '00000000-0000-0000-0000-0000000d1407', 'owner')$q$, 'forasteiro entra como owner');
select pg_temp.denied($q$insert into public.organization_memberships (organization_id, user_id, role) values ('10000000-0000-0000-0000-000000000d15', '00000000-0000-0000-0000-0000000d1407', 'member')$q$, 'forasteiro entra como member');
select pg_temp.as_user('00000000-0000-0000-0000-0000000d1406'); -- Owner de outra organização
select pg_temp.denied($q$update public.organization_memberships set role = 'member' where id = (select id from owner_row)$q$, 'Owner de outra organização rebaixa o Owner');
select pg_temp.as_user(null);
select pg_temp.denied($q$delete from public.organization_memberships$q$, 'anônimo apaga');
reset role;
select pg_temp.ok((select count(*) = 5 from public.organization_memberships where organization_id = '10000000-0000-0000-0000-000000000d14')
                  and (select count(*) = 1 from public.organization_memberships where organization_id = '10000000-0000-0000-0000-000000000d14' and role = 'owner')
                  and (select count(*) = 2 from public.organization_memberships where organization_id = '10000000-0000-0000-0000-000000000d14' and role = 'admin'), 'negativos não alteraram vínculos');

-- Leitura continua: membro enxerga os vínculos da própria organização, não os de outra.
set local role cantum_user;
select pg_temp.as_user('00000000-0000-0000-0000-0000000d1404');
select pg_temp.ok((select count(*) = 5 from public.organization_memberships), 'membro lê os vínculos da organização');
select pg_temp.as_user('00000000-0000-0000-0000-0000000d1406');
select pg_temp.ok((select count(*) = 1 from public.organization_memberships), 'outra organização lê só a sua');

-- Por RPC: Admin não mexe em Owner; ninguém vira owner; Owner promove e rebaixa; Owner nunca sai por RPC.
select pg_temp.as_user('00000000-0000-0000-0000-0000000d1402');
select pg_temp.denied($q$select public.update_organization_member_role((select id from owner_row), 'member')$q$, 'Admin rebaixa Owner por RPC');
select pg_temp.denied($q$select public.update_organization_member_role('20000000-0000-0000-0000-000000000d04', 'owner')$q$, 'RPC não cria owner');
select pg_temp.denied($q$select public.remove_organization_member((select id from owner_row))$q$, 'Admin remove Owner por RPC');
select pg_temp.as_user('00000000-0000-0000-0000-0000000d1404');
select pg_temp.denied($q$select public.update_organization_member_role('20000000-0000-0000-0000-000000000d05', 'admin')$q$, 'membro promove por RPC');
select pg_temp.denied($q$select public.remove_organization_member('20000000-0000-0000-0000-000000000d05')$q$, 'membro remove por RPC');
select pg_temp.as_user('00000000-0000-0000-0000-0000000d1401');
select pg_temp.denied($q$select public.remove_organization_member((select id from owner_row))$q$, 'Owner remove a si por RPC');
select pg_temp.denied($q$select public.update_organization_member_role((select id from owner_row), 'admin')$q$, 'Owner rebaixa a si por RPC');
select public.update_organization_member_role('20000000-0000-0000-0000-000000000d04', 'admin');
select pg_temp.ok((select role = 'admin' from public.organization_memberships where id = '20000000-0000-0000-0000-000000000d04'), 'Owner promove a admin por RPC');
select public.update_organization_member_role('20000000-0000-0000-0000-000000000d04', 'member');
select pg_temp.ok((select role = 'member' from public.organization_memberships where id = '20000000-0000-0000-0000-000000000d04'), 'Owner rebaixa a member por RPC');
select public.remove_organization_member('20000000-0000-0000-0000-000000000d05');
select pg_temp.ok(not exists (select 1 from public.organization_memberships where id = '20000000-0000-0000-0000-000000000d05'), 'Owner remove membro por RPC');

-- Aceite de convite continua criando o vínculo (security definer).
select pg_temp.as_user('00000000-0000-0000-0000-0000000d1407');
select public.accept_organization_invite((select token from invite_token));
select pg_temp.ok(exists (select 1 from public.organization_memberships where organization_id = '10000000-0000-0000-0000-000000000d14' and user_id = '00000000-0000-0000-0000-0000000d1407' and role = 'member'), 'aceite de convite cria o vínculo');

-- Cascade não depende do grant revogado: sair da conta (delete_my_account) e apagar a organização.
select pg_temp.as_user('00000000-0000-0000-0000-0000000d1407');
select public.delete_my_account();
select pg_temp.ok(not exists (select 1 from public.organization_memberships where user_id = '00000000-0000-0000-0000-0000000d1407'), 'delete_my_account apaga o vínculo em cascade');
select pg_temp.as_user('00000000-0000-0000-0000-0000000d1406');
delete from public.organizations where id = '10000000-0000-0000-0000-000000000d15';
reset role;
select pg_temp.ok(not exists (select 1 from public.organization_memberships where organization_id = '10000000-0000-0000-0000-000000000d15'), 'apagar a organização apaga os vínculos em cascade');

-- Invariante D4: a organização manteve um único Owner.
select pg_temp.ok((select count(*) = 1 from public.organization_memberships where organization_id = '10000000-0000-0000-0000-000000000d14' and role = 'owner'), 'organização mantém o Owner');

rollback;
