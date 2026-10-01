-- CANTUM — Fase A1 da portabilidade PostgreSQL (ADR-049)
--
-- Introduz o schema `app` como ponto único de identidade da requisição.
-- Hoje delega para auth.uid() (Supabase). No backend próprio (Fase B), apenas
-- esta função muda: passará a ler a GUC `app.user_id`, definida pelo backend
-- em cada transação. Políticas RLS e RPCs novas devem usar
-- app.current_user_id() em vez de auth.uid().
--
-- Aditiva e sem efeito sobre o comportamento atual.

create schema if not exists app;

comment on schema app is
  'Contrato de plataforma do CANTUM (identidade/autorização) independente do provedor. Ver ADR-049.';

create or replace function app.current_user_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select auth.uid()
$$;

comment on function app.current_user_id() is
  'Usuário autenticado da requisição. Supabase: auth.uid(). Backend próprio: current_setting(''app.user_id''). ADR-049.';

revoke all on schema app from public;
grant usage on schema app to anon, authenticated, service_role;

revoke all on function app.current_user_id() from public;
grant execute on function app.current_user_id() to anon, authenticated, service_role;
