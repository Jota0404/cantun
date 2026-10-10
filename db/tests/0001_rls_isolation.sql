-- CANTUM — isolamento por organização e contrato de identidade (ADR-059, NFR-005).
--
-- Roda como superusuário num banco descartável (scripts/db/verify-migrations.sh).
-- Cada verificação falha com exceção. Tudo acontece numa transação desfeita
-- no final.
\set ON_ERROR_STOP on
begin;

-- Fixtures (dono do schema)
insert into app.users (id, email, display_name, email_verified_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'ana@teste.local', 'Ana', now()),
  ('00000000-0000-0000-0000-0000000000b1', 'bruno@teste.local', 'Bruno', now());

-- 1. Catálogo: nada do Supabase sobrou e toda tabela de dados tem RLS.
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private', 'app')
      and (case when p.prokind in ('f', 'p') then pg_get_functiondef(p.oid) end) ~ '\mauth\.'
  ) then
    raise exception 'função ainda referencia o schema auth';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and (qual ~ '\mauth\.' or with_check ~ '\mauth\.')
  ) then
    raise exception 'política ainda referencia o schema auth';
  end if;
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'app') and c.relkind = 'r'
      and c.relname <> 'schema_migrations' and not c.relrowsecurity
  ) then
    raise exception 'tabela sem RLS';
  end if;
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon', 'authenticated', 'service_role')
  ) then
    raise exception 'grant para papel do Supabase';
  end if;
end $$;

-- 2. Anônimo não lê dados.
set local role cantum_anon;
do $$
begin
  perform 1 from public.organizations;
  raise exception 'cantum_anon leu organizations';
exception when insufficient_privilege then null;
end $$;
reset role;

-- 3. Sem usuário na transação, a RPC recusa.
set local role cantum_user;
do $$
begin
  perform public.create_organization('10000000-0000-0000-0000-000000000001', 'Sem dono');
  raise exception 'create_organization aceitou chamada sem usuário';
exception when raise_exception then
  if sqlerrm <> 'authentication required' then raise; end if;
end $$;

-- 4. Ana cria organização, equipe e música.
select set_config('app.user_id', '00000000-0000-0000-0000-0000000000a1', true);
select public.create_organization('20000000-0000-0000-0000-0000000000a1', 'Igreja da Ana');
insert into public.teams (id, organization_id, name)
  values ('30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1', 'Louvor');
insert into public.songs (user_id, id, title, original_key, current_key, lyrics, created_at, updated_at)
  values ('00000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-0000000000a1',
          'Música da Ana', 'C', 'C', 'C G Am F', now(), now());
do $$
begin
  if (select count(*) from public.organizations) <> 1 then raise exception 'Ana deveria ver 1 organização'; end if;
  if (select count(*) from public.songs) <> 1 then raise exception 'Ana deveria ver a própria música'; end if;
end $$;

-- 5. Bruno, sem vínculo, não vê nem altera nada da Ana.
select set_config('app.user_id', '00000000-0000-0000-0000-0000000000b1', true);
do $$
begin
  if exists (select 1 from public.organizations) then raise exception 'Bruno viu organização alheia'; end if;
  if exists (select 1 from public.teams) then raise exception 'Bruno viu equipe alheia'; end if;
  if exists (select 1 from public.songs) then raise exception 'Bruno viu música alheia'; end if;
  if exists (select 1 from public.organization_invites) then raise exception 'Bruno viu convite alheio'; end if;

  update public.organizations set name = 'Invadida';
  if found then raise exception 'Bruno alterou organização alheia'; end if;
end $$;
do $$
begin
  insert into public.teams (id, organization_id, name)
    values ('30000000-0000-0000-0000-0000000000b9', '20000000-0000-0000-0000-0000000000a1', 'Equipe intrusa');
  raise exception 'Bruno criou equipe em organização alheia';
exception when insufficient_privilege then null;
end $$;
do $$
begin
  insert into public.songs (user_id, id, title, original_key, current_key, lyrics, created_at, updated_at)
    values ('00000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-0000000000b9',
            'Forjada', 'C', 'C', '', now(), now());
  raise exception 'Bruno criou música em nome da Ana';
exception when insufficient_privilege then null;
end $$;

-- 6. Convite por e-mail: só o dono do e-mail aceita; o aceite cria o vínculo.
--    Exercita pgcrypto (token e hash) e a troca auth.users -> app.users.
select set_config('app.user_id', '00000000-0000-0000-0000-0000000000a1', true);
create temporary table invite_token on commit drop as
  select token from public.create_organization_invite(
    '20000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a1',
    'member', 'Bruno@Teste.Local', 168);

do $$
begin
  if (select count(*) from public.organization_invites where accepted_at is null) <> 1 then
    raise exception 'Ana deveria ver o convite pendente';
  end if;
  if exists (select 1 from public.organization_invites where token_hash is null) then
    raise exception 'convite sem hash';
  end if;
end $$;

select set_config('app.user_id', '00000000-0000-0000-0000-0000000000b1', true);
select public.accept_organization_invite((select token from invite_token));
do $$
begin
  if (select count(*) from public.organizations) <> 1 then raise exception 'Bruno deveria ver a organização depois do aceite'; end if;
  if (select count(*) from public.team_memberships where user_id = app.current_user_id()) <> 1 then
    raise exception 'aceite não criou o vínculo de equipe';
  end if;

  update public.organizations set name = 'Renomeada pelo membro';
  if found then raise exception 'membro alterou a organização (só owner)'; end if;
end $$;

-- 7. Token reutilizado é recusado.
do $$
begin
  perform public.accept_organization_invite((select token from invite_token));
  raise exception 'convite aceito duas vezes';
exception when raise_exception then
  if sqlerrm <> 'invite already used' then raise; end if;
end $$;

reset role;
rollback;
