-- CANTUM — B8 fatia 3: aceite versionado de Política e Termos (VS-07 RN-01, ADR-063; N9, D7).
--
-- 1. app.current_consent_version(): versão vigente dos dois documentos, num só lugar do SQL.
--    Subir a versão = nova migration com `create or replace` (e src/domain/privacy/documents.ts no mesmo PR).
-- 2. user_consents: append-only; o dono lê o próprio; sem policy nem grant de escrita (só RPC/servidor).
--    Apaga em cascata com a conta (delete_my_account).
-- 3. record_consent(document, version): idempotente por usuário+documento+versão; recusa versão que não é a vigente.
-- 4. app.accept_consents / app.consent_pending: usados só pelo servidor (signup na mesma transação; login/sessão),
--    sem EXECUTE para cantum_user.

create function app.current_consent_version() returns text
  language sql immutable
  set search_path = ''
as $$ select '2026-10-17'::text $$;
revoke all on function app.current_consent_version() from public;

create table public.user_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.users(id) on delete cascade,
  document text not null check (document in ('privacy', 'terms')),
  version text not null check (length(version) between 1 and 32),
  accepted_at timestamptz not null default now(),
  unique (user_id, document, version)
);
alter table public.user_consents enable row level security;
create policy user_consents_select on public.user_consents for select to cantum_user
  using (user_id = app.current_user_id());
revoke all on public.user_consents from cantum_user;
grant select on public.user_consents to cantum_user;

create function public.record_consent(p_document text, p_version text) returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  if p_document is null or p_document not in ('privacy', 'terms') then raise exception 'invalid document'; end if;
  if p_version is distinct from app.current_consent_version() then raise exception 'outdated consent version'; end if;
  insert into public.user_consents (user_id, document, version) values (v_user_id, p_document, p_version)
  on conflict (user_id, document, version) do nothing;
end;
$$;
revoke all on function public.record_consent(text, text) from public;
grant execute on function public.record_consent(text, text) to cantum_user;

create function app.accept_consents(p_user_id uuid, p_version text) returns void
  language plpgsql
  set search_path = ''
as $$
begin
  if p_version is distinct from app.current_consent_version() then raise exception 'outdated consent version'; end if;
  insert into public.user_consents (user_id, document, version)
  select p_user_id, d, p_version from unnest(array['privacy', 'terms']) d
  on conflict (user_id, document, version) do nothing;
end;
$$;
revoke all on function app.accept_consents(uuid, text) from public;

create function app.consent_pending(p_user_id uuid) returns boolean
  language sql stable
  set search_path = ''
as $$
  select (select count(distinct document) from public.user_consents
           where user_id = p_user_id and version = app.current_consent_version()) < 2
$$;
revoke all on function app.consent_pending(uuid) from public;
