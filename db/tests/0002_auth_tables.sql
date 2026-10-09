-- CANTUM — tabelas de autenticação inacessíveis para os papéis de requisição.
\set ON_ERROR_STOP on
begin;

set local role cantum_user;
do $$
declare
  t text;
begin
  foreach t in array array['app.users', 'app.sessions', 'app.email_tokens'] loop
    begin
      execute format('select 1 from %s limit 1', t);
      raise exception 'cantum_user leu %', t;
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;
reset role;

set local role cantum_anon;
do $$
begin
  perform 1 from app.sessions limit 1;
  raise exception 'cantum_anon leu app.sessions';
exception when insufficient_privilege then null;
end $$;
reset role;

rollback;
