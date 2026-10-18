-- CANTUM — B8 fatia 8: idade mínima de 16 anos para conta própria (VS-07 RN-10, D1 revisada; ECA Digital, LGPD art. 14).
--
-- 1. app.minimum_account_age(): espelho da constante do cliente (src/domain/privacy/age.ts); nenhuma função SQL a usa.
--    A regra no servidor é a declaração obrigatória (accept_consents).
-- 2. user_consents.document passa a aceitar 'age': a autodeclaração "tenho N anos ou mais", gravada junto do aceite
--    de Política e Termos, na versão vigente. Sem data de nascimento (minimização). Mesma RLS e mesmo N9: só o servidor escreve.
--    record_consent continua só para 'privacy' e 'terms'. consent_pending passa a olhar só esses dois
--    documentos: a declaração é barreira do cadastro, não motivo de re-aceite; a versão do consentimento não sobe.
-- 3. app.accept_consents ganha p_age_declared e recusa o cadastro sem a declaração (mesma transação do signup).

create function app.minimum_account_age() returns int
  language sql immutable
  set search_path = ''
as $$ select 16 $$;
revoke all on function app.minimum_account_age() from public;

alter table public.user_consents drop constraint user_consents_document_check;
alter table public.user_consents add constraint user_consents_document_check check (document in ('privacy', 'terms', 'age'));

drop function app.accept_consents(uuid, text);
create function app.accept_consents(p_user_id uuid, p_version text, p_age_declared boolean) returns void
  language plpgsql
  set search_path = ''
as $$
begin
  if p_age_declared is distinct from true then raise exception 'age declaration required'; end if;
  if p_version is distinct from app.current_consent_version() then raise exception 'outdated consent version'; end if;
  insert into public.user_consents (user_id, document, version)
  select p_user_id, d, p_version from unnest(array['privacy', 'terms', 'age']) d
  on conflict (user_id, document, version) do nothing;
end;
$$;
revoke all on function app.accept_consents(uuid, text, boolean) from public;

create or replace function app.consent_pending(p_user_id uuid) returns boolean
  language sql stable
  set search_path = ''
as $$
  select (select count(distinct document) from public.user_consents
           where user_id = p_user_id and document in ('privacy', 'terms') and version = app.current_consent_version()) < 2
$$;
