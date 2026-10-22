-- CANTUM — B6 fatia 5: "preparado" por serviço (service_preparations), RN-15…18, N-B2, N-B3, N-B4, N-B6, N-B7.
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

create function pg_temp.seen() returns integer language sql as $$ select count(*)::integer from public.service_preparations $$;

-- 01 owner · 02 Líder TA · 03 Líder TB · 04 membro TA · 05 Líder inativo TA · 06 membro inativo TA
-- 07 owner de outra org · 08 sem vínculo · 09 admin (fora das equipes) · 10 membro TA
insert into app.users (id, email, display_name) select ('00000000-0000-0000-0000-0000000020' || lpad(n::text, 2, '0'))::uuid, 'p' || n || '@p.local', 'U' || n from generate_series(1, 10) n;
select pg_temp.as_user('00000000-0000-0000-0000-000000002001');
select public.create_organization('10000000-0000-0000-0000-000000002001', 'Ministério P');
select pg_temp.as_user('00000000-0000-0000-0000-000000002007');
select public.create_organization('10000000-0000-0000-0000-000000002007', 'Outro');
select pg_temp.as_user(null);
insert into public.organization_memberships (organization_id, user_id, role)
  select '10000000-0000-0000-0000-000000002001', ('00000000-0000-0000-0000-0000000020' || lpad(n::text, 2, '0'))::uuid,
         case n when 9 then 'admin' else 'member' end
  from generate_series(2, 10) n where n not in (7, 8);
insert into public.teams (id, organization_id, name) values
  ('30000000-0000-0000-0000-000000002001', '10000000-0000-0000-0000-000000002001', 'TA'),
  ('30000000-0000-0000-0000-000000002002', '10000000-0000-0000-0000-000000002001', 'TB');
insert into public.team_memberships (team_id, user_id, role, status) values
  ('30000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000002002', 'leader', 'active'),
  ('30000000-0000-0000-0000-000000002002', '00000000-0000-0000-0000-000000002003', 'leader', 'active'),
  ('30000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000002004', 'member', 'active'),
  ('30000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000002005', 'leader', 'inactive'),
  ('30000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000002006', 'member', 'inactive'),
  ('30000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000002010', 'member', 'active');
insert into public.services (id, organization_id, team_id, name, starts_at, created_by_user_id, status) values
  ('60000000-0000-0000-0000-000000002001', '10000000-0000-0000-0000-000000002001', '30000000-0000-0000-0000-000000002001', 'Draft', now() + interval '1 day', '00000000-0000-0000-0000-000000002001', 'draft'),
  ('60000000-0000-0000-0000-000000002002', '10000000-0000-0000-0000-000000002001', '30000000-0000-0000-0000-000000002001', 'Completed', now(), '00000000-0000-0000-0000-000000002001', 'completed'),
  ('60000000-0000-0000-0000-000000002003', '10000000-0000-0000-0000-000000002001', '30000000-0000-0000-0000-000000002001', 'Cancelled', now(), '00000000-0000-0000-0000-000000002001', 'cancelled'),
  ('60000000-0000-0000-0000-000000002004', '10000000-0000-0000-0000-000000002001', '30000000-0000-0000-0000-000000002001', 'Outro draft', now() + interval '2 day', '00000000-0000-0000-0000-000000002001', 'draft');
-- Preparações antigas em serviços finalizados (semeadas sem RLS).
insert into public.service_preparations (service_id, user_id) values
  ('60000000-0000-0000-0000-000000002002', '00000000-0000-0000-0000-000000002004'),
  ('60000000-0000-0000-0000-000000002003', '00000000-0000-0000-0000-000000002004');

select pg_temp.ok((select relrowsecurity from pg_class where oid = 'public.service_preparations'::regclass), 'RLS ligada');

set local role cantum_user;

-- RN-15/16: membro e Líder ativos marcam o próprio; upsert sem mudança passa; desmarcar apaga.
select pg_temp.as_user('00000000-0000-0000-0000-000000002004');
select pg_temp.affects($$insert into public.service_preparations (service_id, user_id) values ('60000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000002004')$$, 1, 'membro marca o próprio');
select pg_temp.affects($$insert into public.service_preparations (service_id, user_id, prepared_at, updated_at)
  select service_id, user_id, prepared_at, updated_at from public.service_preparations
  where service_id = '60000000-0000-0000-0000-000000002001' and user_id = '00000000-0000-0000-0000-000000002004'
  on conflict (service_id, user_id) do update set prepared_at = excluded.prepared_at, updated_at = excluded.updated_at$$, 1, 'upsert sem mudança (/sync)');
select pg_temp.affects($$update public.service_preparations set user_id = user_id, service_id = service_id, updated_at = now()
  where service_id = '60000000-0000-0000-0000-000000002001'$$, 1, 'update reescrevendo user_id/service_id iguais');
select pg_temp.as_user('00000000-0000-0000-0000-000000002002');
select pg_temp.affects($$insert into public.service_preparations (service_id, user_id) values ('60000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000002002')$$, 1, 'Líder marca o próprio');
select pg_temp.as_user('00000000-0000-0000-0000-000000002010');
select pg_temp.affects($$insert into public.service_preparations (service_id, user_id) values ('60000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000002010')$$, 1, 'outro membro marca o próprio');
select pg_temp.affects($$delete from public.service_preparations where user_id = '00000000-0000-0000-0000-000000002010'$$, 1, 'desmarcar apaga');

-- Guarda: user_id e service_id imutáveis.
select pg_temp.as_user('00000000-0000-0000-0000-000000002004');
select pg_temp.fails($$update public.service_preparations set service_id = '60000000-0000-0000-0000-000000002004' where service_id = '60000000-0000-0000-0000-000000002001'$$, 'service_id alterado', '42501');
select pg_temp.as_user('00000000-0000-0000-0000-000000002002');
select pg_temp.fails($$update public.service_preparations set user_id = '00000000-0000-0000-0000-000000002004' where user_id = '00000000-0000-0000-0000-000000002002'$$, 'user_id alterado', '42501');

-- N-B6: marcar por outra pessoa (Líder, Owner e membro).
select pg_temp.fails($$insert into public.service_preparations (service_id, user_id) values ('60000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000002010')$$, 'Líder marca por outro', '42501');
select pg_temp.as_user('00000000-0000-0000-0000-000000002001');
select pg_temp.fails($$insert into public.service_preparations (service_id, user_id) values ('60000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000002010')$$, 'Owner marca por outro', '42501');
select pg_temp.affects($$delete from public.service_preparations where user_id = '00000000-0000-0000-0000-000000002004'$$, 0, 'Owner desmarca a de outro');
select pg_temp.as_user('00000000-0000-0000-0000-000000002010');
select pg_temp.fails($$insert into public.service_preparations (service_id, user_id) values ('60000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000002004')$$, 'membro marca por outro', '42501');
select pg_temp.affects($$update public.service_preparations set updated_at = now() where user_id = '00000000-0000-0000-0000-000000002004'$$, 0, 'membro altera a de outro');

-- N-B6/RN-17: Membro comum não lê a de outros; Líder, Owner e Admin leem todas.
select pg_temp.ok(pg_temp.seen() = 0, 'membro 10 não vê a de outros');
select pg_temp.as_user('00000000-0000-0000-0000-000000002004');
select pg_temp.ok(pg_temp.seen() = 3 and not exists (select 1 from public.service_preparations where user_id <> '00000000-0000-0000-0000-000000002004'), 'membro 04 só vê as próprias');
select pg_temp.as_user('00000000-0000-0000-0000-000000002002');
select pg_temp.ok(pg_temp.seen() = 4, 'Líder ativo da equipe lê todas');
select pg_temp.as_user('00000000-0000-0000-0000-000000002001');
select pg_temp.ok(pg_temp.seen() = 4, 'Owner lê todas');
select pg_temp.as_user('00000000-0000-0000-0000-000000002009');
select pg_temp.ok(pg_temp.seen() = 4, 'Admin lê todas');
-- Owner e Admin fora da equipe não marcam (não são membros ativos da equipe).
select pg_temp.fails($$insert into public.service_preparations (service_id, user_id) values ('60000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000002009')$$, 'Admin fora da equipe marca', '42501');

-- N-B1: Líder de outra equipe não lê nem marca.
select pg_temp.as_user('00000000-0000-0000-0000-000000002003');
select pg_temp.ok(pg_temp.seen() = 0, 'Líder TB não lê');
select pg_temp.fails($$insert into public.service_preparations (service_id, user_id) values ('60000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000002003')$$, 'Líder TB marca', '42501');

-- N-B4: membro e Líder inativos não marcam nem leem a de outros.
select pg_temp.as_user('00000000-0000-0000-0000-000000002005');
select pg_temp.ok(pg_temp.seen() = 0, 'Líder inativo não lê');
select pg_temp.fails($$insert into public.service_preparations (service_id, user_id) values ('60000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000002005')$$, 'Líder inativo marca', '42501');
select pg_temp.as_user('00000000-0000-0000-0000-000000002006');
select pg_temp.fails($$insert into public.service_preparations (service_id, user_id) values ('60000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000002006')$$, 'membro inativo marca', '42501');

-- N-B2: outra organização; sem vínculo; N-B3: anônimo.
select pg_temp.as_user('00000000-0000-0000-0000-000000002007');
select pg_temp.ok(pg_temp.seen() = 0, 'outra org não lê');
select pg_temp.fails($$insert into public.service_preparations (service_id, user_id) values ('60000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000002007')$$, 'outra org marca', '42501');
select pg_temp.affects($$delete from public.service_preparations$$, 0, 'outra org apaga');
select pg_temp.as_user('00000000-0000-0000-0000-000000002008');
select pg_temp.ok(pg_temp.seen() = 0, 'sem vínculo não lê');
select pg_temp.fails($$insert into public.service_preparations (service_id, user_id) values ('60000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000002008')$$, 'sem vínculo marca', '42501');
select pg_temp.as_user(null);
select pg_temp.ok(pg_temp.seen() = 0, 'anônimo não lê');
select pg_temp.fails($$insert into public.service_preparations (service_id, user_id) values ('60000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000002004')$$, 'anônimo marca', '42501');
select pg_temp.affects($$delete from public.service_preparations$$, 0, 'anônimo apaga');

-- N-B7: serviço completed/cancelled bloqueia marcar, alterar e desmarcar (leitura segue).
select pg_temp.as_user('00000000-0000-0000-0000-000000002010');
select pg_temp.fails($$insert into public.service_preparations (service_id, user_id) values ('60000000-0000-0000-0000-000000002002', '00000000-0000-0000-0000-000000002010')$$, 'marca em completed', '42501');
select pg_temp.fails($$insert into public.service_preparations (service_id, user_id) values ('60000000-0000-0000-0000-000000002003', '00000000-0000-0000-0000-000000002010')$$, 'marca em cancelled', '42501');
select pg_temp.as_user('00000000-0000-0000-0000-000000002004');
select pg_temp.affects($$delete from public.service_preparations where service_id in ('60000000-0000-0000-0000-000000002002', '60000000-0000-0000-0000-000000002003')$$, 0, 'desmarca em serviço final');
select pg_temp.affects($$update public.service_preparations set updated_at = now() where service_id = '60000000-0000-0000-0000-000000002002'$$, 0, 'altera em completed');

-- Exportação: inclui as preparações do titular e nada de outros.
select pg_temp.ok((select jsonb_array_length(j->'service_preparations') = 3
                          and j->'service_preparations' @> '[{"service_id": "60000000-0000-0000-0000-000000002001", "service_name": "Draft"}]'
                   from (select public.export_my_data() as j) e), 'export inclui as preparações do membro');
select pg_temp.as_user('00000000-0000-0000-0000-000000002002');
select pg_temp.ok((select jsonb_array_length(j->'service_preparations') = 1
                          and j->'service_preparations'->0->>'service_id' = '60000000-0000-0000-0000-000000002001'
                   from (select public.export_my_data() as j) e), 'export do Líder só com a dele');

-- Cascata: excluir a conta apaga as preparações do titular.
select pg_temp.as_user('00000000-0000-0000-0000-000000002004');
select set_config('app.session_reauth_at', now()::text, true);
select public.delete_my_account();
select set_config('app.session_reauth_at', '', true);
reset role;
select pg_temp.ok(not exists (select 1 from public.service_preparations where user_id = '00000000-0000-0000-0000-000000002004'), 'cascata ao excluir a conta');
select pg_temp.ok(exists (select 1 from public.service_preparations where user_id = '00000000-0000-0000-0000-000000002002'), 'preparação de outro permanece');

-- Cascata: excluir o serviço apaga as preparações.
delete from public.services where id = '60000000-0000-0000-0000-000000002001';
select pg_temp.ok(not exists (select 1 from public.service_preparations), 'cascata ao excluir o serviço');

rollback;
