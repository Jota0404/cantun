-- CANTUM — B6 fatia 6: ensaio (rehearsals, rehearsal_songs), RN-19…21, N-B1…B5, N-B7, N-B8, N-B10.
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

create function pg_temp.seen() returns integer language sql
as $$ select (select count(*)::integer from public.rehearsals) + (select count(*)::integer from public.rehearsal_songs) $$;

-- 01 owner · 02 Líder TA · 03 Líder TB · 04 membro TA · 05 Líder inativo TA · 06 membro inativo TA
-- 07 owner de outra org · 08 sem vínculo · 09 admin (fora das equipes)
insert into app.users (id, email, display_name) select ('00000000-0000-0000-0000-0000000021' || lpad(n::text, 2, '0'))::uuid, 'r' || n || '@r.local', 'U' || n from generate_series(1, 9) n;
select pg_temp.as_user('00000000-0000-0000-0000-000000002101');
select public.create_organization('10000000-0000-0000-0000-000000002101', 'Ministério R');
select pg_temp.as_user('00000000-0000-0000-0000-000000002107');
select public.create_organization('10000000-0000-0000-0000-000000002107', 'Outro');
select pg_temp.as_user(null);
insert into public.organization_memberships (organization_id, user_id, role)
  select '10000000-0000-0000-0000-000000002101', ('00000000-0000-0000-0000-0000000021' || lpad(n::text, 2, '0'))::uuid,
         case n when 9 then 'admin' else 'member' end
  from generate_series(2, 9) n where n not in (7, 8);
insert into public.teams (id, organization_id, name) values
  ('30000000-0000-0000-0000-000000002101', '10000000-0000-0000-0000-000000002101', 'TA'),
  ('30000000-0000-0000-0000-000000002102', '10000000-0000-0000-0000-000000002101', 'TB');
insert into public.team_memberships (team_id, user_id, role, status) values
  ('30000000-0000-0000-0000-000000002101', '00000000-0000-0000-0000-000000002102', 'leader', 'active'),
  ('30000000-0000-0000-0000-000000002102', '00000000-0000-0000-0000-000000002103', 'leader', 'active'),
  ('30000000-0000-0000-0000-000000002101', '00000000-0000-0000-0000-000000002104', 'member', 'active'),
  ('30000000-0000-0000-0000-000000002101', '00000000-0000-0000-0000-000000002105', 'leader', 'inactive'),
  ('30000000-0000-0000-0000-000000002101', '00000000-0000-0000-0000-000000002106', 'member', 'inactive');
insert into public.songs (user_id, id, organization_id, title, original_key, current_key, lyrics, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000002101', '40000000-0000-0000-0000-000000002101', '10000000-0000-0000-0000-000000002101', 'Maior', 'C', 'C', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000002101', '40000000-0000-0000-0000-000000002102', '10000000-0000-0000-0000-000000002101', 'Outra', 'G', 'G', 'x', now(), now());
insert into public.services (id, organization_id, team_id, name, starts_at, created_by_user_id, status) values
  ('60000000-0000-0000-0000-000000002101', '10000000-0000-0000-0000-000000002101', '30000000-0000-0000-0000-000000002101', 'Draft', now() + interval '1 day', '00000000-0000-0000-0000-000000002101', 'draft'),
  ('60000000-0000-0000-0000-000000002102', '10000000-0000-0000-0000-000000002101', '30000000-0000-0000-0000-000000002101', 'Completed', now(), '00000000-0000-0000-0000-000000002101', 'completed'),
  ('60000000-0000-0000-0000-000000002103', '10000000-0000-0000-0000-000000002101', '30000000-0000-0000-0000-000000002101', 'Cancelled', now(), '00000000-0000-0000-0000-000000002101', 'cancelled'),
  ('60000000-0000-0000-0000-000000002104', '10000000-0000-0000-0000-000000002101', '30000000-0000-0000-0000-000000002101', 'Outro draft', now() + interval '2 day', '00000000-0000-0000-0000-000000002101', 'draft');
insert into public.service_items (id, service_id, type, song_id, title, position) values
  ('61000000-0000-0000-0000-000000002101', '60000000-0000-0000-0000-000000002101', 'song', '40000000-0000-0000-0000-000000002101', null, 0),
  ('61000000-0000-0000-0000-000000002102', '60000000-0000-0000-0000-000000002101', 'prayer', null, 'Oração', 1),
  ('61000000-0000-0000-0000-000000002103', '60000000-0000-0000-0000-000000002101', 'song', '40000000-0000-0000-0000-000000002102', null, 2),
  ('61000000-0000-0000-0000-000000002104', '60000000-0000-0000-0000-000000002104', 'song', '40000000-0000-0000-0000-000000002101', null, 0),
  ('61000000-0000-0000-0000-000000002105', '60000000-0000-0000-0000-000000002102', 'song', '40000000-0000-0000-0000-000000002101', null, 0);
-- Ensaios antigos em serviços finalizados (semeados sem RLS).
insert into public.rehearsals (id, organization_id, service_id, starts_at) values
  ('70000000-0000-0000-0000-000000002102', '10000000-0000-0000-0000-000000002101', '60000000-0000-0000-0000-000000002102', now()),
  ('70000000-0000-0000-0000-000000002103', '10000000-0000-0000-0000-000000002101', '60000000-0000-0000-0000-000000002103', now());

select pg_temp.ok((select relrowsecurity from pg_class where oid = 'public.rehearsals'::regclass)
                  and (select relrowsecurity from pg_class where oid = 'public.rehearsal_songs'::regclass), 'RLS ligada');

set local role cantum_user;

-- RN-19/20: Líder ativo da equipe cria, edita, foca músicas e exclui; upsert sem mudança passa.
select pg_temp.as_user('00000000-0000-0000-0000-000000002102');
select pg_temp.affects($$insert into public.rehearsals (id, organization_id, service_id, starts_at, location, notes)
  values ('70000000-0000-0000-0000-000000002101', '10000000-0000-0000-0000-000000002101', '60000000-0000-0000-0000-000000002101', now() - interval '1 day', 'Sala 2', 'Trazer capo')$$, 1, 'Líder cria (antes do serviço)');
select pg_temp.affects($$update public.rehearsals set location = 'Sala 3', updated_at = now() where id = '70000000-0000-0000-0000-000000002101'$$, 1, 'Líder edita');
select pg_temp.affects($$insert into public.rehearsals (id, organization_id, service_id, starts_at, location, notes, created_at, updated_at)
  select id, organization_id, service_id, starts_at, location, notes, created_at, updated_at from public.rehearsals where id = '70000000-0000-0000-0000-000000002101'
  on conflict (id) do update set organization_id = excluded.organization_id, service_id = excluded.service_id, starts_at = excluded.starts_at,
    location = excluded.location, notes = excluded.notes, created_at = excluded.created_at, updated_at = excluded.updated_at$$, 1, 'upsert sem mudança (/sync)');
select pg_temp.affects($$insert into public.rehearsal_songs (rehearsal_id, service_item_id) values
  ('70000000-0000-0000-0000-000000002101', '61000000-0000-0000-0000-000000002101'),
  ('70000000-0000-0000-0000-000000002101', '61000000-0000-0000-0000-000000002103')$$, 2, 'Líder foca músicas');
select pg_temp.affects($$insert into public.rehearsal_songs (rehearsal_id, service_item_id) values ('70000000-0000-0000-0000-000000002101', '61000000-0000-0000-0000-000000002101')
  on conflict (rehearsal_id, service_item_id) do update set rehearsal_id = excluded.rehearsal_id, service_item_id = excluded.service_item_id$$, 1, 'upsert de foco sem mudança');
select pg_temp.fails($$insert into public.rehearsal_songs (rehearsal_id, service_item_id) values ('70000000-0000-0000-0000-000000002101', '61000000-0000-0000-0000-000000002101')$$, 'música repetida', '23505');
select pg_temp.affects($$delete from public.rehearsal_songs where service_item_id = '61000000-0000-0000-0000-000000002103'$$, 1, 'Líder tira foco');
select pg_temp.fails($$update public.rehearsals set location = repeat('x', 121) where id = '70000000-0000-0000-0000-000000002101'$$, 'location > 120', '23514');

-- N-B8: item de outro serviço, item não song, troca do item por um inválido.
select pg_temp.fails($$insert into public.rehearsal_songs (rehearsal_id, service_item_id) values ('70000000-0000-0000-0000-000000002101', '61000000-0000-0000-0000-000000002104')$$, 'item de outro serviço', '23514');
select pg_temp.fails($$insert into public.rehearsal_songs (rehearsal_id, service_item_id) values ('70000000-0000-0000-0000-000000002101', '61000000-0000-0000-0000-000000002102')$$, 'item não song', '23514');
select pg_temp.fails($$update public.rehearsal_songs set service_item_id = '61000000-0000-0000-0000-000000002102' where rehearsal_id = '70000000-0000-0000-0000-000000002101'$$, 'troca para item não song', '23514');
select pg_temp.fails($$update public.service_items set type = 'prayer', song_id = null, title = 'x' where id = '61000000-0000-0000-0000-000000002101'$$, 'item em foco vira prayer', '23514');
select pg_temp.fails($$update public.service_items set service_id = '60000000-0000-0000-0000-000000002104' where id = '61000000-0000-0000-0000-000000002101'$$, 'item em foco muda de serviço', '23514');
select pg_temp.affects($$insert into public.rehearsal_songs (rehearsal_id, service_item_id) values ('70000000-0000-0000-0000-000000002101', '61000000-0000-0000-0000-000000002101') on conflict do nothing$$, 0, 'reenvio idêntico (/sync)');

-- N-B10: organization_id incoerente; serviço e organização imutáveis.
select pg_temp.fails($$insert into public.rehearsals (organization_id, service_id, starts_at) values ('10000000-0000-0000-0000-000000002107', '60000000-0000-0000-0000-000000002101', now())$$, 'organização incoerente', '23514');
select pg_temp.fails($$update public.rehearsals set service_id = '60000000-0000-0000-0000-000000002104' where id = '70000000-0000-0000-0000-000000002101'$$, 'troca de serviço', '42501');

-- Owner e Admin gerenciam.
select pg_temp.as_user('00000000-0000-0000-0000-000000002101');
select pg_temp.affects($$update public.rehearsals set notes = 'Owner' where id = '70000000-0000-0000-0000-000000002101'$$, 1, 'Owner edita');
select pg_temp.as_user('00000000-0000-0000-0000-000000002109');
select pg_temp.affects($$insert into public.rehearsals (id, organization_id, service_id, starts_at) values ('70000000-0000-0000-0000-000000002109', '10000000-0000-0000-0000-000000002101', '60000000-0000-0000-0000-000000002104', now())$$, 1, 'Admin cria');
select pg_temp.affects($$delete from public.rehearsals where id = '70000000-0000-0000-0000-000000002109'$$, 1, 'Admin exclui');

-- Leitura: membro ativo lê ensaios e músicas em foco (3 ensaios + 1 foco).
select pg_temp.as_user('00000000-0000-0000-0000-000000002104');
select pg_temp.ok(pg_temp.seen() = 4, 'membro ativo lê');

-- N-B5: Membro comum não cria, edita, foca nem exclui.
select pg_temp.fails($$insert into public.rehearsals (organization_id, service_id, starts_at) values ('10000000-0000-0000-0000-000000002101', '60000000-0000-0000-0000-000000002101', now())$$, 'membro cria', '42501');
select pg_temp.affects($$update public.rehearsals set notes = 'x'$$, 0, 'membro edita');
select pg_temp.fails($$insert into public.rehearsal_songs (rehearsal_id, service_item_id) values ('70000000-0000-0000-0000-000000002101', '61000000-0000-0000-0000-000000002103')$$, 'membro foca', '42501');
select pg_temp.affects($$delete from public.rehearsal_songs$$, 0, 'membro tira foco');
select pg_temp.affects($$delete from public.rehearsals$$, 0, 'membro exclui');

-- N-B1: Líder de outra equipe lê (ativo na organização), mas não grava.
select pg_temp.as_user('00000000-0000-0000-0000-000000002103');
select pg_temp.ok(pg_temp.seen() = 4, 'Líder TB lê');
select pg_temp.fails($$insert into public.rehearsals (organization_id, service_id, starts_at) values ('10000000-0000-0000-0000-000000002101', '60000000-0000-0000-0000-000000002101', now())$$, 'Líder TB cria', '42501');
select pg_temp.affects($$update public.rehearsals set notes = 'x'$$, 0, 'Líder TB edita');
select pg_temp.fails($$insert into public.rehearsal_songs (rehearsal_id, service_item_id) values ('70000000-0000-0000-0000-000000002101', '61000000-0000-0000-0000-000000002103')$$, 'Líder TB foca', '42501');
select pg_temp.affects($$delete from public.rehearsals$$, 0, 'Líder TB exclui');

-- N-B4: Líder e membro inativos (inativos também na organização) não leem nem gravam.
select pg_temp.as_user('00000000-0000-0000-0000-000000002105');
select pg_temp.ok(pg_temp.seen() = 0, 'Líder inativo não lê');
select pg_temp.fails($$insert into public.rehearsals (organization_id, service_id, starts_at) values ('10000000-0000-0000-0000-000000002101', '60000000-0000-0000-0000-000000002101', now())$$, 'Líder inativo cria', '42501');
select pg_temp.affects($$delete from public.rehearsals$$, 0, 'Líder inativo exclui');
select pg_temp.as_user('00000000-0000-0000-0000-000000002106');
select pg_temp.ok(pg_temp.seen() = 0, 'membro inativo não lê');
select pg_temp.fails($$insert into public.rehearsals (organization_id, service_id, starts_at) values ('10000000-0000-0000-0000-000000002101', '60000000-0000-0000-0000-000000002101', now())$$, 'membro inativo cria', '42501');

-- N-B2: outra organização; sem vínculo; N-B3: anônimo.
select pg_temp.as_user('00000000-0000-0000-0000-000000002107');
select pg_temp.ok(pg_temp.seen() = 0, 'outra org não lê');
select pg_temp.fails($$insert into public.rehearsals (organization_id, service_id, starts_at) values ('10000000-0000-0000-0000-000000002101', '60000000-0000-0000-0000-000000002101', now())$$, 'outra org cria', '42501');
select pg_temp.fails($$insert into public.rehearsal_songs (rehearsal_id, service_item_id) values ('70000000-0000-0000-0000-000000002101', '61000000-0000-0000-0000-000000002103')$$, 'outra org foca', '42501');
select pg_temp.affects($$delete from public.rehearsals$$, 0, 'outra org exclui');
select pg_temp.as_user('00000000-0000-0000-0000-000000002108');
select pg_temp.ok(pg_temp.seen() = 0, 'sem vínculo não lê');
select pg_temp.fails($$insert into public.rehearsals (organization_id, service_id, starts_at) values ('10000000-0000-0000-0000-000000002101', '60000000-0000-0000-0000-000000002101', now())$$, 'sem vínculo cria', '42501');
select pg_temp.as_user(null);
select pg_temp.ok(pg_temp.seen() = 0, 'anônimo não lê');
select pg_temp.fails($$insert into public.rehearsals (organization_id, service_id, starts_at) values ('10000000-0000-0000-0000-000000002101', '60000000-0000-0000-0000-000000002101', now())$$, 'anônimo cria', '42501');
select pg_temp.affects($$update public.rehearsals set notes = 'x'$$, 0, 'anônimo edita');
select pg_temp.affects($$delete from public.rehearsal_songs$$, 0, 'anônimo tira foco');

-- N-B7: serviço completed/cancelled bloqueia criar, editar starts_at, focar e excluir (leitura segue).
select pg_temp.as_user('00000000-0000-0000-0000-000000002101');
select pg_temp.fails($$insert into public.rehearsals (organization_id, service_id, starts_at) values ('10000000-0000-0000-0000-000000002101', '60000000-0000-0000-0000-000000002102', now())$$, 'cria em completed', '42501');
select pg_temp.fails($$insert into public.rehearsals (organization_id, service_id, starts_at) values ('10000000-0000-0000-0000-000000002101', '60000000-0000-0000-0000-000000002103', now())$$, 'cria em cancelled', '42501');
select pg_temp.affects($$update public.rehearsals set starts_at = now() + interval '1 hour' where service_id in ('60000000-0000-0000-0000-000000002102', '60000000-0000-0000-0000-000000002103')$$, 0, 'edita starts_at em serviço final');
select pg_temp.fails($$insert into public.rehearsal_songs (rehearsal_id, service_item_id) values ('70000000-0000-0000-0000-000000002102', '61000000-0000-0000-0000-000000002105')$$, 'foca em completed', '42501');
select pg_temp.affects($$delete from public.rehearsals where service_id in ('60000000-0000-0000-0000-000000002102', '60000000-0000-0000-0000-000000002103')$$, 0, 'exclui em serviço final');
select pg_temp.as_user('00000000-0000-0000-0000-000000002104');
select pg_temp.ok((select count(*) from public.rehearsals where service_id = '60000000-0000-0000-0000-000000002102') = 1, 'leitura em serviço final');

-- RN-21: excluir o item tira o foco; excluir o serviço apaga ensaios e focos.
reset role;
delete from public.service_items where id = '61000000-0000-0000-0000-000000002101';
select pg_temp.ok(not exists (select 1 from public.rehearsal_songs), 'cascata ao excluir o item');
insert into public.rehearsal_songs (rehearsal_id, service_item_id) values ('70000000-0000-0000-0000-000000002101', '61000000-0000-0000-0000-000000002103');
delete from public.services where id = '60000000-0000-0000-0000-000000002101';
select pg_temp.ok(not exists (select 1 from public.rehearsals where service_id = '60000000-0000-0000-0000-000000002101')
                  and not exists (select 1 from public.rehearsal_songs), 'cascata ao excluir o serviço');

-- Ensaio não entra em export_my_data (é da organização, sem dado pessoal).
set local role cantum_user;
select pg_temp.as_user('00000000-0000-0000-0000-000000002102');
select pg_temp.ok((select not (j ? 'rehearsals') from (select public.export_my_data() as j) e), 'export sem ensaios');

rollback;
