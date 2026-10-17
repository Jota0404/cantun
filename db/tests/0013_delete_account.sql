-- CANTUM — B8 fatia 5: delete_my_account, usuário sentinela e registro da exportação (VS-07, ADR-063; N1, N2, N8–N10).
\set ON_ERROR_STOP on
\o /dev/null
begin;

create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('app.user_id', coalesce(p_id, ''), true) $$;

create function pg_temp.ok(p_condition boolean, p_label text) returns void language plpgsql
as $$ begin if not coalesce(p_condition, false) then raise exception 'falhou: %', p_label; end if; end $$;

-- Falha esperada com a mensagem exata (nada alterado: a exceção desfaz o savepoint implícito do bloco).
create function pg_temp.fails_with(p_sql text, p_message text, p_label text) returns void language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm = p_message then return; end if;
    raise exception 'mensagem errada em %: % (esperado %)', p_label, sqlerrm, p_message;
  end;
  raise exception 'deveria falhar: %', p_label;
end $$;

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

-- ana (será excluída) · olga (Owner da ORG1) · bruno (colega da Ana) · xena (outra organização)
-- sole (único Owner da ORG3) · ow1/ow2 (Owners da ORG4) · ina (membro inativo) · solo (sem organização)
insert into app.users (id, email, display_name, email_verified_at) values
  ('00000000-0000-0000-0000-0000000c1301', 'ana@c13.local', 'Ana', now()),
  ('00000000-0000-0000-0000-0000000c1302', 'olga@c13.local', 'Olga', now()),
  ('00000000-0000-0000-0000-0000000c1303', 'bruno@c13.local', 'Bruno', now()),
  ('00000000-0000-0000-0000-0000000c1304', 'xena@c13.local', 'Xena', now()),
  ('00000000-0000-0000-0000-0000000c1305', 'sole@c13.local', 'Sole', now()),
  ('00000000-0000-0000-0000-0000000c1306', 'ow1@c13.local', 'Ow1', now()),
  ('00000000-0000-0000-0000-0000000c1307', 'ow2@c13.local', 'Ow2', now()),
  ('00000000-0000-0000-0000-0000000c1308', 'ina@c13.local', 'Ina', now()),
  ('00000000-0000-0000-0000-0000000c1309', 'solo@c13.local', 'Solo', now());

set local role cantum_user;
select pg_temp.as_user('00000000-0000-0000-0000-0000000c1302');
select public.create_organization('10000000-0000-0000-0000-0000000c1301', 'Ministério 1');
select pg_temp.as_user('00000000-0000-0000-0000-0000000c1304');
select public.create_organization('10000000-0000-0000-0000-0000000c1302', 'Ministério 2');
select pg_temp.as_user('00000000-0000-0000-0000-0000000c1305');
select public.create_organization('10000000-0000-0000-0000-0000000c1303', 'Ministério 3');
select pg_temp.as_user('00000000-0000-0000-0000-0000000c1306');
select public.create_organization('10000000-0000-0000-0000-0000000c1304', 'Ministério 4');
reset role;
select pg_temp.as_user(null);

insert into public.organization_memberships (organization_id, user_id, role) values
  ('10000000-0000-0000-0000-0000000c1301', '00000000-0000-0000-0000-0000000c1301', 'member'),
  ('10000000-0000-0000-0000-0000000c1301', '00000000-0000-0000-0000-0000000c1303', 'member'),
  ('10000000-0000-0000-0000-0000000c1301', '00000000-0000-0000-0000-0000000c1308', 'member'),
  ('10000000-0000-0000-0000-0000000c1304', '00000000-0000-0000-0000-0000000c1307', 'owner');
insert into public.teams (id, organization_id, name) values
  ('30000000-0000-0000-0000-0000000c1301', '10000000-0000-0000-0000-0000000c1301', 'Banda 1'),
  ('30000000-0000-0000-0000-0000000c1302', '10000000-0000-0000-0000-0000000c1302', 'Banda 2');
insert into public.team_memberships (team_id, user_id, role, status) values
  ('30000000-0000-0000-0000-0000000c1301', '00000000-0000-0000-0000-0000000c1301', 'leader', 'active'),
  ('30000000-0000-0000-0000-0000000c1301', '00000000-0000-0000-0000-0000000c1303', 'member', 'active'),
  ('30000000-0000-0000-0000-0000000c1301', '00000000-0000-0000-0000-0000000c1308', 'member', 'inactive');
insert into public.team_musical_functions (team_membership_id, musical_function)
  select id, 'vocals' from public.team_memberships where user_id = '00000000-0000-0000-0000-0000000c1301';

-- Músicas: pessoais da Ana, do Bruno e da Ina; cópia da Ana no Ministério 1 (origem: pessoal da Ana); cópia da Xena.
insert into public.songs (user_id, id, organization_id, source_song_id, title, original_key, current_key, lyrics, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000c1301', '41000000-0000-0000-0000-0000000c1301', null, null, 'Pessoal da Ana', 'C', 'C', '[C]a', now(), now() - interval '1 day'),
  ('00000000-0000-0000-0000-0000000c1303', '41000000-0000-0000-0000-0000000c1302', null, null, 'Pessoal do Bruno', 'D', 'D', '[D]b', now(), now()),
  ('00000000-0000-0000-0000-0000000c1301', '41000000-0000-0000-0000-0000000c1303', '10000000-0000-0000-0000-0000000c1301', '41000000-0000-0000-0000-0000000c1301', 'Cópia da Ana', 'C', 'C', '[C]a', now(), now() - interval '1 day'),
  ('00000000-0000-0000-0000-0000000c1304', '41000000-0000-0000-0000-0000000c1304', '10000000-0000-0000-0000-0000000c1302', null, 'Cópia da Xena', 'E', 'E', '[E]x', now(), now()),
  ('00000000-0000-0000-0000-0000000c1308', '41000000-0000-0000-0000-0000000c1305', null, null, 'Pessoal da Ina', 'G', 'G', '[G]i', now(), now()),
  ('00000000-0000-0000-0000-0000000c1301', '41000000-0000-0000-0000-0000000c1306', '10000000-0000-0000-0000-0000000c1301', null, 'Cópia apagada da Ana', 'A', 'A', '[A]a', now(), now());
update public.songs set deleted_at = now() where id = '41000000-0000-0000-0000-0000000c1306';

-- Repertórios: pessoal da Ana, do Ministério 1 (autoria da Ana), pessoal do Bruno.
insert into public.repertoires (id, organization_id, name, created_by_user_id) values
  ('51000000-0000-0000-0000-0000000c1301', null, 'Pessoal da Ana', '00000000-0000-0000-0000-0000000c1301'),
  ('51000000-0000-0000-0000-0000000c1302', '10000000-0000-0000-0000-0000000c1301', 'Culto da Ana', '00000000-0000-0000-0000-0000000c1301'),
  ('51000000-0000-0000-0000-0000000c1303', null, 'Pessoal do Bruno', '00000000-0000-0000-0000-0000000c1303');
insert into public.repertoire_items (repertoire_id, song_id, position) values
  ('51000000-0000-0000-0000-0000000c1301', '41000000-0000-0000-0000-0000000c1301', 0),
  ('51000000-0000-0000-0000-0000000c1302', '41000000-0000-0000-0000-0000000c1303', 0),
  ('51000000-0000-0000-0000-0000000c1303', '41000000-0000-0000-0000-0000000c1302', 0);

-- Serviços: SV1 futuro e SV2 concluído (autoria da Ana, guard_service barra edição de concluído), SV3 da Xena.
insert into public.services (id, organization_id, team_id, name, starts_at, status, created_by_user_id) values
  ('60000000-0000-0000-0000-0000000c1301', '10000000-0000-0000-0000-0000000c1301', '30000000-0000-0000-0000-0000000c1301', 'Culto futuro', now() + interval '2 days', 'in_progress', '00000000-0000-0000-0000-0000000c1301'),
  ('60000000-0000-0000-0000-0000000c1302', '10000000-0000-0000-0000-0000000c1301', '30000000-0000-0000-0000-0000000c1301', 'Culto passado', now() - interval '9 days', 'completed', '00000000-0000-0000-0000-0000000c1301'),
  ('60000000-0000-0000-0000-0000000c1303', '10000000-0000-0000-0000-0000000c1302', '30000000-0000-0000-0000-0000000c1302', 'Culto da Xena', now() + interval '3 days', 'draft', '00000000-0000-0000-0000-0000000c1304');
insert into public.service_items (service_id, song_id, position) values
  ('60000000-0000-0000-0000-0000000c1301', '41000000-0000-0000-0000-0000000c1303', 0);
insert into public.service_positions (id, service_id, musical_function, quantity) values
  ('70000000-0000-0000-0000-0000000c1301', '60000000-0000-0000-0000-0000000c1301', 'vocals', 1),
  ('70000000-0000-0000-0000-0000000c1302', '60000000-0000-0000-0000-0000000c1301', 'drums', 1),
  ('70000000-0000-0000-0000-0000000c1303', '60000000-0000-0000-0000-0000000c1302', 'vocals', 1);
insert into public.assignments (position_id, user_id, status) values
  ('70000000-0000-0000-0000-0000000c1301', '00000000-0000-0000-0000-0000000c1301', 'invited'),
  ('70000000-0000-0000-0000-0000000c1302', '00000000-0000-0000-0000-0000000c1303', 'confirmed'),
  ('70000000-0000-0000-0000-0000000c1303', '00000000-0000-0000-0000-0000000c1301', 'confirmed');

-- Palco aberto no culto futuro, com a Ana como MD.
insert into public.stage_sessions (id, service_id, status, started_at, md_user_id) values
  ('80000000-0000-0000-0000-0000000c1301', '60000000-0000-0000-0000-0000000c1301', 'live', now(), '00000000-0000-0000-0000-0000000c1301');

insert into public.member_availability (user_id, organization_id, date, status, note) values
  ('00000000-0000-0000-0000-0000000c1301', '10000000-0000-0000-0000-0000000c1301', current_date + 1, 'unavailable', 'nota da Ana'),
  ('00000000-0000-0000-0000-0000000c1303', '10000000-0000-0000-0000-0000000c1301', current_date + 1, 'available', 'nota do Bruno');
insert into public.organization_invites (organization_id, team_id, invited_by_user_id, role, invitee_email, token_hash, expires_at) values
  ('10000000-0000-0000-0000-0000000c1301', '30000000-0000-0000-0000-0000000c1301', '00000000-0000-0000-0000-0000000c1301', 'member', 'terceiro@c13.local', '\x01', now() + interval '1 day');
insert into app.sessions (token_hash, user_id, expires_at) values ('\x0a', '00000000-0000-0000-0000-0000000c1301', now() + interval '1 day'),
                                                                   ('\x0b', '00000000-0000-0000-0000-0000000c1303', now() + interval '1 day');
insert into app.email_tokens (token_hash, user_id, purpose, expires_at) values ('\x0c', '00000000-0000-0000-0000-0000000c1301', 'reset_password', now() + interval '1 day');
-- Eventos antigos que citam a Ana como alvo e como autora.
insert into public.admin_events (organization_id, actor_user_id, target_user_id, action) values
  ('10000000-0000-0000-0000-0000000c1301', '00000000-0000-0000-0000-0000000c1302', '00000000-0000-0000-0000-0000000c1301', 'team_member.remove'),
  ('10000000-0000-0000-0000-0000000c1301', '00000000-0000-0000-0000-0000000c1301', '00000000-0000-0000-0000-0000000c1303', 'team_member.remove');

-- ---------------------------------------------------------------------------
-- N1 / N2: anônimo negado; a RPC não recebe id (não há como apontar outra conta)
-- ---------------------------------------------------------------------------
select pg_temp.ok((select pronargs = 0 from pg_proc where oid = 'public.delete_my_account()'::regprocedure), 'N2: delete_my_account não recebe parâmetro');

set local role cantum_user;
select pg_temp.as_user(null);
select pg_temp.fails_with('select public.delete_my_account()', 'authentication required', 'N1: sem usuário');
reset role;

set local role cantum_anon;
select pg_temp.denied('select public.delete_my_account()', 'N1: cantum_anon não executa a RPC');
reset role;

-- Sentinela não é titular de conta.
set local role cantum_user;
select pg_temp.as_user(app.deleted_user_id()::text);
select pg_temp.fails_with('select public.delete_my_account()', 'cannot delete the deleted-user placeholder', 'sentinela não se exclui');
reset role;

-- ---------------------------------------------------------------------------
-- D4: único Owner é bloqueado e nada muda
-- ---------------------------------------------------------------------------
set local role cantum_user;
select pg_temp.as_user('00000000-0000-0000-0000-0000000c1305');
select pg_temp.fails_with('select public.delete_my_account()', 'sole owner of an organization: transfer ownership first', 'único Owner da ORG3');
reset role;
select pg_temp.ok(exists (select 1 from app.users where id = '00000000-0000-0000-0000-0000000c1305')
                  and exists (select 1 from public.organization_memberships where user_id = '00000000-0000-0000-0000-0000000c1305' and role = 'owner'),
                  'bloqueio não alterou a conta nem o vínculo');
select pg_temp.ok(not exists (select 1 from public.admin_events where action = 'account.delete'), 'bloqueio não grava evento');

-- Dois Owners: o primeiro sai; o segundo vira único Owner e é bloqueado.
set local role cantum_user;
select pg_temp.as_user('00000000-0000-0000-0000-0000000c1306');
select public.delete_my_account();
select pg_temp.as_user('00000000-0000-0000-0000-0000000c1307');
select pg_temp.fails_with('select public.delete_my_account()', 'sole owner of an organization: transfer ownership first', 'segundo Owner virou único');
reset role;
select pg_temp.ok(not exists (select 1 from app.users where id = '00000000-0000-0000-0000-0000000c1306'), 'primeiro Owner excluído');
select pg_temp.ok(exists (select 1 from public.organizations where id = '10000000-0000-0000-0000-0000000c1304'), 'ORG4 continua existindo');

-- ---------------------------------------------------------------------------
-- Exportação grava account.export por organização, sem conteúdo (RN-09)
-- ---------------------------------------------------------------------------
set local role cantum_user;
select pg_temp.as_user('00000000-0000-0000-0000-0000000c1301');
create temp table pg_temp.ignored_export as select public.export_my_data() as j;
reset role;
select pg_temp.ok((select count(*) = 1 from public.admin_events
                   where action = 'account.export' and organization_id = '10000000-0000-0000-0000-0000000c1301'
                     and actor_user_id = '00000000-0000-0000-0000-0000000c1301' and target_user_id = '00000000-0000-0000-0000-0000000c1301'),
                  'export grava account.export na organização da Ana');
set local role cantum_user;
select pg_temp.as_user('00000000-0000-0000-0000-0000000c1309');
create temp table pg_temp.ignored_export2 as select public.export_my_data() as j;
reset role;
select pg_temp.ok((select count(*) = 1 from public.admin_events where action = 'account.export'), 'usuário sem organização exporta sem gerar evento');

-- N9: cliente não grava nem apaga admin_events.
set local role cantum_user;
select pg_temp.as_user('00000000-0000-0000-0000-0000000c1302');
select pg_temp.denied($q$insert into public.admin_events (organization_id, action) values ('10000000-0000-0000-0000-0000000c1301', 'account.delete')$q$, 'N9: insert direto em admin_events');
select pg_temp.denied($q$delete from public.admin_events$q$, 'N9: delete direto em admin_events');
-- O bypass da exclusão não afrouxa os guards: autoria continua imutável para o cliente.
-- (Olga é Owner: enxerga e pode editar a cópia, então o bloqueio vem do guard, não de RLS.)
select pg_temp.denied($q$update public.songs set user_id = '00000000-0000-0000-0000-0000000c1302' where id = '41000000-0000-0000-0000-0000000c1303'$q$, 'autoria de música imutável');
select pg_temp.denied($q$update public.repertoires set created_by_user_id = '00000000-0000-0000-0000-0000000c1302' where id = '51000000-0000-0000-0000-0000000c1302'$q$, 'autoria de repertório imutável');
reset role;

-- ---------------------------------------------------------------------------
-- Exclusão da Ana (membro, Líder da banda, MD do Palco aberto)
-- ---------------------------------------------------------------------------
create temp table pg_temp.counts_before as
select (select revision from public.stage_session_states where stage_session_id = '80000000-0000-0000-0000-0000000c1301') stage_revision, (select count(*) from public.songs where user_id = '00000000-0000-0000-0000-0000000c1304') xena_songs,
       (select count(*) from public.services where created_by_user_id = '00000000-0000-0000-0000-0000000c1304') xena_services,
       (select count(*) from public.organization_memberships where organization_id = '10000000-0000-0000-0000-0000000c1302') org2_members,
       (select count(*) from public.songs where user_id = '00000000-0000-0000-0000-0000000c1303') bruno_songs,
       (select count(*) from public.repertoires where created_by_user_id = '00000000-0000-0000-0000-0000000c1303') bruno_reps,
       (select count(*) from public.member_availability where user_id = '00000000-0000-0000-0000-0000000c1303') bruno_availability;
grant select on pg_temp.counts_before to public;

set local role cantum_user;
select pg_temp.as_user('00000000-0000-0000-0000-0000000c1301');
select public.delete_my_account();
reset role;

-- D3: dados pessoais apagados na hora.
select pg_temp.ok(not exists (select 1 from app.users where id = '00000000-0000-0000-0000-0000000c1301' or email = 'ana@c13.local'), 'usuário e e-mail apagados');
select pg_temp.ok(not exists (select 1 from app.sessions where user_id = '00000000-0000-0000-0000-0000000c1301')
                  and not exists (select 1 from app.email_tokens where user_id = '00000000-0000-0000-0000-0000000c1301'), 'sessões e tokens apagados');
select pg_temp.ok(not exists (select 1 from public.organization_memberships where user_id = '00000000-0000-0000-0000-0000000c1301')
                  and not exists (select 1 from public.team_memberships where user_id = '00000000-0000-0000-0000-0000000c1301')
                  and not exists (select 1 from public.team_musical_functions f where not exists (select 1 from public.team_memberships tm where tm.id = f.team_membership_id)),
                  'vínculos e funções apagados');
select pg_temp.ok(not exists (select 1 from public.assignments where user_id = '00000000-0000-0000-0000-0000000c1301'), 'escalas (futuras e passadas) apagadas');
select pg_temp.ok(not exists (select 1 from public.member_availability where user_id = '00000000-0000-0000-0000-0000000c1301'), 'disponibilidade apagada');
select pg_temp.ok(not exists (select 1 from public.organization_invites where invited_by_user_id = '00000000-0000-0000-0000-0000000c1301' or invitee_email = 'terceiro@c13.local'), 'convites emitidos apagados');
select pg_temp.ok(not exists (select 1 from public.songs where id = '41000000-0000-0000-0000-0000000c1301')
                  and not exists (select 1 from public.repertoires where id = '51000000-0000-0000-0000-0000000c1301')
                  and not exists (select 1 from public.repertoire_items where repertoire_id = '51000000-0000-0000-0000-0000000c1301'), 'música e repertório pessoais apagados');
select pg_temp.ok(not exists (select 1 from public.songs where user_id = '00000000-0000-0000-0000-0000000c1301')
                  and not exists (select 1 from public.repertoires where created_by_user_id = '00000000-0000-0000-0000-0000000c1301')
                  and not exists (select 1 from public.services where created_by_user_id = '00000000-0000-0000-0000-0000000c1301'),
                  'nenhuma autoria aponta para a Ana');

-- D2: conteúdo do Ministério preservado com autoria do sentinela.
select pg_temp.ok((select user_id = app.deleted_user_id() and organization_id = '10000000-0000-0000-0000-0000000c1301'
                          and source_song_id is null and title = 'Cópia da Ana' and updated_at > now() - interval '1 minute'
                   from public.songs where id = '41000000-0000-0000-0000-0000000c1303'), 'cópia preservada, sentinela como autor, origem pessoal desligada e updated_at novo');
select pg_temp.ok((select user_id = app.deleted_user_id() and deleted_at is not null from public.songs where id = '41000000-0000-0000-0000-0000000c1306'), 'cópia apagada logicamente também reatribuída');
select pg_temp.ok((select created_by_user_id = app.deleted_user_id() and organization_id is not null from public.repertoires where id = '51000000-0000-0000-0000-0000000c1302')
                  and (select count(*) = 1 from public.repertoire_items where repertoire_id = '51000000-0000-0000-0000-0000000c1302'), 'repertório do Ministério preservado');
select pg_temp.ok((select count(*) = 2 and bool_and(created_by_user_id = app.deleted_user_id()) from public.services where id in ('60000000-0000-0000-0000-0000000c1301', '60000000-0000-0000-0000-0000000c1302')),
                  'serviços (inclusive concluído) preservados com autoria do sentinela');
select pg_temp.ok((select count(*) = 1 from public.service_items where service_id = '60000000-0000-0000-0000-0000000c1301' and song_id = '41000000-0000-0000-0000-0000000c1303'), 'item do serviço continua apontando para a cópia');

-- RN-06: vaga fica aberta; o colega continua escalado.
select pg_temp.ok((select count(*) = 0 from public.assignments where position_id = '70000000-0000-0000-0000-0000000c1301')
                  and exists (select 1 from public.service_positions where id = '70000000-0000-0000-0000-0000000c1301' and quantity = 1)
                  and exists (select 1 from public.assignments where position_id = '70000000-0000-0000-0000-0000000c1302' and user_id = '00000000-0000-0000-0000-0000000c1303' and status = 'confirmed'),
                  'vaga da Ana aberta, escala do Bruno intacta');

-- RN-05: Palco aberto não cai; o MD fica vago.
select pg_temp.ok((select status = 'live' and md_user_id is null from public.stage_sessions where id = '80000000-0000-0000-0000-0000000c1301'), 'sessão de Palco viva com MD vago');
select pg_temp.ok((select st.revision = b.stage_revision + 1 from public.stage_session_states st, pg_temp.counts_before b
                   where st.stage_session_id = '80000000-0000-0000-0000-0000000c1301'), 'estado do Palco preservado e revision incrementada (os assinantes são avisados)');

-- Outros usuários e organizações intactos.
select pg_temp.ok((select xena_songs = (select count(*) from public.songs where user_id = '00000000-0000-0000-0000-0000000c1304')
                          and xena_services = (select count(*) from public.services where created_by_user_id = '00000000-0000-0000-0000-0000000c1304')
                          and org2_members = (select count(*) from public.organization_memberships where organization_id = '10000000-0000-0000-0000-0000000c1302')
                          and bruno_songs = (select count(*) from public.songs where user_id = '00000000-0000-0000-0000-0000000c1303')
                          and bruno_reps = (select count(*) from public.repertoires where created_by_user_id = '00000000-0000-0000-0000-0000000c1303')
                          and bruno_availability = (select count(*) from public.member_availability where user_id = '00000000-0000-0000-0000-0000000c1303')
                   from pg_temp.counts_before), 'Xena e Bruno intactos');
select pg_temp.ok(exists (select 1 from app.sessions where user_id = '00000000-0000-0000-0000-0000000c1303'), 'sessão do Bruno intacta');

-- Log: sem conteúdo, titular nulo (RN-09).
select pg_temp.ok((select count(*) = 1 from public.admin_events
                   where action = 'account.delete' and organization_id = '10000000-0000-0000-0000-0000000c1301'
                     and actor_user_id is null and target_user_id is null), 'account.delete gravado na ORG1 sem titular');
select pg_temp.ok(not exists (select 1 from public.admin_events where actor_user_id = '00000000-0000-0000-0000-0000000c1301' or target_user_id = '00000000-0000-0000-0000-0000000c1301'),
                  'eventos antigos da Ana perderam o titular');
select pg_temp.ok((select count(*) = 4 from public.admin_events where organization_id = '10000000-0000-0000-0000-0000000c1301'
                     and action in ('team_member.remove', 'account.export', 'account.delete')) , 'eventos antigos mantidos');
select pg_temp.ok((select array_agg(column_name::text order by column_name) = array['action', 'actor_user_id', 'created_at', 'id', 'organization_id', 'target_user_id']
                   from information_schema.columns where table_schema = 'public' and table_name = 'admin_events'), 'admin_events sem colunas de conteúdo');

-- O Ministério ainda lê a cópia; Owner assina o Palco; lista de membros não mostra o sentinela.
set local role cantum_user;
select pg_temp.as_user('00000000-0000-0000-0000-0000000c1303');
select pg_temp.ok((select count(*) = 1 from public.songs where id = '41000000-0000-0000-0000-0000000c1303'), 'Bruno lê a cópia do Ministério');
select pg_temp.ok((select count(*) = 3 and bool_and(user_id <> app.deleted_user_id()) from public.get_organization_member_profiles('10000000-0000-0000-0000-0000000c1301')), 'N10: lista de membros (Olga, Bruno, Ina) sem o sentinela');
select pg_temp.as_user('00000000-0000-0000-0000-0000000c1302');
select pg_temp.ok(app.can_subscribe_stage_session('80000000-0000-0000-0000-0000000c1301'), 'Owner segue assinando o Palco');
select pg_temp.ok((select count(*) = 1 from public.admin_events where action = 'account.delete'), 'Owner lê o log da própria organização');
select pg_temp.as_user('00000000-0000-0000-0000-0000000c1304');
select pg_temp.ok((select count(*) = 0 from public.admin_events), 'N7: Owner de outra organização não lê');
reset role;

-- ---------------------------------------------------------------------------
-- N10: sentinela não loga, não vira membro e não ganha credencial
-- ---------------------------------------------------------------------------
select pg_temp.ok((select password_hash is null and email_verified_at is null and display_name = 'Ex-membro' from app.users where id = app.deleted_user_id()), 'sentinela sem credencial');
select pg_temp.denied($q$update app.users set password_hash = 'x' where id = app.deleted_user_id()$q$, 'N10: senha no sentinela');
select pg_temp.denied($q$update app.users set email_verified_at = now() where id = app.deleted_user_id()$q$, 'N10: e-mail verificado no sentinela');
select pg_temp.ok(not exists (select 1 from app.sessions where user_id = app.deleted_user_id()), 'sentinela sem sessão');
select pg_temp.ok(not exists (select 1 from public.organization_memberships where user_id = app.deleted_user_id())
                  and not exists (select 1 from public.team_memberships where user_id = app.deleted_user_id()), 'sentinela sem vínculo');

-- ---------------------------------------------------------------------------
-- N8: membro inativo exclui a própria conta; usuário sem organização também
-- ---------------------------------------------------------------------------
set local role cantum_user;
select pg_temp.as_user('00000000-0000-0000-0000-0000000c1308');
select public.delete_my_account();
select pg_temp.as_user('00000000-0000-0000-0000-0000000c1309');
select public.delete_my_account();
reset role;
select pg_temp.ok(not exists (select 1 from app.users where id in ('00000000-0000-0000-0000-0000000c1308', '00000000-0000-0000-0000-0000000c1309')), 'N8: inativo e sem organização excluídos');
select pg_temp.ok(not exists (select 1 from public.songs where id = '41000000-0000-0000-0000-0000000c1305'), 'música pessoal da Ina apagada');
select pg_temp.ok((select count(*) = 3 from public.admin_events where action = 'account.delete'), 'um evento por organização do titular (Ana e Ina na ORG1, Ow1 na ORG4); sem organização não gera');

-- Excluir duas vezes: a conta já não existe, a sessão não identifica ninguém.
set local role cantum_user;
select pg_temp.as_user('00000000-0000-0000-0000-0000000c1301');
select pg_temp.fails_with('select public.delete_my_account()', 'authentication required', 'conta já excluída');
reset role;

rollback;
