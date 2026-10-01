-- CANTUM — shim da plataforma Supabase para PostgreSQL padrão
--
-- USO EXCLUSIVO EM VERIFICAÇÃO/TESTE (scripts/db/verify-migrations.sh).
-- Nunca aplicar em produção.
--
-- Recria, com o mínimo necessário, os objetos que as migrations atuais
-- esperam encontrar num projeto Supabase: papéis anon/authenticated/service_role,
-- auth.users, auth.uid(), realtime.messages, realtime.topic() e a publicação
-- supabase_realtime. Assim, as migrations podem ser aplicadas e testadas em um
-- PostgreSQL comum. Ver ADR-049 e docs/BACKEND_MIGRATION_PLAN.md.
--
-- Identidade simulada: auth.uid() lê `request.jwt.claim.sub` (ou o `sub` de
-- `request.jwt.claims`), as mesmas GUCs que o PostgREST/Supabase definem.
-- Exemplo em um teste:
--   set local role authenticated;
--   select set_config('request.jwt.claim.sub', '<uuid>', true);

do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text unique,
  created_at timestamptz not null default now()
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;

create schema if not exists realtime;

create table if not exists realtime.messages (
  id bigserial primary key,
  topic text not null,
  extension text not null,
  payload jsonb,
  event text,
  private boolean default true,
  inserted_at timestamptz not null default now()
);

alter table realtime.messages enable row level security;

create or replace function realtime.topic()
returns text
language sql
stable
as $$
  select nullif(current_setting('realtime.topic', true), '')
$$;

grant usage on schema realtime to anon, authenticated, service_role;
grant select, insert on realtime.messages to authenticated;

do $$
begin
  if not exists (select from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end
$$;
