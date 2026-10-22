-- CANTUM — B6 fatia 7: materiais por link (materials), RN-22…25, N-B1…B5, N-B7, N-B9, N-B10, ADR-063.
\set ON_ERROR_STOP on
\o /dev/null
begin;

create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('app.user_id', coalesce(p_id, ''), true) $$;

create function pg_temp.ok(p_condition boolean, p_label text) returns void language plpgsql
as $$ begin if not coalesce(p_condition, false) then raise exception 'falhou: %', p_label; end if; end $$;

create function pg_temp.fails(p_sql text, p_label text, p_state text) returns void language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = p_state then return; end if;
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

-- Insere um link no dono indicado (coluna service_id/rehearsal_id/song_id) com a URL dada.
create function pg_temp.link(p_org text, p_col text, p_owner text, p_url text default 'https://youtu.be/x') returns text language sql
as $$ select format('insert into public.materials (organization_id, %I, title, url) values (%L, %L, %L, %L)', p_col, p_org, p_owner, 'Vídeo', p_url) $$;

create function pg_temp.seen() returns integer language sql
as $$ select count(*)::integer from public.materials $$;

-- 01 owner · 02 Líder TA · 03 Líder TB · 04 membro TA · 05 Líder inativo TA · 06 membro inativo TA
-- 07 owner de outra org · 08 sem vínculo · 09 admin (fora das equipes)
insert into app.users (id, email, display_name) select ('00000000-0000-0000-0000-0000000022' || lpad(n::text, 2, '0'))::uuid, 'm' || n || '@m.local', 'U' || n from generate_series(1, 9) n;
select pg_temp.as_user('00000000-0000-0000-0000-000000002201');
select public.create_organization('10000000-0000-0000-0000-000000002201', 'Ministério M');
select pg_temp.as_user('00000000-0000-0000-0000-000000002207');
select public.create_organization('10000000-0000-0000-0000-000000002207', 'Outro');
select pg_temp.as_user(null);
insert into public.organization_memberships (organization_id, user_id, role)
  select '10000000-0000-0000-0000-000000002201', ('00000000-0000-0000-0000-0000000022' || lpad(n::text, 2, '0'))::uuid,
         case n when 9 then 'admin' else 'member' end
  from generate_series(2, 9) n where n not in (7, 8);
insert into public.teams (id, organization_id, name) values
  ('30000000-0000-0000-0000-000000002201', '10000000-0000-0000-0000-000000002201', 'TA'),
  ('30000000-0000-0000-0000-000000002202', '10000000-0000-0000-0000-000000002201', 'TB');
insert into public.team_memberships (team_id, user_id, role, status) values
  ('30000000-0000-0000-0000-000000002201', '00000000-0000-0000-0000-000000002202', 'leader', 'active'),
  ('30000000-0000-0000-0000-000000002202', '00000000-0000-0000-0000-000000002203', 'leader', 'active'),
  ('30000000-0000-0000-0000-000000002201', '00000000-0000-0000-0000-000000002204', 'member', 'active'),
  ('30000000-0000-0000-0000-000000002201', '00000000-0000-0000-0000-000000002205', 'leader', 'inactive'),
  ('30000000-0000-0000-0000-000000002201', '00000000-0000-0000-0000-000000002206', 'member', 'inactive');
-- 01: música da organização · 02: pessoal do owner · 03: música da outra organização
insert into public.songs (user_id, id, organization_id, title, original_key, current_key, lyrics, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000002201', '40000000-0000-0000-0000-000000002201', '10000000-0000-0000-0000-000000002201', 'Maior', 'C', 'C', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000002201', '40000000-0000-0000-0000-000000002202', null, 'Pessoal', 'G', 'G', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000002207', '40000000-0000-0000-0000-000000002203', '10000000-0000-0000-0000-000000002207', 'Alheia', 'D', 'D', 'x', now(), now());
insert into public.services (id, organization_id, team_id, name, starts_at, created_by_user_id, status) values
  ('60000000-0000-0000-0000-000000002201', '10000000-0000-0000-0000-000000002201', '30000000-0000-0000-0000-000000002201', 'Draft', now() + interval '1 day', '00000000-0000-0000-0000-000000002201', 'draft'),
  ('60000000-0000-0000-0000-000000002202', '10000000-0000-0000-0000-000000002201', '30000000-0000-0000-0000-000000002201', 'Completed', now(), '00000000-0000-0000-0000-000000002201', 'completed'),
  ('60000000-0000-0000-0000-000000002203', '10000000-0000-0000-0000-000000002201', '30000000-0000-0000-0000-000000002201', 'Cancelled', now(), '00000000-0000-0000-0000-000000002201', 'cancelled');
insert into public.rehearsals (id, organization_id, service_id, starts_at) values
  ('70000000-0000-0000-0000-000000002201', '10000000-0000-0000-0000-000000002201', '60000000-0000-0000-0000-000000002201', now()),
  ('70000000-0000-0000-0000-000000002202', '10000000-0000-0000-0000-000000002201', '60000000-0000-0000-0000-000000002202', now());
-- Material antigo em serviço finalizado (semeado sem RLS).
insert into public.materials (id, organization_id, service_id, title, url) values
  ('80000000-0000-0000-0000-000000002202', '10000000-0000-0000-0000-000000002201', '60000000-0000-0000-0000-000000002202', 'Antigo', 'https://a.b/c');

select pg_temp.ok((select relrowsecurity from pg_class where oid = 'public.materials'::regclass), 'RLS ligada');

set local role cantum_user;

-- RN-22/24: Líder ativo da equipe anexa em serviço, ensaio e música da organização; edita e exclui.
select pg_temp.as_user('00000000-0000-0000-0000-000000002202');
select pg_temp.affects($$insert into public.materials (id, organization_id, service_id, title, url, notes, created_by)
  values ('80000000-0000-0000-0000-000000002201', '10000000-0000-0000-0000-000000002201', '60000000-0000-0000-0000-000000002201',
          'Playlist', 'https://open.spotify.com/x', 'Ouvir antes', '00000000-0000-0000-0000-000000002201')$$, 1, 'Líder anexa no serviço');
select pg_temp.ok((select created_by from public.materials where id = '80000000-0000-0000-0000-000000002201') = '00000000-0000-0000-0000-000000002202', 'autoria = quem grava');
select pg_temp.affects(pg_temp.link('10000000-0000-0000-0000-000000002201', 'rehearsal_id', '70000000-0000-0000-0000-000000002201'), 1, 'Líder anexa no ensaio');
select pg_temp.affects(pg_temp.link('10000000-0000-0000-0000-000000002201', 'song_id', '40000000-0000-0000-0000-000000002201'), 1, 'Líder anexa na música');
select pg_temp.affects($$update public.materials set title = 'Playlist 2', updated_at = now() where id = '80000000-0000-0000-0000-000000002201'$$, 1, 'Líder edita');
select pg_temp.affects($$insert into public.materials (id, organization_id, service_id, rehearsal_id, song_id, kind, title, url, notes, created_by, created_at, updated_at)
  select id, organization_id, service_id, rehearsal_id, song_id, kind, title, url, notes, created_by, created_at, updated_at from public.materials where id = '80000000-0000-0000-0000-000000002201'
  on conflict (id) do update set organization_id = excluded.organization_id, service_id = excluded.service_id, rehearsal_id = excluded.rehearsal_id,
    song_id = excluded.song_id, kind = excluded.kind, title = excluded.title, url = excluded.url, notes = excluded.notes,
    created_by = excluded.created_by, created_at = excluded.created_at, updated_at = excluded.updated_at$$, 1, 'upsert sem mudança (/sync)');

-- N-B9: URL e campos inválidos; 0 ou 2 donos; música pessoal ou de outra organização.
select pg_temp.fails(pg_temp.link('10000000-0000-0000-0000-000000002201', 'service_id', '60000000-0000-0000-0000-000000002201', 'http://a.b'), 'http', '23514');
select pg_temp.fails(pg_temp.link('10000000-0000-0000-0000-000000002201', 'service_id', '60000000-0000-0000-0000-000000002201', 'javascript:alert(1)'), 'javascript', '23514');
select pg_temp.fails(pg_temp.link('10000000-0000-0000-0000-000000002201', 'service_id', '60000000-0000-0000-0000-000000002201', 'data:text/html,x'), 'data', '23514');
select pg_temp.fails(pg_temp.link('10000000-0000-0000-0000-000000002201', 'service_id', '60000000-0000-0000-0000-000000002201', 'https://a.b/c d'), 'url com espaço', '23514');
select pg_temp.fails(pg_temp.link('10000000-0000-0000-0000-000000002201', 'service_id', '60000000-0000-0000-0000-000000002201', 'https://a.b/' || repeat('x', 2037)), 'url > 2048', '23514');
select pg_temp.affects(pg_temp.link('10000000-0000-0000-0000-000000002201', 'service_id', '60000000-0000-0000-0000-000000002201', 'https://a.b/' || repeat('x', 2036)), 1, 'url = 2048');
select pg_temp.fails(pg_temp.link('10000000-0000-0000-0000-000000002201', 'service_id', '60000000-0000-0000-0000-000000002201', 'https://youtube.com@evil.com/'), 'credenciais na autoridade', '23514');
select pg_temp.fails(pg_temp.link('10000000-0000-0000-0000-000000002201', 'service_id', '60000000-0000-0000-0000-000000002201', 'https://u:p@evil.com'), 'usuário:senha', '23514');
select pg_temp.fails(pg_temp.link('10000000-0000-0000-0000-000000002201', 'service_id', '60000000-0000-0000-0000-000000002201', 'https:///x'), 'sem host', '23514');
select pg_temp.affects(pg_temp.link('10000000-0000-0000-0000-000000002201', 'service_id', '60000000-0000-0000-0000-000000002201', 'https://exemplo.com/a@b'), 1, '@ no caminho');
select pg_temp.affects(pg_temp.link('10000000-0000-0000-0000-000000002201', 'service_id', '60000000-0000-0000-0000-000000002201', 'https://exemplo.com?x=a@b'), 1, '@ na query');
select pg_temp.affects($$delete from public.materials where url like 'https://exemplo.com%'$$, 2, 'limpa @ válidos');
select pg_temp.fails($$update public.materials set title = ' ' where id = '80000000-0000-0000-0000-000000002201'$$, 'título vazio', '23514');
select pg_temp.fails($$update public.materials set title = repeat('x', 121) where id = '80000000-0000-0000-0000-000000002201'$$, 'título > 120', '23514');
select pg_temp.fails($$update public.materials set notes = repeat('x', 501) where id = '80000000-0000-0000-0000-000000002201'$$, 'notas > 500', '23514');
select pg_temp.fails($$update public.materials set kind = 'file' where id = '80000000-0000-0000-0000-000000002201'$$, 'kind file', '23514');
select pg_temp.fails($$insert into public.materials (organization_id, title, url) values ('10000000-0000-0000-0000-000000002201', 'x', 'https://a.b')$$, 'sem dono', '23514');
select pg_temp.fails($$insert into public.materials (organization_id, service_id, rehearsal_id, title, url) values ('10000000-0000-0000-0000-000000002201',
  '60000000-0000-0000-0000-000000002201', '70000000-0000-0000-0000-000000002201', 'x', 'https://a.b')$$, 'dois donos', '23514');
select pg_temp.fails(pg_temp.link('10000000-0000-0000-0000-000000002201', 'song_id', '40000000-0000-0000-0000-000000002202'), 'música pessoal', '23514');
select pg_temp.fails(pg_temp.link('10000000-0000-0000-0000-000000002201', 'song_id', '40000000-0000-0000-0000-000000002203'), 'música de outra org', '23514');

-- N-B10: organization_id incoerente; dono, organização e autoria imutáveis no UPDATE.
select pg_temp.fails(pg_temp.link('10000000-0000-0000-0000-000000002207', 'service_id', '60000000-0000-0000-0000-000000002201'), 'org incoerente (serviço)', '23514');
select pg_temp.fails(pg_temp.link('10000000-0000-0000-0000-000000002207', 'rehearsal_id', '70000000-0000-0000-0000-000000002201'), 'org incoerente (ensaio)', '23514');
select pg_temp.fails($$update public.materials set service_id = null, rehearsal_id = '70000000-0000-0000-0000-000000002201' where id = '80000000-0000-0000-0000-000000002201'$$, 'troca de dono', '42501');
select pg_temp.fails($$update public.materials set organization_id = '10000000-0000-0000-0000-000000002207' where id = '80000000-0000-0000-0000-000000002201'$$, 'troca de org', '42501');
select pg_temp.affects($$update public.materials set created_by = '00000000-0000-0000-0000-000000002201' where id = '80000000-0000-0000-0000-000000002201'$$, 1, 'troca de autoria ignorada');
select pg_temp.ok((select created_by from public.materials where id = '80000000-0000-0000-0000-000000002201') = '00000000-0000-0000-0000-000000002202', 'autoria preservada');
select pg_temp.affects($$update public.materials set created_by = null where id = '80000000-0000-0000-0000-000000002201'$$, 1, 'zerar autoria ignorado');
select pg_temp.ok((select created_by from public.materials where id = '80000000-0000-0000-0000-000000002201') = '00000000-0000-0000-0000-000000002202', 'autoria não zera por PATCH');

-- Owner e Admin gerenciam; Líder de outra equipe só na música (song.edit é L*).
select pg_temp.as_user('00000000-0000-0000-0000-000000002201');
select pg_temp.affects($$update public.materials set notes = 'Owner' where id = '80000000-0000-0000-0000-000000002201'$$, 1, 'Owner edita');
select pg_temp.as_user('00000000-0000-0000-0000-000000002209');
select pg_temp.affects(pg_temp.link('10000000-0000-0000-0000-000000002201', 'rehearsal_id', '70000000-0000-0000-0000-000000002201'), 1, 'Admin anexa');
select pg_temp.affects($$delete from public.materials where created_by = '00000000-0000-0000-0000-000000002209'$$, 1, 'Admin exclui');

-- Leitura: membro ativo lê tudo da organização (1 antigo + serviço + ensaio + música + url 2048).
select pg_temp.as_user('00000000-0000-0000-0000-000000002204');
select pg_temp.ok(pg_temp.seen() = 5, 'membro ativo lê');

-- N-B5: Membro comum não anexa, edita nem exclui.
select pg_temp.fails(pg_temp.link('10000000-0000-0000-0000-000000002201', 'service_id', '60000000-0000-0000-0000-000000002201'), 'membro anexa no serviço', '42501');
select pg_temp.fails(pg_temp.link('10000000-0000-0000-0000-000000002201', 'song_id', '40000000-0000-0000-0000-000000002201'), 'membro anexa na música', '42501');
select pg_temp.affects($$update public.materials set notes = 'x'$$, 0, 'membro edita');
select pg_temp.affects($$delete from public.materials$$, 0, 'membro exclui');

-- N-B1: Líder de outra equipe lê; não grava no serviço/ensaio; na música sim (song.edit).
select pg_temp.as_user('00000000-0000-0000-0000-000000002203');
select pg_temp.ok(pg_temp.seen() = 5, 'Líder TB lê');
select pg_temp.fails(pg_temp.link('10000000-0000-0000-0000-000000002201', 'service_id', '60000000-0000-0000-0000-000000002201'), 'Líder TB anexa no serviço', '42501');
select pg_temp.fails(pg_temp.link('10000000-0000-0000-0000-000000002201', 'rehearsal_id', '70000000-0000-0000-0000-000000002201'), 'Líder TB anexa no ensaio', '42501');
select pg_temp.affects($$update public.materials set notes = 'x' where service_id is not null or rehearsal_id is not null$$, 0, 'Líder TB edita no serviço');
select pg_temp.affects($$delete from public.materials where service_id is not null or rehearsal_id is not null$$, 0, 'Líder TB exclui no serviço');
select pg_temp.affects($$update public.materials set notes = 'TB' where song_id is not null$$, 1, 'Líder TB edita na música');

-- N-B4: Líder e membro inativos não leem nem gravam.
select pg_temp.as_user('00000000-0000-0000-0000-000000002205');
select pg_temp.ok(pg_temp.seen() = 0, 'Líder inativo não lê');
select pg_temp.fails(pg_temp.link('10000000-0000-0000-0000-000000002201', 'service_id', '60000000-0000-0000-0000-000000002201'), 'Líder inativo anexa', '42501');
select pg_temp.fails(pg_temp.link('10000000-0000-0000-0000-000000002201', 'song_id', '40000000-0000-0000-0000-000000002201'), 'Líder inativo anexa na música', '42501');
select pg_temp.affects($$delete from public.materials$$, 0, 'Líder inativo exclui');
select pg_temp.as_user('00000000-0000-0000-0000-000000002206');
select pg_temp.ok(pg_temp.seen() = 0, 'membro inativo não lê');
select pg_temp.fails(pg_temp.link('10000000-0000-0000-0000-000000002201', 'service_id', '60000000-0000-0000-0000-000000002201'), 'membro inativo anexa', '42501');

-- N-B2: outra organização; sem vínculo; N-B3: anônimo.
select pg_temp.as_user('00000000-0000-0000-0000-000000002207');
select pg_temp.ok(pg_temp.seen() = 0, 'outra org não lê');
select pg_temp.fails(pg_temp.link('10000000-0000-0000-0000-000000002201', 'service_id', '60000000-0000-0000-0000-000000002201'), 'outra org anexa', '42501');
select pg_temp.affects($$delete from public.materials$$, 0, 'outra org exclui');
select pg_temp.as_user('00000000-0000-0000-0000-000000002208');
select pg_temp.ok(pg_temp.seen() = 0, 'sem vínculo não lê');
select pg_temp.fails(pg_temp.link('10000000-0000-0000-0000-000000002201', 'song_id', '40000000-0000-0000-0000-000000002201'), 'sem vínculo anexa', '42501');
select pg_temp.as_user(null);
select pg_temp.ok(pg_temp.seen() = 0, 'anônimo não lê');
select pg_temp.fails(pg_temp.link('10000000-0000-0000-0000-000000002201', 'service_id', '60000000-0000-0000-0000-000000002201'), 'anônimo anexa', '42501');
select pg_temp.affects($$update public.materials set notes = 'x'$$, 0, 'anônimo edita');
select pg_temp.affects($$delete from public.materials$$, 0, 'anônimo exclui');

-- N-B7: serviço completed/cancelled bloqueia anexar, editar e excluir (também via ensaio); leitura segue.
select pg_temp.as_user('00000000-0000-0000-0000-000000002201');
select pg_temp.fails(pg_temp.link('10000000-0000-0000-0000-000000002201', 'service_id', '60000000-0000-0000-0000-000000002202'), 'anexa em completed', '42501');
select pg_temp.fails(pg_temp.link('10000000-0000-0000-0000-000000002201', 'service_id', '60000000-0000-0000-0000-000000002203'), 'anexa em cancelled', '42501');
select pg_temp.fails(pg_temp.link('10000000-0000-0000-0000-000000002201', 'rehearsal_id', '70000000-0000-0000-0000-000000002202'), 'anexa em ensaio de completed', '42501');
select pg_temp.affects($$update public.materials set notes = 'x' where id = '80000000-0000-0000-0000-000000002202'$$, 0, 'edita em completed');
select pg_temp.affects($$delete from public.materials where id = '80000000-0000-0000-0000-000000002202'$$, 0, 'exclui em completed');
select pg_temp.as_user('00000000-0000-0000-0000-000000002204');
select pg_temp.ok(exists (select 1 from public.materials where id = '80000000-0000-0000-0000-000000002202'), 'leitura em serviço final');

-- Material não entra em export_my_data (é da organização).
select pg_temp.as_user('00000000-0000-0000-0000-000000002202');
select pg_temp.ok((select not (j ? 'materials') from (select public.export_my_data() as j) e), 'export sem materiais');

-- ADR-063: excluir a conta do autor deixa created_by nulo; o material fica.
select set_config('app.session_reauth_at', now()::text, true);
select public.delete_my_account();
reset role;
select pg_temp.ok((select count(*) from public.materials where created_by is null) = 5
                  and not exists (select 1 from public.materials where created_by = '00000000-0000-0000-0000-000000002202'), 'autoria anonimizada');

-- RN-25: cascatas. Música: exclusão suave pelo Owner (como o app faz) apaga os materiais; upsert sem mudança e restauração passam.
set local role cantum_user;
select pg_temp.as_user('00000000-0000-0000-0000-000000002201');
select pg_temp.affects($$update public.songs set deleted_at = now() where id = '40000000-0000-0000-0000-000000002201'$$, 1, 'exclusão suave da música');
select pg_temp.affects($$update public.songs set deleted_at = deleted_at, title = title where id = '40000000-0000-0000-0000-000000002201'$$, 1, 'upsert sem mudança em música excluída');
select pg_temp.affects($$update public.songs set deleted_at = null where id = '40000000-0000-0000-0000-000000002201'$$, 1, 'restauração da música');
reset role;
select pg_temp.ok(not exists (select 1 from public.materials where song_id is not null), 'exclusão suave apaga materiais da música');
delete from public.rehearsals where id = '70000000-0000-0000-0000-000000002201';
select pg_temp.ok(not exists (select 1 from public.materials where rehearsal_id is not null), 'cascata do ensaio');
delete from public.services where id = '60000000-0000-0000-0000-000000002201';
select pg_temp.ok(not exists (select 1 from public.materials where service_id = '60000000-0000-0000-0000-000000002201'), 'cascata do serviço');

rollback;
