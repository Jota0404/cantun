-- CANTUM — B8 fatia 9: reautenticação para excluir a conta (VS-07 RN-04, ADR-065; R1, R5, R7, R8 e caminho feliz).
\set ON_ERROR_STOP on
\o /dev/null
begin;

create function pg_temp.as_user(p_id text, p_reauth text) returns void language sql
as $$ select set_config('app.user_id', coalesce(p_id, ''), true), set_config('app.session_reauth_at', coalesce(p_reauth, ''), true) $$;

create function pg_temp.ok(p_condition boolean, p_label text) returns void language plpgsql
as $$ begin if not coalesce(p_condition, false) then raise exception 'falhou: %', p_label; end if; end $$;

-- Falha esperada com a mensagem exata e o SQLSTATE 42501.
create function pg_temp.reauth_required(p_sql text, p_label text) returns void language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = '42501' and sqlerrm = 'recent authentication required' then return; end if;
    raise exception 'erro errado em %: % % (esperado 42501 recent authentication required)', p_label, sqlstate, sqlerrm;
  end;
  raise exception 'deveria exigir reautenticação: %', p_label;
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

insert into app.users (id, email, display_name, email_verified_at) values
  ('00000000-0000-0000-0000-0000000c1901', 'ana@c19.local', 'Ana', now()),
  ('00000000-0000-0000-0000-0000000c1902', 'bia@c19.local', 'Bia', now());

select pg_temp.ok((select data_type = 'timestamp with time zone' and is_nullable = 'YES' from information_schema.columns
                   where table_schema = 'app' and table_name = 'sessions' and column_name = 'reauth_at'), 'sessions.reauth_at é timestamptz nulo');

-- R1: nunca reautenticou (ausente, vazio, ilegível) — nada muda.
set local role cantum_user;
select pg_temp.as_user('00000000-0000-0000-0000-0000000c1901', null);
select pg_temp.reauth_required('select public.delete_my_account()', 'R1: vazio');
select pg_temp.as_user('00000000-0000-0000-0000-0000000c1901', 'lixo');
select pg_temp.reauth_required('select public.delete_my_account()', 'R1: valor ilegível');
-- Instante no futuro também não vale.
select pg_temp.as_user('00000000-0000-0000-0000-0000000c1901', (now() + interval '1 hour')::text);
select pg_temp.reauth_required('select public.delete_my_account()', 'reauth no futuro');

-- R5: janela expirada (> 5 min).
select pg_temp.as_user('00000000-0000-0000-0000-0000000c1901', (now() - interval '5 minutes 1 second')::text);
select pg_temp.reauth_required('select public.delete_my_account()', 'R5: expirada');
select pg_temp.as_user('00000000-0000-0000-0000-0000000c1901', (now() - interval '1 day')::text);
select pg_temp.reauth_required('select public.delete_my_account()', 'R5: ontem');
reset role;
select pg_temp.ok(exists (select 1 from app.users where id = '00000000-0000-0000-0000-0000000c1901'), 'recusas não alteraram a conta');

-- R7: o cliente não forja o fato. A RPC não recebe parâmetro e o papel do cliente não toca app.sessions
-- (o servidor só chama funções da allowlist; ver o teste de servidor R7).
select pg_temp.ok((select pronargs = 0 from pg_proc where oid = 'public.delete_my_account()'::regprocedure), 'R7: delete_my_account não recebe parâmetro');
select pg_temp.ok(not has_table_privilege('cantum_user', 'app.sessions', 'select, insert, update, delete')
                  and not has_table_privilege('cantum_anon', 'app.sessions', 'select, insert, update, delete'),
                  'R7: cantum_user/cantum_anon não leem nem escrevem app.sessions');
set local role cantum_user;
select pg_temp.as_user('00000000-0000-0000-0000-0000000c1901', null);
select pg_temp.denied($q$update app.sessions set reauth_at = now()$q$, 'R7: cantum_user não escreve reauth_at');
select pg_temp.denied($q$select reauth_at from app.sessions$q$, 'R7: cantum_user não lê app.sessions');
reset role;

-- R8: anônimo segue negado.
set local role cantum_anon;
select pg_temp.denied('select public.delete_my_account()', 'R8: cantum_anon');
reset role;

-- Caminho feliz: reauth agora e reauth a 4 min 59 s (dentro da janela) permitem excluir.
set local role cantum_user;
select pg_temp.as_user('00000000-0000-0000-0000-0000000c1901', now()::text);
select public.delete_my_account();
select pg_temp.as_user('00000000-0000-0000-0000-0000000c1902', (now() - interval '4 minutes 59 seconds')::text);
select public.delete_my_account();
reset role;
select pg_temp.ok(not exists (select 1 from app.users where id in ('00000000-0000-0000-0000-0000000c1901', '00000000-0000-0000-0000-0000000c1902')),
                  'caminho feliz: contas excluídas com reauth em dia');

rollback;
