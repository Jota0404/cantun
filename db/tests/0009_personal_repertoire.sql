-- CANTUM — FIX-01 / Fatia C: repertório pessoal e importação (ADR-062, RN-C1, RN-C2).
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

-- o owner 901 · a admin 902 · l Líder de TA 903 · m Membro 904 · i Líder inativo 906 · x estranho 909
insert into app.users (id, email, display_name) values
  ('00000000-0000-0000-0000-000000000901', 'owner@h.local', 'Olga'),
  ('00000000-0000-0000-0000-000000000902', 'admin@h.local', 'Abel'),
  ('00000000-0000-0000-0000-000000000903', 'lider@h.local', 'Lia'),
  ('00000000-0000-0000-0000-000000000904', 'membro@h.local', 'Mauro'),
  ('00000000-0000-0000-0000-000000000906', 'inativo@h.local', 'Ivo'),
  ('00000000-0000-0000-0000-000000000909', 'estranho@h.local', 'Xico');

select pg_temp.as_user('00000000-0000-0000-0000-000000000901');
select public.create_organization('10000000-0000-0000-0000-000000000901', 'Ministério H');
insert into public.teams (id, organization_id, name) values
  ('30000000-0000-0000-0000-000000000901', '10000000-0000-0000-0000-000000000901', 'TA');
select pg_temp.as_user(null);
insert into public.organization_memberships (organization_id, user_id, role)
select '10000000-0000-0000-0000-000000000901', u, 'member' from (values
  ('00000000-0000-0000-0000-000000000902'::uuid), ('00000000-0000-0000-0000-000000000903'),
  ('00000000-0000-0000-0000-000000000904'), ('00000000-0000-0000-0000-000000000906')) v(u);
update public.organization_memberships set role = 'admin'
  where organization_id = '10000000-0000-0000-0000-000000000901' and user_id = '00000000-0000-0000-0000-000000000902';
insert into public.team_memberships (team_id, user_id, role, status) values
  ('30000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000903', 'leader', 'active'),
  ('30000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000904', 'member', 'active'),
  ('30000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000906', 'leader', 'inactive');

-- Lia: músicas pessoais (a terceira apagada) e um repertório pessoal. Mauro e Ivo têm um repertório pessoal cada.
insert into public.songs (user_id, id, title, original_key, current_key, lyrics, created_at, updated_at, deleted_at) values
  ('00000000-0000-0000-0000-000000000903', '41000000-0000-0000-0000-000000000901', 'Um', 'Am', 'Am', 'Am', now(), now(), null),
  ('00000000-0000-0000-0000-000000000903', '41000000-0000-0000-0000-000000000902', 'Dois', 'C', 'C', 'C', now(), now(), null),
  ('00000000-0000-0000-0000-000000000903', '41000000-0000-0000-0000-000000000903', 'Apagada', 'C', 'C', 'C', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000904', '41000000-0000-0000-0000-000000000904', 'Do Mauro', 'C', 'C', 'C', now(), now(), null);
insert into public.repertoires (id, organization_id, name, created_by_user_id) values
  ('50000000-0000-0000-0000-000000000901', null, 'Pessoal da Lia', '00000000-0000-0000-0000-000000000903'),
  ('50000000-0000-0000-0000-000000000902', '10000000-0000-0000-0000-000000000901', 'Do Ministério', '00000000-0000-0000-0000-000000000901'),
  ('50000000-0000-0000-0000-000000000905', null, 'Pessoal do Mauro', '00000000-0000-0000-0000-000000000904');
insert into public.repertoire_items (id, repertoire_id, song_id, position) values
  ('51000000-0000-0000-0000-000000000901', '50000000-0000-0000-0000-000000000901', '41000000-0000-0000-0000-000000000902', 0),
  ('51000000-0000-0000-0000-000000000902', '50000000-0000-0000-0000-000000000901', '41000000-0000-0000-0000-000000000903', 1),
  ('51000000-0000-0000-0000-000000000903', '50000000-0000-0000-0000-000000000901', '41000000-0000-0000-0000-000000000901', 2);

set local role cantum_user;

-- RN-C1: só o dono vê e edita o repertório pessoal e seus itens.
select pg_temp.as_user('00000000-0000-0000-0000-000000000903');
select pg_temp.ok((select count(*) = 1 from public.repertoires where id = '50000000-0000-0000-0000-000000000901'), 'dono vê o pessoal');
select pg_temp.ok((select count(*) = 3 from public.repertoire_items where repertoire_id = '50000000-0000-0000-0000-000000000901'), 'dono vê os itens');
select pg_temp.ok((select count(*) = 0 from public.repertoires where id = '50000000-0000-0000-0000-000000000905'), 'dono não vê o pessoal de outro');
select pg_temp.ok((select count(*) = 1 from public.repertoires where id = '50000000-0000-0000-0000-000000000902'), 'membro vê o da organização');
select pg_temp.affects($q$update public.repertoires set name = 'Renomeado' where id = '50000000-0000-0000-0000-000000000901'$q$, 1, 'dono renomeia');
select pg_temp.affects($q$insert into public.repertoires (id, organization_id, name, created_by_user_id) values ('50000000-0000-0000-0000-000000000903', null, 'Outro pessoal', '00000000-0000-0000-0000-000000000903')$q$, 1, 'dono cria pessoal');
select pg_temp.fails($q$insert into public.repertoires (id, organization_id, name, created_by_user_id) values ('50000000-0000-0000-0000-000000000904', null, 'Em nome de outro', '00000000-0000-0000-0000-000000000904')$q$, 'não cria pessoal em nome de outro', '42501');
select pg_temp.fails($q$update public.repertoires set organization_id = '10000000-0000-0000-0000-000000000901' where id = '50000000-0000-0000-0000-000000000901'$q$, 'não move pessoal para a organização', '42501');
select pg_temp.affects($q$update public.repertoire_items set position = position where repertoire_id = '50000000-0000-0000-0000-000000000901'$q$, 3, 'dono edita itens');
select pg_temp.fails($q$insert into public.repertoire_items (repertoire_id, song_id, position) values ('50000000-0000-0000-0000-000000000901', '41000000-0000-0000-0000-000000000904', 9)$q$, 'música de outro não entra no pessoal', 'P0001');

select pg_temp.as_user('00000000-0000-0000-0000-000000000909'); -- estranho
select pg_temp.ok((select count(*) = 0 from public.repertoires where organization_id is null), 'estranho não vê pessoais');
select pg_temp.ok((select count(*) = 0 from public.repertoire_items), 'estranho não vê itens');
select pg_temp.as_user('00000000-0000-0000-0000-000000000901'); -- Owner não vê o pessoal alheio
select pg_temp.ok((select count(*) = 0 from public.repertoires where organization_id is null), 'Owner não vê pessoal alheio');
select pg_temp.affects($q$update public.repertoires set name = 'x' where id = '50000000-0000-0000-0000-000000000901'$q$, 0, 'Owner não edita pessoal alheio');
select pg_temp.affects($q$delete from public.repertoires where id = '50000000-0000-0000-0000-000000000901'$q$, 0, 'Owner não apaga pessoal alheio');
select pg_temp.affects($q$update public.repertoire_items set position = position where repertoire_id = '50000000-0000-0000-0000-000000000901'$q$, 0, 'Owner não edita itens do pessoal alheio');

-- RN-C2: importação.
select pg_temp.as_user('00000000-0000-0000-0000-000000000904'); -- Membro
select pg_temp.fails($q$select public.import_personal_repertoire('50000000-0000-0000-0000-000000000905', '10000000-0000-0000-0000-000000000901')$q$, 'Membro não importa', 'P0001', 'not authorized to import repertoires into this organization');
select pg_temp.as_user('00000000-0000-0000-0000-000000000906'); -- Líder inativo
select pg_temp.fails($q$select public.import_personal_repertoire('50000000-0000-0000-0000-000000000901', '10000000-0000-0000-0000-000000000901')$q$, 'repertório alheio', 'P0001', 'repertoire not found or not authorized');
select pg_temp.as_user('00000000-0000-0000-0000-000000000903'); -- Líder
select pg_temp.fails($q$select public.import_personal_repertoire('50000000-0000-0000-0000-000000000902', '10000000-0000-0000-0000-000000000901')$q$, 'repertório da organização não é pessoal', 'P0001', 'repertoire not found or not authorized');
select pg_temp.fails($q$select public.import_personal_repertoire('50000000-0000-0000-0000-000000000901', '10000000-0000-0000-0000-0000000009ff')$q$, 'organização alheia', 'P0001', 'not authorized to import repertoires into this organization');
select pg_temp.ok((select (r->>'copied')::int = 2 and (r->>'reused')::int = 0 and jsonb_array_length(r->'items') = 2
                          and (r->'repertoire'->>'id') = '50000000-0000-0000-0000-000000000910'
                   from public.import_personal_repertoire('50000000-0000-0000-0000-000000000901', '10000000-0000-0000-0000-000000000901', '50000000-0000-0000-0000-000000000910') r),
                  'Líder importa: 2 cópias, música apagada pulada');
select pg_temp.ok((select array_agg(s.title order by i.position) = array['Dois', 'Um']
                   from public.repertoire_items i join public.songs s on s.id = i.song_id
                   where i.repertoire_id = '50000000-0000-0000-0000-000000000910'), 'mesma ordem, posições sem buraco');
select pg_temp.ok((select bool_and(s.organization_id = '10000000-0000-0000-0000-000000000901' and s.source_song_id is not null)
                   from public.repertoire_items i join public.songs s on s.id = i.song_id
                   where i.repertoire_id = '50000000-0000-0000-0000-000000000910'), 'itens apontam para cópias da organização');
select pg_temp.ok((select count(*) = 3 from public.repertoire_items where repertoire_id = '50000000-0000-0000-0000-000000000901'), 'pessoal intacto');
select pg_temp.ok((select organization_id is not null from public.repertoires where id = '50000000-0000-0000-0000-000000000910'), 'repertório novo é da organização');
-- Segunda importação reaproveita as cópias.
select pg_temp.ok((select (r->>'copied')::int = 0 and (r->>'reused')::int = 2
                   from public.import_personal_repertoire('50000000-0000-0000-0000-000000000901', '10000000-0000-0000-0000-000000000901') r), 'importar de novo reaproveita');
select pg_temp.ok((select count(*) = 2 from public.songs where organization_id = '10000000-0000-0000-0000-000000000901'), 'sem cópias duplicadas');
-- Editar a cópia não altera a pessoal.
update public.songs set title = 'Um (Ministério)' where organization_id = '10000000-0000-0000-0000-000000000901' and source_song_id = '41000000-0000-0000-0000-000000000901';
select pg_temp.ok((select title = 'Um' from public.songs where id = '41000000-0000-0000-0000-000000000901'), 'editar a cópia não muda a pessoal');
select pg_temp.as_user('00000000-0000-0000-0000-000000000902'); -- Admin importa o próprio pessoal (vazio)
insert into public.repertoires (id, organization_id, name, created_by_user_id) values ('50000000-0000-0000-0000-000000000906', null, 'Da Abel', '00000000-0000-0000-0000-000000000902');
select pg_temp.ok((select (r->>'copied')::int = 0 and jsonb_array_length(r->'items') = 0
                   from public.import_personal_repertoire('50000000-0000-0000-0000-000000000906', '10000000-0000-0000-0000-000000000901') r), 'Admin importa');
select pg_temp.as_user('00000000-0000-0000-0000-000000000901'); -- Owner
insert into public.repertoires (id, organization_id, name, created_by_user_id) values ('50000000-0000-0000-0000-000000000907', null, 'Da Olga', '00000000-0000-0000-0000-000000000901');
select pg_temp.ok((select (r->>'copied')::int = 0 from public.import_personal_repertoire('50000000-0000-0000-0000-000000000907', '10000000-0000-0000-0000-000000000901') r), 'Owner importa');

-- Cascade: apagar a organização apaga repertórios e cópias e preserva os pessoais.
reset role;
delete from public.organizations where id = '10000000-0000-0000-0000-000000000901';
select pg_temp.ok((select count(*) = 0 from public.repertoires where organization_id = '10000000-0000-0000-0000-000000000901'), 'cascade apaga repertórios da organização');
select pg_temp.ok((select count(*) = 0 from public.songs where organization_id = '10000000-0000-0000-0000-000000000901'), 'cascade apaga as cópias');
select pg_temp.ok((select count(*) = 5 from public.repertoires where organization_id is null and created_by_user_id in ('00000000-0000-0000-0000-000000000903', '00000000-0000-0000-0000-000000000904', '00000000-0000-0000-0000-000000000902', '00000000-0000-0000-0000-000000000901')), 'cascade preserva repertórios pessoais');
select pg_temp.ok((select count(*) = 2 from public.songs where user_id = '00000000-0000-0000-0000-000000000903' and organization_id is null and deleted_at is null), 'cascade preserva a biblioteca');
rollback;
