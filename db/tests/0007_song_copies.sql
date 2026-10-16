-- CANTUM — FIX-01 / Fatia A: música do Ministério é cópia (PERMISSIONS.md F6–F8, F12),
-- escopo dos itens, FKs NO ACTION e cascade da organização.
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

-- Conta linhas ignorando a RLS (verificação do teste, não do produto).
create function pg_temp.raw_count(p_sql text) returns bigint language plpgsql security definer
as $$ declare v bigint; begin execute p_sql into v; return v; end $$;

do $$ begin
  execute format('grant usage on schema %s to cantum_user, cantum_anon', pg_my_temp_schema()::regnamespace);
end $$;

-- Fixtures: o owner · a admin · l Líder de TA · m e m2 membros de TA · i membro inativo de TA
-- x dono de outra organização · n sem vínculo
insert into app.users (id, email, display_name) values
  ('00000000-0000-0000-0000-000000000701', 'owner@f.local', 'Olga'),
  ('00000000-0000-0000-0000-000000000702', 'admin@f.local', 'Abel'),
  ('00000000-0000-0000-0000-000000000703', 'lider@f.local', 'Lia'),
  ('00000000-0000-0000-0000-000000000704', 'membro@f.local', 'Mauro'),
  ('00000000-0000-0000-0000-000000000705', 'membro2@f.local', 'Mel'),
  ('00000000-0000-0000-0000-000000000706', 'inativo@f.local', 'Ivo'),
  ('00000000-0000-0000-0000-000000000709', 'outra@f.local', 'Xena'),
  ('00000000-0000-0000-0000-00000000070a', 'semvinculo@f.local', 'Nina');

select pg_temp.as_user('00000000-0000-0000-0000-000000000701');
select public.create_organization('10000000-0000-0000-0000-000000000701', 'Ministério F');
insert into public.teams (id, organization_id, name) values ('30000000-0000-0000-0000-000000000701', '10000000-0000-0000-0000-000000000701', 'TA');
select pg_temp.as_user('00000000-0000-0000-0000-000000000709');
select public.create_organization('10000000-0000-0000-0000-000000000702', 'Outro Ministério');
select pg_temp.as_user(null);

insert into public.organization_memberships (organization_id, user_id, role)
select '10000000-0000-0000-0000-000000000701', u, r from (values
  ('00000000-0000-0000-0000-000000000702'::uuid, 'admin'), ('00000000-0000-0000-0000-000000000703', 'member'),
  ('00000000-0000-0000-0000-000000000704', 'member'), ('00000000-0000-0000-0000-000000000705', 'member'),
  ('00000000-0000-0000-0000-000000000706', 'member')) v(u, r);
insert into public.team_memberships (team_id, user_id, role, status) values
  ('30000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000703', 'leader', 'active'),
  ('30000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000704', 'member', 'active'),
  ('30000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000705', 'member', 'active'),
  ('30000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000706', 'member', 'inactive');

-- Músicas pessoais: m tem P1, P2 e P3; l tem a dele; i tem a dele; x tem a dele.
insert into public.songs (user_id, id, title, artist, original_key, current_key, bpm, lyrics, notes, is_favorite, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000704', '40000000-0000-0000-0000-000000000701', 'Grande é o Senhor', 'Autor', 'G', 'A', 72, '[G]Grande é', 'nota', true, now(), now()),
  ('00000000-0000-0000-0000-000000000704', '40000000-0000-0000-0000-000000000702', 'Segunda', null, 'C', 'C', null, 'C G', null, false, now(), now()),
  ('00000000-0000-0000-0000-000000000704', '40000000-0000-0000-0000-000000000703', 'Terceira', null, 'D', 'D', null, 'D A', null, false, now(), now()),
  ('00000000-0000-0000-0000-000000000703', '40000000-0000-0000-0000-000000000711', 'Da Lia', null, 'E', 'E', null, 'E B', null, false, now(), now()),
  ('00000000-0000-0000-0000-000000000706', '40000000-0000-0000-0000-000000000716', 'Do Ivo', null, 'F', 'F', null, 'F C', null, false, now(), now()),
  ('00000000-0000-0000-0000-000000000709', '40000000-0000-0000-0000-000000000719', 'Da Xena', null, 'A', 'A', null, 'A E', null, false, now(), now()),
  ('00000000-0000-0000-0000-000000000704', '40000000-0000-0000-0000-000000000704', 'Apagada', null, 'A', 'A', null, 'A E', null, false, now(), now());
update public.songs set deleted_at = now() where id = '40000000-0000-0000-0000-000000000704';

set local role cantum_user;

-- ---------------------------------------------------------------------------
-- Cópia: cria, é idempotente e não toca na original
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-000000000704');
select pg_temp.ok((select organization_id = '10000000-0000-0000-0000-000000000701' and user_id = '00000000-0000-0000-0000-000000000704'
    and source_song_id = '40000000-0000-0000-0000-000000000701' and id = '41000000-0000-0000-0000-000000000701'
    and title = 'Grande é o Senhor' and artist = 'Autor' and original_key = 'G' and current_key = 'A' and bpm = 72
    and lyrics = '[G]Grande é' and notes = 'nota' and not is_favorite and deleted_at is null
  from public.copy_song_to_organization('40000000-0000-0000-0000-000000000701', '10000000-0000-0000-0000-000000000701', '41000000-0000-0000-0000-000000000701')),
  'Membro copia a própria música: autor = quem copiou, origem registrada');
select pg_temp.ok((select id = '41000000-0000-0000-0000-000000000701'
  from public.copy_song_to_organization('40000000-0000-0000-0000-000000000701', '10000000-0000-0000-0000-000000000701', null)), 'cópia idempotente por origem');
select pg_temp.ok((select id = '41000000-0000-0000-0000-000000000701'
  from public.copy_song_to_organization('40000000-0000-0000-0000-000000000701', '10000000-0000-0000-0000-000000000701', gen_random_uuid())), 'cópia idempotente mesmo com outro id novo');
select pg_temp.ok((select count(*) = 1 from public.songs where source_song_id = '40000000-0000-0000-0000-000000000701'), 'uma só cópia por origem');
select pg_temp.affects($q$update public.songs set title = 'Editada na cópia', lyrics = 'novo' where id = '41000000-0000-0000-0000-000000000701'$q$, 1, 'autor edita a cópia (song.edit_own)');
select pg_temp.ok((select title = 'Grande é o Senhor' and lyrics = '[G]Grande é' from public.songs where id = '40000000-0000-0000-0000-000000000701'), 'editar a cópia não altera a pessoal');
select pg_temp.affects($q$update public.songs set title = 'Editada na pessoal' where id = '40000000-0000-0000-0000-000000000701'$q$, 1, 'autor edita a pessoal');
select pg_temp.ok((select title = 'Editada na cópia' from public.songs where id = '41000000-0000-0000-0000-000000000701'), 'editar a pessoal não altera a cópia');

-- ---------------------------------------------------------------------------
-- F6 — copiar o que não pode
-- ---------------------------------------------------------------------------
select pg_temp.fails($q$select public.copy_song_to_organization('40000000-0000-0000-0000-000000000711', '10000000-0000-0000-0000-000000000701', null)$q$, 'F6 música pessoal de outra pessoa', 'P0001', 'song not found or not authorized');
select pg_temp.fails($q$select public.copy_song_to_organization('41000000-0000-0000-0000-000000000701', '10000000-0000-0000-0000-000000000701', null)$q$, 'F6 copiar uma cópia', 'P0001', 'song not found or not authorized');
select pg_temp.fails($q$select public.copy_song_to_organization(gen_random_uuid(), '10000000-0000-0000-0000-000000000701', null)$q$, 'F6 inexistente', 'P0001', 'song not found or not authorized');
select pg_temp.fails($q$select public.copy_song_to_organization('40000000-0000-0000-0000-000000000704', '10000000-0000-0000-0000-000000000701', null)$q$, 'F6 música apagada', 'P0001', 'song not found or not authorized');
select pg_temp.fails($q$select public.copy_song_to_organization('40000000-0000-0000-0000-000000000702', '10000000-0000-0000-0000-000000000702', null)$q$, 'F6 organização de que não é membro', 'P0001', 'not authorized to copy songs to this organization');
select pg_temp.fails($q$select public.copy_song_to_organization('40000000-0000-0000-0000-000000000702', gen_random_uuid(), null)$q$, 'F6 organização inexistente', 'P0001', 'not authorized to copy songs to this organization');
select pg_temp.as_user('00000000-0000-0000-0000-000000000706'); -- inativo em todas
select pg_temp.fails($q$select public.copy_song_to_organization('40000000-0000-0000-0000-000000000716', '10000000-0000-0000-0000-000000000701', null)$q$, 'F6 inativo copia', 'P0001', 'not authorized to copy songs to this organization');
select pg_temp.as_user('00000000-0000-0000-0000-00000000070a'); -- sem vínculo
select pg_temp.fails($q$select public.copy_song_to_organization('40000000-0000-0000-0000-000000000702', '10000000-0000-0000-0000-000000000701', null)$q$, 'F6 sem vínculo', 'P0001', 'song not found or not authorized');
select pg_temp.as_user(null);
select pg_temp.fails($q$select public.copy_song_to_organization('40000000-0000-0000-0000-000000000702', '10000000-0000-0000-0000-000000000701', null)$q$, 'anônimo copia', 'P0001', 'authentication required');
reset role;
set local role cantum_anon;
select pg_temp.fails($q$select public.copy_song_to_organization('40000000-0000-0000-0000-000000000702', '10000000-0000-0000-0000-000000000701', null)$q$, 'cantum_anon executa a RPC', '42501');
reset role;
set local role cantum_user;

-- Cópia apagada (soft delete) não bloqueia uma nova.
select pg_temp.as_user('00000000-0000-0000-0000-000000000704');
select public.copy_song_to_organization('40000000-0000-0000-0000-000000000702', '10000000-0000-0000-0000-000000000701', '41000000-0000-0000-0000-000000000702');
select pg_temp.affects($q$update public.songs set deleted_at = now() where id = '41000000-0000-0000-0000-000000000702'$q$, 1, 'autor apaga a cópia (soft delete)');
select pg_temp.ok((select id <> '41000000-0000-0000-0000-000000000702' and deleted_at is null
  from public.copy_song_to_organization('40000000-0000-0000-0000-000000000702', '10000000-0000-0000-0000-000000000701', null)), 'depois de apagada, copiar de novo cria outra');

-- ---------------------------------------------------------------------------
-- Leitura
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-000000000705'); -- Membro de TA
select pg_temp.ok((select count(*) >= 2 from public.songs where organization_id = '10000000-0000-0000-0000-000000000701'), 'membro ativo lê as cópias do Ministério');
select pg_temp.ok((select count(*) = 0 from public.songs where organization_id is null), 'membro não lê música pessoal de outro');
select pg_temp.as_user('00000000-0000-0000-0000-000000000701'); -- Owner
select pg_temp.ok((select count(*) = 0 from public.songs where organization_id is null), 'Owner não lê música pessoal de outro');
select pg_temp.as_user('00000000-0000-0000-0000-000000000706'); -- inativo
select pg_temp.ok((select count(*) = 1 from public.songs), 'inativo lê só a própria pessoal');
select pg_temp.as_user('00000000-0000-0000-0000-000000000709'); -- outra organização
select pg_temp.ok((select count(*) = 1 and bool_and(organization_id is null) from public.songs), 'outra organização não lê as cópias');
select pg_temp.as_user('00000000-0000-0000-0000-00000000070a');
select pg_temp.ok((select count(*) = 0 from public.songs), 'sem vínculo não lê nada');
select pg_temp.as_user(null);
select pg_temp.ok((select count(*) = 0 from public.songs), 'anônimo não lê nada');

-- ---------------------------------------------------------------------------
-- F7 — editar e excluir a cópia: quem pode e quem não pode
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-000000000705'); -- Membro que não é o autor
select pg_temp.affects($q$update public.songs set title = 'Invadida' where id = '41000000-0000-0000-0000-000000000701'$q$, 0, 'F7 Membro não autor edita');
select pg_temp.affects($q$delete from public.songs where id = '41000000-0000-0000-0000-000000000701'$q$, 0, 'F7 Membro não autor exclui');
select pg_temp.affects($q$update public.songs set deleted_at = now() where id = '41000000-0000-0000-0000-000000000701'$q$, 0, 'F7 Membro não autor apaga (soft)');
select pg_temp.as_user('00000000-0000-0000-0000-000000000703'); -- Líder ativo (L*), não é o autor
select pg_temp.affects($q$update public.songs set title = 'Editada pela Lia' where id = '41000000-0000-0000-0000-000000000701'$q$, 1, 'Líder edita a MESMA linha');
select pg_temp.ok((select user_id = '00000000-0000-0000-0000-000000000704' and title = 'Editada pela Lia' from public.songs where id = '41000000-0000-0000-0000-000000000701'), 'autor continua o Mauro');
select pg_temp.ok((select count(*) = 1 from public.songs where id = '41000000-0000-0000-0000-000000000701'), 'nenhuma linha nova do editor');
select pg_temp.affects($q$delete from public.songs where id = '41000000-0000-0000-0000-000000000701'$q$, 0, 'Líder não exclui o que é de outro (song.delete)');
select pg_temp.fails($q$update public.songs set deleted_at = now() where id = '41000000-0000-0000-0000-000000000701'$q$, 'Líder não apaga (soft) a cópia de outro', '42501', 'not authorized to delete this song');
select pg_temp.affects($q$update public.songs set title = 'Ainda edita' where id = '41000000-0000-0000-0000-000000000701'$q$, 1, 'Líder continua editando');
select pg_temp.as_user('00000000-0000-0000-0000-000000000702'); -- Admin
select pg_temp.affects($q$update public.songs set title = 'Editada pelo Admin' where id = '41000000-0000-0000-0000-000000000701'$q$, 1, 'Admin edita a cópia');
select pg_temp.ok((select count(*) = 1 from public.songs where id = '41000000-0000-0000-0000-000000000701' and user_id = '00000000-0000-0000-0000-000000000704'), 'Admin não troca o autor');

-- F12 — autor, organização e origem não mudam; upsert que cria linha própria é negado
select pg_temp.as_user('00000000-0000-0000-0000-000000000703');
select pg_temp.fails($q$update public.songs set user_id = '00000000-0000-0000-0000-000000000703' where id = '41000000-0000-0000-0000-000000000701'$q$, 'F12 troca o autor', '42501');
select pg_temp.fails($q$update public.songs set organization_id = '10000000-0000-0000-0000-000000000702' where id = '41000000-0000-0000-0000-000000000701'$q$, 'F12 troca a organização', '42501');
select pg_temp.fails($q$update public.songs set organization_id = null where id = '41000000-0000-0000-0000-000000000701'$q$, 'F12 torna a cópia pessoal', '42501');
select pg_temp.fails($q$update public.songs set source_song_id = '40000000-0000-0000-0000-000000000702' where id = '41000000-0000-0000-0000-000000000701'$q$, 'F12 troca a origem', '42501');
select pg_temp.fails($q$insert into public.songs (user_id, id, organization_id, title, original_key, current_key, lyrics, created_at, updated_at) values ('00000000-0000-0000-0000-000000000703', '41000000-0000-0000-0000-000000000701', '10000000-0000-0000-0000-000000000701', 'x', 'C', 'C', 'x', now(), now()) on conflict (user_id, id) do update set title = excluded.title$q$, 'F12 upsert com user_id do editor e organização', '42501');
select pg_temp.fails($q$insert into public.songs (user_id, id, title, original_key, current_key, lyrics, created_at, updated_at) values ('00000000-0000-0000-0000-000000000703', '41000000-0000-0000-0000-000000000701', 'x', 'C', 'C', 'x', now(), now()) on conflict (user_id, id) do update set title = excluded.title$q$, 'F12 upsert pessoal com o id da cópia', '23505');
select pg_temp.fails($q$insert into public.songs (user_id, id, organization_id, title, original_key, current_key, lyrics, created_at, updated_at) values ('00000000-0000-0000-0000-000000000703', gen_random_uuid(), '10000000-0000-0000-0000-000000000701', 'x', 'C', 'C', 'x', now(), now())$q$, 'cópia só pela RPC', '42501');
select pg_temp.fails($q$insert into public.songs (user_id, id, source_song_id, title, original_key, current_key, lyrics, created_at, updated_at) values ('00000000-0000-0000-0000-000000000703', gen_random_uuid(), gen_random_uuid(), 'x', 'C', 'C', 'x', now(), now())$q$, 'origem só em cópia', '42501');
select pg_temp.fails($q$update public.songs set user_id = '00000000-0000-0000-0000-000000000705' where id = '40000000-0000-0000-0000-000000000711'$q$, 'doar música pessoal', '42501');

-- ---------------------------------------------------------------------------
-- Escopo dos itens (trigger)
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-000000000701');
insert into public.repertoires (id, organization_id, name, created_by_user_id)
  values ('50000000-0000-0000-0000-000000000701', '10000000-0000-0000-0000-000000000701', 'Do Ministério', '00000000-0000-0000-0000-000000000701');
select pg_temp.fails($q$insert into public.repertoire_items (repertoire_id, song_id, position) values ('50000000-0000-0000-0000-000000000701', '40000000-0000-0000-0000-000000000703', 0)$q$, 'item de repertório com música pessoal', 'P0001', 'song does not belong to the repertoire organization');
select pg_temp.as_user('00000000-0000-0000-0000-000000000709');
select public.copy_song_to_organization('40000000-0000-0000-0000-000000000719', '10000000-0000-0000-0000-000000000702', '41000000-0000-0000-0000-000000000719');
select pg_temp.as_user('00000000-0000-0000-0000-000000000701');
select pg_temp.fails($q$insert into public.repertoire_items (repertoire_id, song_id, position) values ('50000000-0000-0000-0000-000000000701', '41000000-0000-0000-0000-000000000719', 0)$q$, 'item de repertório com cópia de outro Ministério', 'P0001', 'song does not belong to the repertoire organization');
select pg_temp.fails($q$insert into public.repertoire_items (repertoire_id, song_id, position) values ('50000000-0000-0000-0000-000000000701', gen_random_uuid(), 0)$q$, 'item com música inexistente (FK)', '23503');
insert into public.repertoire_items (repertoire_id, song_id, position) values ('50000000-0000-0000-0000-000000000701', '41000000-0000-0000-0000-000000000701', 0);
select pg_temp.fails($q$update public.repertoire_items set song_id = '40000000-0000-0000-0000-000000000703' where repertoire_id = '50000000-0000-0000-0000-000000000701'$q$, 'trocar o item para música pessoal', 'P0001', 'song does not belong to the repertoire organization');

insert into public.services (id, organization_id, team_id, name, starts_at, created_by_user_id)
  values ('60000000-0000-0000-0000-000000000701', '10000000-0000-0000-0000-000000000701', '30000000-0000-0000-0000-000000000701', 'Culto', now() + interval '2 days', '00000000-0000-0000-0000-000000000701');
select pg_temp.fails($q$insert into public.service_items (service_id, type, song_id, position) values ('60000000-0000-0000-0000-000000000701', 'song', '40000000-0000-0000-0000-000000000703', 0)$q$, 'item de serviço com música pessoal', 'P0001', 'song does not belong to the service organization');
select pg_temp.fails($q$insert into public.service_items (service_id, type, song_id, position) values ('60000000-0000-0000-0000-000000000701', 'song', '41000000-0000-0000-0000-000000000719', 0)$q$, 'item de serviço com cópia de outro Ministério', 'P0001', 'song does not belong to the service organization');
insert into public.service_items (service_id, type, song_id, position) values ('60000000-0000-0000-0000-000000000701', 'song', '41000000-0000-0000-0000-000000000701', 0);
insert into public.service_items (service_id, type, title, position) values ('60000000-0000-0000-0000-000000000701', 'prayer', 'Oração', 1);

-- Música em uso não é apagada (FK NO ACTION continua protegendo), nem pelo autor.
select pg_temp.as_user('00000000-0000-0000-0000-000000000704');
select pg_temp.fails($q$delete from public.songs where id = '41000000-0000-0000-0000-000000000701'$q$, 'excluir cópia em uso', '23503');

-- NO ACTION × RESTRICT: o cascade da organização só não depende da ordem dos gatilhos de FK
-- com NO ACTION (checado ao fim do comando). RESTRICT (imediato) funcionaria só por sorte de ordem;
-- por isso o teste confere o catálogo (confdeltype 'a') e o comportamento no mesmo comando.
select pg_temp.ok((select count(*) = 2 from pg_constraint
  where conname in ('repertoire_items_song_id_fkey', 'service_items_song_id_fkey') and confdeltype = 'a'),
  'FKs item → música são NO ACTION, não RESTRICT');
-- NO ACTION × RESTRICT: apagar item e música no MESMO comando passa (checado ao fim);
-- com RESTRICT (imediato) falharia. É o que deixa o cascade da organização funcionar.
reset role;
insert into public.songs (user_id, id, organization_id, title, original_key, current_key, lyrics, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000704', '41000000-0000-0000-0000-000000000720', '10000000-0000-0000-0000-000000000701', 'Só no comando', 'C', 'C', 'C', now(), now()),
         ('00000000-0000-0000-0000-000000000704', '41000000-0000-0000-0000-000000000721', '10000000-0000-0000-0000-000000000701', 'Só no comando 2', 'C', 'C', 'C', now(), now());
insert into public.repertoire_items (repertoire_id, song_id, position) values ('50000000-0000-0000-0000-000000000701', '41000000-0000-0000-0000-000000000720', 5);
insert into public.service_items (service_id, type, song_id, position) values ('60000000-0000-0000-0000-000000000701', 'song', '41000000-0000-0000-0000-000000000721', 5);
select pg_temp.affects($q$with d as (delete from public.repertoire_items where song_id = '41000000-0000-0000-0000-000000000720' returning 1) delete from public.songs where id = '41000000-0000-0000-0000-000000000720'$q$, 1, 'NO ACTION: item e música saem no mesmo comando (repertório)');
select pg_temp.affects($q$with d as (delete from public.service_items where song_id = '41000000-0000-0000-0000-000000000721' returning 1) delete from public.songs where id = '41000000-0000-0000-0000-000000000721'$q$, 1, 'NO ACTION: item e música saem no mesmo comando (serviço)');
set local role cantum_user;

-- ---------------------------------------------------------------------------
-- F8 — apagar o Ministério: cópias, repertórios e serviços somem; o pessoal fica
-- ---------------------------------------------------------------------------
-- O Palco é criado pelo Admin: o MD (Admin) não é o Owner que apaga o Ministério, então o cascade
-- não pode depender de quem é o operador nem da ordem dos gatilhos.
select pg_temp.as_user('00000000-0000-0000-0000-000000000702');
select public.create_target_stage_session('60000000-0000-0000-0000-000000000701', '70000000-0000-0000-0000-000000000701');
select pg_temp.ok((select md_user_id = '00000000-0000-0000-0000-000000000702' from public.stage_sessions where id = '70000000-0000-0000-0000-000000000701'), 'MD é o Admin, não o Owner');
reset role;
select pg_temp.ok(pg_temp.raw_count($q$select count(*) from public.songs where organization_id = '10000000-0000-0000-0000-000000000701'$q$) >= 2, 'há cópias do Ministério antes de apagar');
create temp table personal_before on commit drop as
  select count(*) as n from public.songs where organization_id is null;
set local role cantum_user;
select pg_temp.as_user('00000000-0000-0000-0000-000000000702'); -- Admin não apaga
select pg_temp.affects($q$delete from public.organizations where id = '10000000-0000-0000-0000-000000000701'$q$, 0, 'F8 Admin não apaga o Ministério');
select pg_temp.as_user('00000000-0000-0000-0000-000000000701');
select pg_temp.affects($q$delete from public.organizations where id = '10000000-0000-0000-0000-000000000701'$q$, 1, 'F8 Owner apaga o Ministério com repertório, serviço, itens, Palco e cópias');
reset role;
select pg_temp.ok(pg_temp.raw_count($q$select count(*) from public.songs where organization_id = '10000000-0000-0000-0000-000000000701'$q$) = 0, 'cópias do Ministério apagadas');
select pg_temp.ok(pg_temp.raw_count($q$select count(*) from public.repertoires where organization_id = '10000000-0000-0000-0000-000000000701'$q$) = 0
  and pg_temp.raw_count($q$select count(*) from public.services where organization_id = '10000000-0000-0000-0000-000000000701'$q$) = 0
  and pg_temp.raw_count($q$select count(*) from public.repertoire_items where repertoire_id = '50000000-0000-0000-0000-000000000701'$q$) = 0
  and pg_temp.raw_count($q$select count(*) from public.service_items where service_id = '60000000-0000-0000-0000-000000000701'$q$) = 0
  and pg_temp.raw_count($q$select count(*) from public.stage_sessions where id = '70000000-0000-0000-0000-000000000701'$q$) = 0, 'repertórios, serviços, itens e Palco apagados');
select pg_temp.ok((select n from personal_before) = pg_temp.raw_count($q$select count(*) from public.songs where organization_id is null$q$), 'músicas pessoais intactas');
select pg_temp.ok(pg_temp.raw_count($q$select count(*) from public.songs where id = '41000000-0000-0000-0000-000000000719'$q$) = 1, 'outro Ministério intacto');

rollback;
