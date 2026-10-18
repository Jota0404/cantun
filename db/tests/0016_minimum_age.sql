-- CANTUM — B8 fatia 8: idade mínima por autodeclaração (VS-07 RN-10).
\set ON_ERROR_STOP on
\o /dev/null
begin;

create function pg_temp.ok(p_condition boolean, p_label text) returns void language plpgsql
as $$ begin if not coalesce(p_condition, false) then raise exception 'falhou: %', p_label; end if; end $$;

create function pg_temp.fails_with(p_sql text, p_message text, p_label text) returns void language plpgsql
as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm = p_message then return; end if;
    raise exception 'mensagem errada em %: % (esperado %)', p_label, sqlerrm, p_message;
  end;
  raise exception 'deveria falhar: %', p_label;
end $$;

create function pg_temp.denied(p_sql text, p_label text) returns void language plpgsql
as $$
begin
  begin execute p_sql;
  exception when insufficient_privilege or raise_exception or check_violation then return;
  end;
  raise exception 'deveria ser negado: %', p_label;
end $$;

do $$ begin
  execute format('grant usage on schema %s to cantum_user', pg_my_temp_schema()::regnamespace);
end $$;

insert into app.users (id, email, display_name) values
  ('00000000-0000-0000-0000-0000000c1601', 'ana@x.local', 'Ana'),
  ('00000000-0000-0000-0000-0000000c1602', 'bruno@x.local', 'Bruno');

select pg_temp.ok(app.minimum_account_age() = 16, 'idade mínima 16');

-- Sem declaração (false ou null) o cadastro é recusado e nada é gravado.
select pg_temp.fails_with($q$select app.accept_consents('00000000-0000-0000-0000-0000000c1601', '2026-10-17', false)$q$, 'age declaration required', 'declaração false');
select pg_temp.fails_with($q$select app.accept_consents('00000000-0000-0000-0000-0000000c1601', '2026-10-17', null)$q$, 'age declaration required', 'declaração null');
select pg_temp.ok(not exists (select 1 from public.user_consents where user_id = '00000000-0000-0000-0000-0000000c1601'), 'nada gravado sem declaração');

-- Com declaração: privacy, terms e age na versão vigente; em dia.
select app.accept_consents('00000000-0000-0000-0000-0000000c1601', '2026-10-17', true);
select pg_temp.ok((select array_agg(document order by document) = array['age', 'privacy', 'terms'] from public.user_consents where user_id = '00000000-0000-0000-0000-0000000c1601'), 'três registros');
select pg_temp.ok(not app.consent_pending('00000000-0000-0000-0000-0000000c1601'), 'em dia');

-- A declaração não conta para o re-aceite: conta antiga (só privacy e terms) continua em dia.
insert into public.user_consents (user_id, document, version) values
  ('00000000-0000-0000-0000-0000000c1602', 'privacy', '2026-10-17'), ('00000000-0000-0000-0000-0000000c1602', 'terms', '2026-10-17');
select pg_temp.ok(not app.consent_pending('00000000-0000-0000-0000-0000000c1602'), 'conta existente sem age: em dia');

-- N9: o cliente não grava a declaração nem por record_consent nem direto.
set local role cantum_user;
select set_config('app.user_id', '00000000-0000-0000-0000-0000000c1602', true);
select pg_temp.fails_with($q$select public.record_consent('age', '2026-10-17')$q$, 'invalid document', 'record_consent não aceita age');
select pg_temp.denied($q$insert into public.user_consents (user_id, document, version) values ('00000000-0000-0000-0000-0000000c1602', 'age', '2026-10-17')$q$, 'N9: insert direto de age');
select pg_temp.denied($q$delete from public.user_consents$q$, 'N9: delete direto');
reset role;

-- Exclusão da conta apaga a declaração em cascata.
delete from app.users where id = '00000000-0000-0000-0000-0000000c1601';
select pg_temp.ok(not exists (select 1 from public.user_consents where user_id = '00000000-0000-0000-0000-0000000c1601'), 'cascade');

rollback;
