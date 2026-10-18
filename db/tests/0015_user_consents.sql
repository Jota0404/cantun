-- CANTUM — B8 fatia 3: user_consents e record_consent (VS-07 RN-01, N9, D7).
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

insert into app.users (id, email, display_name) values
  ('00000000-0000-0000-0000-0000000c1501', 'ana@x.local', 'Ana'),
  ('00000000-0000-0000-0000-0000000c1502', 'bruno@x.local', 'Bruno');

-- Usuário recém-criado: aceite pendente (D7).
select pg_temp.ok(app.consent_pending('00000000-0000-0000-0000-0000000c1501'), 'sem aceite: pendente');

set local role cantum_user;

-- Anônimo negado.
select pg_temp.as_user(null);
select pg_temp.fails_with($q$select public.record_consent('privacy', '2026-10-17')$q$, 'authentication required', 'anônimo');
reset role;
select pg_temp.ok(app.current_consent_version() = '2026-10-17', 'versão vigente');

set local role cantum_user;
select pg_temp.as_user('00000000-0000-0000-0000-0000000c1501');
select pg_temp.fails_with($q$select public.record_consent('privacy', '1999-01-01')$q$, 'outdated consent version', 'versão antiga');
select pg_temp.fails_with($q$select public.record_consent('cookies', '2026-10-17')$q$, 'invalid document', 'documento inválido');

-- Só um documento aceito ainda deixa pendente; idempotente.
select public.record_consent('privacy', '2026-10-17');
select public.record_consent('privacy', '2026-10-17');
reset role;
select pg_temp.ok((select count(*) = 1 from public.user_consents where user_id = '00000000-0000-0000-0000-0000000c1501'), 'idempotente');
select pg_temp.ok(app.consent_pending('00000000-0000-0000-0000-0000000c1501'), 'um documento só: pendente');
set local role cantum_user;
select pg_temp.as_user('00000000-0000-0000-0000-0000000c1501');
select public.record_consent('terms', '2026-10-17');
reset role;
select pg_temp.ok(not app.consent_pending('00000000-0000-0000-0000-0000000c1501'), 'dois documentos: em dia');

-- Bruno aceita via servidor (accept_consents); versão errada recusada.
select pg_temp.fails_with($q$select app.accept_consents('00000000-0000-0000-0000-0000000c1502', 'x')$q$, 'outdated consent version', 'accept_consents versão errada');
select app.accept_consents('00000000-0000-0000-0000-0000000c1502', '2026-10-17');
select app.accept_consents('00000000-0000-0000-0000-0000000c1502', '2026-10-17');
select pg_temp.ok((select count(*) = 2 from public.user_consents where user_id = '00000000-0000-0000-0000-0000000c1502'), 'accept_consents idempotente');

-- Outro usuário não lê o aceite alheio; cada um lê o seu.
set local role cantum_user;
select pg_temp.as_user('00000000-0000-0000-0000-0000000c1501');
select pg_temp.ok((select count(*) = 2 and bool_and(user_id = '00000000-0000-0000-0000-0000000c1501') from public.user_consents), 'Ana lê só o seu');
select pg_temp.as_user('00000000-0000-0000-0000-0000000c1502');
select pg_temp.ok((select count(*) = 2 and bool_and(user_id = '00000000-0000-0000-0000-0000000c1502') from public.user_consents), 'Bruno lê só o seu');
select pg_temp.as_user(null);
select pg_temp.ok((select count(*) = 0 from public.user_consents), 'anônimo não lê');

-- N9: sem escrita direta; helpers do servidor fora do alcance do cliente.
select pg_temp.as_user('00000000-0000-0000-0000-0000000c1501');
select pg_temp.denied($q$insert into public.user_consents (user_id, document, version) values ('00000000-0000-0000-0000-0000000c1501', 'privacy', 'outra')$q$, 'N9: insert direto');
select pg_temp.denied($q$update public.user_consents set version = 'x'$q$, 'N9: update direto');
select pg_temp.denied($q$delete from public.user_consents$q$, 'N9: delete direto');
select pg_temp.denied($q$select app.accept_consents('00000000-0000-0000-0000-0000000c1501', '2026-10-17')$q$, 'accept_consents fora do cliente');
reset role;

-- Helpers do servidor e record_consent fora do alcance de cantum_user/cantum_anon: permission denied.
create function pg_temp.perm_denied(p_sql text, p_label text) returns void language plpgsql
as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm like 'permission denied%' then return; end if;
    raise exception 'mensagem errada em %: %', p_label, sqlerrm;
  end;
  raise exception 'deveria ser negado: %', p_label;
end $$;
set local role cantum_user;
select pg_temp.as_user('00000000-0000-0000-0000-0000000c1501');
select pg_temp.perm_denied($q$select app.consent_pending('00000000-0000-0000-0000-0000000c1501')$q$, 'cantum_user: consent_pending');
select pg_temp.perm_denied($q$select app.accept_consents('00000000-0000-0000-0000-0000000c1501', '2026-10-17')$q$, 'cantum_user: accept_consents');
reset role;
set local role cantum_anon;
select pg_temp.perm_denied($q$select app.consent_pending('00000000-0000-0000-0000-0000000c1501')$q$, 'cantum_anon: consent_pending');
select pg_temp.perm_denied($q$select app.accept_consents('00000000-0000-0000-0000-0000000c1501', '2026-10-17')$q$, 'cantum_anon: accept_consents');
select pg_temp.perm_denied($q$select public.record_consent('privacy', '2026-10-17')$q$, 'cantum_anon: record_consent');
reset role;

-- Exclusão da conta apaga o aceite em cascata (só o do titular).
delete from app.users where id = '00000000-0000-0000-0000-0000000c1501';
select pg_temp.ok(not exists (select 1 from public.user_consents where user_id = '00000000-0000-0000-0000-0000000c1501')
                  and exists (select 1 from public.user_consents where user_id = '00000000-0000-0000-0000-0000000c1502'), 'cascade só do titular');

rollback;
