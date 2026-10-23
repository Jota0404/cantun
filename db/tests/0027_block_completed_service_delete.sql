-- CANTUM — Serviço concluído não se exclui (0027); quem pode excluir os demais não muda; cascatas seguem.
\set ON_ERROR_STOP on
\o /dev/null
begin;

create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('app.user_id', coalesce(p_id, ''), true), set_config('app.session_reauth_at', now()::text, true) $$;

create function pg_temp.ok(p_condition boolean, p_label text) returns void language plpgsql
as $$ begin if not coalesce(p_condition, false) then raise exception 'falhou: %', p_label; end if; end $$;

-- Linhas apagadas pelo usuário atual (RLS); erro vira exceção do teste.
create function pg_temp.deleted(p_id uuid) returns integer language plpgsql
as $$ declare n integer; begin delete from public.services where id = p_id; get diagnostics n = row_count; return n; end $$;

create function pg_temp.blocked(p_id uuid, p_label text) returns void language plpgsql
as $$
begin
  begin
    delete from public.services where id = p_id;
  exception when others then
    if sqlstate = '42501' and sqlerrm = 'completed service cannot be deleted' then return; end if;
    raise exception '%: erro inesperado % "%"', p_label, sqlstate, sqlerrm;
  end;
  raise exception 'deveria falhar: %', p_label;
end $$;

-- 01 owner · 02 admin · 03 Líder TA · 04 membro TA · 05 Líder inativo TA · 06 owner de outra org · 07 sem vínculo
insert into app.users (id, email, display_name)
  select ('00000000-0000-0000-0000-0000000027' || lpad(n::text, 2, '0'))::uuid, 'k' || n || '@k.local', 'U' || n from generate_series(1, 7) n;
select pg_temp.as_user('00000000-0000-0000-0000-000000002701');
select public.create_organization('10000000-0000-0000-0000-000000002701', 'Ministério K');
select pg_temp.as_user('00000000-0000-0000-0000-000000002706');
select public.create_organization('10000000-0000-0000-0000-000000002706', 'Outro');
select pg_temp.as_user(null);
insert into public.organization_memberships (organization_id, user_id, role)
  select '10000000-0000-0000-0000-000000002701', ('00000000-0000-0000-0000-0000000027' || lpad(n::text, 2, '0'))::uuid,
         case n when 2 then 'admin' else 'member' end
  from generate_series(2, 5) n;
insert into public.teams (id, organization_id, name) values ('30000000-0000-0000-0000-000000002701', '10000000-0000-0000-0000-000000002701', 'TA');
insert into public.team_memberships (team_id, user_id, role, status) values
  ('30000000-0000-0000-0000-000000002701', '00000000-0000-0000-0000-000000002703', 'leader', 'active'),
  ('30000000-0000-0000-0000-000000002701', '00000000-0000-0000-0000-000000002704', 'member', 'active'),
  ('30000000-0000-0000-0000-000000002701', '00000000-0000-0000-0000-000000002705', 'leader', 'inactive');

-- Serviços 6000…27ss: s = 1..5 por status (draft, ready, in_progress, cancelled, completed), um bloco por ator (a = 1..3).
insert into public.services (id, organization_id, team_id, name, starts_at, created_by_user_id, status)
select ('60000000-0000-0000-0000-0000000027' || a || s)::uuid, '10000000-0000-0000-0000-000000002701', '30000000-0000-0000-0000-000000002701',
       'S' || a || s, now(), '00000000-0000-0000-0000-000000002702',
       (array['draft', 'ready', 'in_progress', 'cancelled', 'completed'])[s]
from generate_series(1, 3) a, generate_series(1, 5) s;
insert into public.service_executions (service_id, organization_id, completed_by_user_id)
  select ('60000000-0000-0000-0000-0000000027' || a || '5')::uuid, '10000000-0000-0000-0000-000000002701', '00000000-0000-0000-0000-000000002701'
  from generate_series(1, 3) a;

set local role cantum_user;

-- Owner e Admin: draft/ready/in_progress/cancelled saem; completed é recusado com erro claro.
select pg_temp.as_user('00000000-0000-0000-0000-000000002701');
select pg_temp.ok(pg_temp.deleted(('60000000-0000-0000-0000-00000000271' || s)::uuid) = 1, 'Owner exclui status ' || s) from generate_series(1, 4) s;
select pg_temp.blocked('60000000-0000-0000-0000-000000002715', 'Owner não exclui concluído');
select pg_temp.as_user('00000000-0000-0000-0000-000000002702');
select pg_temp.ok(pg_temp.deleted(('60000000-0000-0000-0000-00000000272' || s)::uuid) = 1, 'Admin exclui status ' || s) from generate_series(1, 4) s;
select pg_temp.blocked('60000000-0000-0000-0000-000000002725', 'Admin não exclui concluído');

-- Líder: só draft (regra anterior, inalterada); concluído não sai (0 linhas).
select pg_temp.as_user('00000000-0000-0000-0000-000000002703');
select pg_temp.ok(pg_temp.deleted('60000000-0000-0000-0000-000000002731') = 1, 'Líder exclui draft');
select pg_temp.ok(pg_temp.deleted(('60000000-0000-0000-0000-00000000273' || s)::uuid) = 0, 'Líder não exclui status ' || s) from generate_series(2, 5) s;

-- Membro, Líder inativo, outra org e sem vínculo: 0 linhas, sem revelar o status.
select pg_temp.as_user(u), pg_temp.ok(pg_temp.deleted(('60000000-0000-0000-0000-00000000273' || s)::uuid) = 0, u || ' não exclui status ' || s)
from unnest(array['00000000-0000-0000-0000-000000002704', '00000000-0000-0000-0000-000000002705',
                  '00000000-0000-0000-0000-000000002706', '00000000-0000-0000-0000-000000002707']) u, generate_series(2, 5) s;
reset role;

-- Anônimo nem chega à tabela.
set local role cantum_anon;
do $$ begin
  begin delete from public.services; exception when insufficient_privilege then return; end;
  raise exception 'anônimo deveria ser negado';
end $$;
reset role;

-- Registros de execução preservados.
select pg_temp.ok((select count(*) from public.services where status = 'completed' and organization_id = '10000000-0000-0000-0000-000000002701') = 3, 'concluídos preservados');
select pg_temp.ok((select count(*) from public.service_executions where organization_id = '10000000-0000-0000-0000-000000002701') = 3, 'registros preservados');

-- Exclusão de conta (ADR-063): o Admin, autor dos concluídos, sai; o serviço fica com o sentinela.
set local role cantum_user;
select pg_temp.as_user('00000000-0000-0000-0000-000000002702');
select public.delete_my_account();
reset role;
select pg_temp.ok((select count(*) from public.services where status = 'completed' and organization_id = '10000000-0000-0000-0000-000000002701' and created_by_user_id = app.deleted_user_id()) = 3, 'conta excluída, concluídos ficam');

-- Exclusão da organização: a cascata apaga serviço concluído e registro.
set local role cantum_user;
select pg_temp.as_user('00000000-0000-0000-0000-000000002701');
delete from public.organizations where id = '10000000-0000-0000-0000-000000002701';
reset role;
select pg_temp.ok(not exists (select 1 from public.organizations where id = '10000000-0000-0000-0000-000000002701'), 'organização excluída');
select pg_temp.ok(not exists (select 1 from public.services where organization_id = '10000000-0000-0000-0000-000000002701'), 'cascata apaga serviços');
select pg_temp.ok(not exists (select 1 from public.service_executions where organization_id = '10000000-0000-0000-0000-000000002701'), 'cascata apaga registros');

rollback;
