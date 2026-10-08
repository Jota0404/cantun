-- CANTUM — baseline do schema PostgreSQL (ADR-059)
--
-- Gerado em 2026-10-08 a partir das 37 migrations de supabase/migrations, com:
--   * 6 causas-raiz corrigidas (ver db/README.md);
--   * legado Band/Setlist removido (tabelas band_*, setlists, legacy_band_*,
--     funções band_* e a coluna stage_sessions.legacy_band_stage_session_id);
--   * auth.uid() -> app.current_user_id(), auth.users -> app.users;
--   * papéis anon/authenticated -> cantum_anon/cantum_user; sem service_role;
--   * pgcrypto no schema extensions, chamado com nome qualificado;
--   * políticas de organization_memberships e team_memberships sem recursão (app.is_organization_member,
--     app.has_organization_role).
--
-- Aplicar só por scripts/db/migrate.sh. Migration aplicada nunca é editada:
-- mudanças entram em db/migrations/0002_*.sql em diante.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cantum_anon') THEN
    CREATE ROLE cantum_anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cantum_user') THEN
    CREATE ROLE cantum_user NOLOGIN;
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: app; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS app;


--
-- Name: users; Type: TABLE; Schema: app; Owner: -
-- Contas do CANTUM (ADR-059). Credenciais e sessões entram com o servidor (B1, PR 2).
--

CREATE TABLE app.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT users_pkey PRIMARY KEY (id),
    CONSTRAINT users_email_lowercase CHECK ((email = lower(email)))
);

CREATE UNIQUE INDEX users_email_key ON app.users USING btree (email);

ALTER TABLE app.users ENABLE ROW LEVEL SECURITY;


--
-- Name: private; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA private;


--
-- Name: current_user_id(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.current_user_id() RETURNS uuid
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;


--
-- Name: is_organization_member(uuid); Type: FUNCTION; Schema: app; Owner: -
-- Checagens de vínculo sem passar pela RLS de organization_memberships,
-- cujas políticas se consultavam e entravam em recursão infinita.
--

CREATE FUNCTION app.is_organization_member(p_organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1 from public.organization_memberships om
    where om.organization_id = p_organization_id
      and om.user_id = app.current_user_id()
  )
$$;


--
-- Name: has_organization_role(uuid, text[]); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.has_organization_role(p_organization_id uuid, p_roles text[]) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1 from public.organization_memberships om
    where om.organization_id = p_organization_id
      and om.user_id = app.current_user_id()
      and om.role = any (p_roles)
  )
$$;

REVOKE ALL ON FUNCTION app.is_organization_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.is_organization_member(uuid) TO cantum_user;
REVOKE ALL ON FUNCTION app.has_organization_role(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.has_organization_role(uuid, text[]) TO cantum_user;


--
-- Name: accept_organization_invite(text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.accept_organization_invite(p_token text) RETURNS TABLE(organization_id uuid, organization_name text, team_id uuid, team_name text, role text, organization_membership_id uuid, team_membership_id uuid, already_organization_member boolean, already_team_member boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid := app.current_user_id();
  v_invite public.organization_invites%rowtype;
  v_org_membership_id uuid;
  v_team_membership_id uuid;
  v_already_org boolean;
  v_already_team boolean;
  v_email text;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;

  select * into v_invite
  from public.organization_invites
  where token_hash = extensions.digest(p_token, 'sha256')
  for update;

  if not found then raise exception 'invalid invite'; end if;
  if v_invite.revoked_at is not null then raise exception 'invite revoked'; end if;
  if v_invite.accepted_at is not null then raise exception 'invite already used'; end if;
  if v_invite.expires_at <= now() then raise exception 'invite expired'; end if;

  select lower(email) into v_email from app.users where id = v_user_id;
  if v_invite.invitee_email is not null
     and lower(v_invite.invitee_email) <> coalesce(v_email, '') then
    raise exception 'invite is restricted to another email';
  end if;

  select om.id into v_org_membership_id
  from public.organization_memberships om
  where om.organization_id = v_invite.organization_id
    and om.user_id = v_user_id
  for update;
  v_already_org := found;

  if not v_already_org then
    v_org_membership_id := gen_random_uuid();
    insert into public.organization_memberships (
      id, organization_id, user_id, role, created_at, updated_at
    )
    values (
      v_org_membership_id, v_invite.organization_id, v_user_id,
      v_invite.role, now(), now()
    );
  end if;

  select tm.id into v_team_membership_id
  from public.team_memberships tm
  where tm.team_id = v_invite.team_id
    and tm.user_id = v_user_id
  for update;
  v_already_team := found;

  if not v_already_team then
    v_team_membership_id := gen_random_uuid();
    insert into public.team_memberships (
      id, team_id, user_id, created_at, updated_at
    )
    values (
      v_team_membership_id, v_invite.team_id, v_user_id, now(), now()
    );
  end if;

  update public.organization_invites
  set accepted_at = now(), accepted_by_user_id = v_user_id
  where id = v_invite.id and accepted_at is null and revoked_at is null;

  if not found then raise exception 'invite already used'; end if;

  return query
    select v_invite.organization_id, o.name, v_invite.team_id, t.name,
      coalesce(
        (select om.role::text from public.organization_memberships om
         where om.id = v_org_membership_id),
        v_invite.role
      ),
      v_org_membership_id, v_team_membership_id,
      v_already_org, v_already_team
    from public.organizations o
    join public.teams t on t.id = v_invite.team_id
    where o.id = v_invite.organization_id;
end;
$$;


--
-- Name: assert_stage_operator(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.assert_stage_operator() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_md_user_id uuid;
begin
  if app.current_user_id() is null then
    raise exception 'authentication required';
  end if;

  if tg_table_name = 'stage_sessions' then
    v_md_user_id := old.md_user_id;
  else
    select ss.md_user_id
      into v_md_user_id
    from public.stage_session_states st
    join public.stage_sessions ss on ss.id = st.stage_session_id
    where st.stage_session_id = new.stage_session_id;
  end if;

  if v_md_user_id is null or v_md_user_id <> app.current_user_id() then
    raise exception 'only the current Stage MD can mutate execution state';
  end if;

  return new;
end;
$$;


--
-- Name: create_organization_invite(uuid, uuid, text, text, integer); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.create_organization_invite(p_organization_id uuid, p_team_id uuid, p_role text, p_invitee_email text DEFAULT NULL::text, p_expires_in_hours integer DEFAULT 168) RETURNS TABLE(id uuid, organization_id uuid, team_id uuid, invited_by_user_id uuid, role text, invitee_email text, created_at timestamp with time zone, expires_at timestamp with time zone, token text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid := app.current_user_id();
  v_token text;
  v_id uuid;
  v_created_at timestamptz;
  v_expires_at timestamptz;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  if p_role not in ('admin', 'member') then raise exception 'invalid invite role'; end if;
  if p_expires_in_hours < 1 or p_expires_in_hours > 720 then raise exception 'invalid invite expiration'; end if;

  if not exists (
    select 1 from public.organization_memberships om
    where om.organization_id = p_organization_id
      and om.user_id = v_user_id
      and om.role in ('owner', 'admin')
  ) then
    raise exception 'not authorized to invite organization members';
  end if;

  if not exists (
    select 1 from public.teams t
    where t.id = p_team_id and t.organization_id = p_organization_id
  ) then
    raise exception 'team does not belong to organization';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_created_at := now();
  v_expires_at := v_created_at + make_interval(hours => p_expires_in_hours);
  v_id := gen_random_uuid();

  insert into public.organization_invites (
    id, organization_id, team_id, invited_by_user_id, role, invitee_email,
    token_hash, created_at, expires_at
  )
  values (
    v_id, p_organization_id, p_team_id, v_user_id, p_role,
    nullif(lower(btrim(p_invitee_email)), ''),
    extensions.digest(v_token, 'sha256'), v_created_at, v_expires_at
  );

  return query
    select v_id, p_organization_id, p_team_id, v_user_id, p_role,
      nullif(lower(btrim(p_invitee_email)), ''), v_created_at, v_expires_at, v_token;
end;
$$;


--
-- Name: get_organization_invite(text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.get_organization_invite(p_token text) RETURNS TABLE(id uuid, organization_id uuid, team_id uuid, organization_name text, team_name text, role text, invitee_email text, created_at timestamp with time zone, expires_at timestamp with time zone, accepted_at timestamp with time zone, revoked_at timestamp with time zone, status text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if app.current_user_id() is null then raise exception 'authentication required'; end if;

  return query
    select i.id, i.organization_id, i.team_id, o.name, t.name, i.role,
      i.invitee_email, i.created_at, i.expires_at, i.accepted_at, i.revoked_at,
      case
        when i.revoked_at is not null then 'revoked'
        when i.accepted_at is not null then 'accepted'
        when i.expires_at <= now() then 'expired'
        else 'pending'
      end
    from public.organization_invites i
    join public.organizations o on o.id = i.organization_id
    join public.teams t on t.id = i.team_id
    where i.token_hash = extensions.digest(p_token, 'sha256');
end;
$$;


--
-- Name: revoke_organization_invite(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.revoke_organization_invite(p_invite_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid := app.current_user_id();
begin
  if v_user_id is null then raise exception 'authentication required'; end if;

  update public.organization_invites i
  set revoked_at = now()
  where i.id = p_invite_id
    and i.accepted_at is null
    and i.revoked_at is null
    and exists (
      select 1
      from public.organization_memberships om
      where om.organization_id = i.organization_id
        and om.user_id = v_user_id
        and om.role in ('owner', 'admin')
    );

  if not found then raise exception 'invite not found or not authorized'; end if;
end;
$$;


--
-- Name: accept_organization_invite(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.accept_organization_invite(p_token text) RETURNS TABLE(organization_id uuid, organization_name text, team_id uuid, team_name text, role text, organization_membership_id uuid, team_membership_id uuid, already_organization_member boolean, already_team_member boolean)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$ select * from private.accept_organization_invite(p_token); $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organizations_name_check CHECK ((length(btrim(name)) > 0))
);


--
-- Name: create_organization(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_organization(p_id uuid, p_name text) RETURNS public.organizations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_organization public.organizations;
  v_user_id uuid := app.current_user_id();
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'organization name is required';
  end if;

  insert into public.organizations (id, name)
  values (p_id, btrim(p_name))
  returning * into v_organization;

  insert into public.organization_memberships (organization_id, user_id, role)
  values (p_id, v_user_id, 'owner');

  return v_organization;
end;
$$;


--
-- Name: create_organization_invite(uuid, uuid, text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_organization_invite(p_organization_id uuid, p_team_id uuid, p_role text, p_invitee_email text DEFAULT NULL::text, p_expires_in_hours integer DEFAULT 168) RETURNS TABLE(id uuid, organization_id uuid, team_id uuid, invited_by_user_id uuid, role text, invitee_email text, created_at timestamp with time zone, expires_at timestamp with time zone, token text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$ select * from private.create_organization_invite(
  p_organization_id, p_team_id, p_role, p_invitee_email, p_expires_in_hours
); $$;


--
-- Name: stage_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stage_sessions (
    id uuid NOT NULL,
    service_id uuid NOT NULL,
    status text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    md_user_id uuid,
    CONSTRAINT stage_sessions_status_check CHECK ((status = ANY (ARRAY['lobby'::text, 'live'::text, 'ended'::text])))
);


--
-- Name: create_target_stage_session(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_target_stage_session(p_service_id uuid, p_session_id uuid DEFAULT gen_random_uuid()) RETURNS public.stage_sessions
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_service public.services;
  v_stage public.stage_sessions;
begin
  select s.*
    into v_service
  from public.services s
  join public.organization_memberships om
    on om.organization_id = s.organization_id
   and om.user_id = app.current_user_id()
  where s.id = p_service_id;

  if v_service.id is null then
    raise exception 'service not found or not authorized';
  end if;

  if not exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = v_service.organization_id
      and om.user_id = app.current_user_id()
      and om.role in ('owner', 'admin')
  ) then
    raise exception 'not authorized to create stage sessions';
  end if;

  if not exists (
    select 1 from public.service_items si
    where si.service_id = p_service_id
  ) then
    raise exception 'service must contain at least one song before starting stage';
  end if;

  insert into public.stage_sessions (
    id,
    service_id,
    md_user_id,
    status,
    created_at,
    updated_at
  )
  values (
    p_session_id,
    p_service_id,
    app.current_user_id(),
    'lobby',
    now(),
    now()
  )
  returning * into v_stage;

  return v_stage;
end;
$$;


--
-- Name: get_my_team_musical_functions(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_team_musical_functions(p_team_id uuid) RETURNS TABLE(musical_function text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select tmf.musical_function
  from public.team_musical_functions tmf
  join public.team_memberships tm on tm.id = tmf.team_membership_id
  where tm.team_id = p_team_id
    and tm.user_id = app.current_user_id()
  order by tmf.musical_function;
$$;


--
-- Name: get_organization_invite(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_organization_invite(p_token text) RETURNS TABLE(id uuid, organization_id uuid, team_id uuid, organization_name text, team_name text, role text, invitee_email text, created_at timestamp with time zone, expires_at timestamp with time zone, accepted_at timestamp with time zone, revoked_at timestamp with time zone, status text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$ select * from private.get_organization_invite(p_token); $$;


--
-- Name: get_service_stage_session(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_service_stage_session(p_stage_session_id uuid) RETURNS public.stage_sessions
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select ss
  from public.stage_sessions ss
  join public.services svc on svc.id = ss.service_id
  join public.organization_memberships om
    on om.organization_id = svc.organization_id
   and om.user_id = app.current_user_id()
  where ss.id = p_stage_session_id;
$$;


--
-- Name: get_service_stage_songs(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_service_stage_songs(p_stage_session_id uuid) RETURNS TABLE("position" integer, song_id uuid, title text, artist text, original_key text, current_key text, lyrics text, notes text, bpm integer, musical_role text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select
    si.position,
    s.id,
    s.title,
    s.artist,
    s.original_key,
    s.original_key,
    s.lyrics,
    s.notes,
    s.bpm,
    coalesce(
      (
        select a.musical_function
        from public.assignments a
        where a.service_id = svc.id
          and a.user_id = app.current_user_id()
          and (a.service_item_id = si.id or a.service_item_id is null)
          and a.status in ('pending', 'accepted')
        order by case when a.service_item_id = si.id then 0 else 1 end, a.created_at desc
        limit 1
      ),
      'other'
    )
  from public.stage_sessions ss
  join public.services svc on svc.id = ss.service_id
  join public.service_items si on si.service_id = svc.id
  join public.songs s on s.id = si.song_id
  join public.organization_memberships om
    on om.organization_id = svc.organization_id
   and om.user_id = app.current_user_id()
  where ss.id = p_stage_session_id
  order by si.position asc;
$$;


--
-- Name: get_target_stage_snapshot(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_target_stage_snapshot(p_stage_session_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_stage public.stage_sessions;
  v_state public.stage_session_states;
begin
  select ss.*
    into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id = ss.service_id
  join public.organization_memberships om
    on om.organization_id = svc.organization_id
   and om.user_id = app.current_user_id()
  where ss.id = p_stage_session_id;

  if v_stage.id is null then
    raise exception 'stage session not found or not authorized';
  end if;

  select *
    into v_state
  from public.stage_session_states
  where stage_session_id = p_stage_session_id;

  if v_state.stage_session_id is null then
    raise exception 'stage session state not found';
  end if;

  return jsonb_build_object(
    'session', to_jsonb(v_stage),
    'state', to_jsonb(v_state)
  );
end;
$$;


--
-- Name: initialize_target_stage_identity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.initialize_target_stage_identity() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.md_user_id is null then
    new.md_user_id := app.current_user_id();
  end if;
  return new;
end;
$$;


--
-- Name: initialize_target_stage_state(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.initialize_target_stage_state() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_first_item public.service_items;
begin
  select *
    into v_first_item
  from public.service_items si
  where si.service_id = new.service_id
  order by si.position asc
  limit 1;

  insert into public.stage_session_states (
    stage_session_id,
    current_index,
    current_service_item_id,
    current_song_id,
    updated_at
  )
  values (
    new.id,
    coalesce(v_first_item.position, 0),
    v_first_item.id,
    v_first_item.song_id,
    new.updated_at
  )
  on conflict (stage_session_id) do nothing;

  return new;
end;
$$;


--
-- Name: remove_organization_member(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remove_organization_member(p_membership_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_target public.organization_memberships%rowtype;
  v_actor_role text;
begin
  if app.current_user_id() is null then raise exception 'authentication required'; end if;

  select * into v_target
  from public.organization_memberships
  where id = p_membership_id
  for update;

  if not found then raise exception 'membership not found'; end if;
  if v_target.role = 'owner' then raise exception 'organization owner cannot be removed'; end if;

  select om.role::text into v_actor_role
  from public.organization_memberships om
  where om.organization_id = v_target.organization_id
    and om.user_id = app.current_user_id();

  if v_actor_role not in ('owner', 'admin') then raise exception 'not authorized'; end if;

  delete from public.team_memberships tm
  where tm.user_id = v_target.user_id
    and exists (
      select 1 from public.teams t
      where t.id = tm.team_id and t.organization_id = v_target.organization_id
    );

  delete from public.organization_memberships where id = p_membership_id;
end;
$$;


--
-- Name: revoke_organization_invite(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.revoke_organization_invite(p_invite_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$ select private.revoke_organization_invite(p_invite_id); $$;


--
-- Name: set_my_team_musical_functions(uuid, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_my_team_musical_functions(p_team_id uuid, p_musical_functions text[]) RETURNS TABLE(musical_function text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_membership_id uuid;
  v_function text;
begin
  if app.current_user_id() is null then raise exception 'authentication required'; end if;
  select tm.id into v_membership_id
  from public.team_memberships tm
  where tm.team_id = p_team_id and tm.user_id = app.current_user_id();

  if v_membership_id is null then raise exception 'team membership not found'; end if;

  delete from public.team_musical_functions
  where team_membership_id = v_membership_id;

  foreach v_function in array p_musical_functions loop
    if v_function not in (
      'vocals','electric-guitar','acoustic-guitar','bass','drums',
      'keys','piano','strings','brass','woodwinds','other'
    ) then raise exception 'invalid musical function'; end if;

    insert into public.team_musical_functions(team_membership_id, musical_function)
    values (v_membership_id, v_function)
    on conflict do nothing;
  end loop;

  return query
    select tmf.musical_function
    from public.team_musical_functions tmf
    where tmf.team_membership_id = v_membership_id
    order by tmf.musical_function;
end;
$$;


--
-- Name: stage_session_states; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stage_session_states (
    stage_session_id uuid NOT NULL,
    revision integer DEFAULT 0 NOT NULL,
    current_index integer DEFAULT 0 NOT NULL,
    current_service_item_id uuid,
    current_song_id uuid,
    current_key text,
    prepared_index integer,
    prepared_service_item_id uuid,
    prepared_song_id uuid,
    is_running boolean DEFAULT false NOT NULL,
    md_annotation text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: target_stage_clear_prepared(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.target_stage_clear_prepared(p_stage_session_id uuid) RETURNS public.stage_session_states
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_stage public.stage_sessions; v_state public.stage_session_states;
begin
  select ss.* into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id=ss.service_id
  join public.organization_memberships om on om.organization_id=svc.organization_id and om.user_id=app.current_user_id()
  where ss.id=p_stage_session_id;
  if v_stage.id is null then raise exception 'stage session not found or not authorized'; end if;
  if v_stage.status <> 'live' then raise exception 'stage session is not live'; end if;

  update public.stage_session_states
  set revision=revision+1,
      prepared_index=null,
      prepared_service_item_id=null,
      prepared_song_id=null,
      updated_at=now()
  where stage_session_id=p_stage_session_id
  returning * into v_state;
  return v_state;
end;
$$;


--
-- Name: target_stage_end(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.target_stage_end(p_stage_session_id uuid) RETURNS public.stage_session_states
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_stage public.stage_sessions;
  v_state public.stage_session_states;
begin
  select ss.*
    into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id = ss.service_id
  join public.organization_memberships om
    on om.organization_id = svc.organization_id
   and om.user_id = app.current_user_id()
  where ss.id = p_stage_session_id
  for update;

  if v_stage.id is null then
    raise exception 'stage session not found or not authorized';
  end if;

  update public.stage_sessions
  set status = 'ended',
      ended_at = coalesce(ended_at, now()),
      updated_at = now()
  where id = p_stage_session_id;

  update public.stage_session_states
  set revision = revision + 1,
      is_running = false,
      updated_at = now()
  where stage_session_id = p_stage_session_id
  returning * into v_state;

  return v_state;
end;
$$;


--
-- Name: target_stage_goto(uuid, integer, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.target_stage_goto(p_stage_session_id uuid, p_index integer, p_song_id uuid DEFAULT NULL::uuid) RETURNS public.stage_session_states
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_stage public.stage_sessions; v_state public.stage_session_states; v_item public.service_items;
begin
  select ss.* into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id=ss.service_id
  join public.organization_memberships om on om.organization_id=svc.organization_id and om.user_id=app.current_user_id()
  where ss.id=p_stage_session_id;
  if v_stage.id is null then raise exception 'stage session not found or not authorized'; end if;
  if v_stage.status <> 'live' then raise exception 'stage session is not live'; end if;

  select * into v_item
  from public.service_items si
  where si.service_id=v_stage.service_id
    and si.position=p_index
    and (p_song_id is null or si.song_id=p_song_id)
  limit 1;

  if v_item.id is null then raise exception 'stage item not found'; end if;

  update public.stage_session_states
  set revision=revision+1,
      current_index=v_item.position,
      current_service_item_id=v_item.id,
      current_song_id=v_item.song_id,
      prepared_index=null,
      prepared_service_item_id=null,
      prepared_song_id=null,
      updated_at=now()
  where stage_session_id=p_stage_session_id
  returning * into v_state;
  return v_state;
end;
$$;


--
-- Name: target_stage_next(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.target_stage_next(p_stage_session_id uuid) RETURNS public.stage_session_states
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_stage public.stage_sessions; v_state public.stage_session_states; v_item public.service_items;
begin
  select ss.* into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id=ss.service_id
  join public.organization_memberships om on om.organization_id=svc.organization_id and om.user_id=app.current_user_id()
  where ss.id=p_stage_session_id;
  if v_stage.id is null then raise exception 'stage session not found or not authorized'; end if;
  if v_stage.status <> 'live' then raise exception 'stage session is not live'; end if;

  select * into v_state from public.stage_session_states where stage_session_id=p_stage_session_id for update;
  select * into v_item
  from public.service_items si
  where si.service_id=v_stage.service_id
    and si.position > v_state.current_index
  order by si.position asc limit 1;

  if v_item.id is null then
    return v_state;
  end if;

  update public.stage_session_states
  set revision=revision+1,
      current_index=v_item.position,
      current_service_item_id=v_item.id,
      current_song_id=v_item.song_id,
      prepared_index=null,
      prepared_service_item_id=null,
      prepared_song_id=null,
      updated_at=now()
  where stage_session_id=p_stage_session_id
  returning * into v_state;
  return v_state;
end;
$$;


--
-- Name: target_stage_pause(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.target_stage_pause(p_stage_session_id uuid) RETURNS public.stage_session_states
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_stage public.stage_sessions; v_state public.stage_session_states;
begin
  select ss.* into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id=ss.service_id
  join public.organization_memberships om on om.organization_id=svc.organization_id and om.user_id=app.current_user_id()
  where ss.id=p_stage_session_id;
  if v_stage.id is null then raise exception 'stage session not found or not authorized'; end if;
  if v_stage.status <> 'live' then raise exception 'stage session is not live'; end if;

  update public.stage_session_states
  set revision=revision+1, is_running=false, updated_at=now()
  where stage_session_id=p_stage_session_id
  returning * into v_state;
  return v_state;
end;
$$;


--
-- Name: target_stage_play(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.target_stage_play(p_stage_session_id uuid) RETURNS public.stage_session_states
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_stage public.stage_sessions; v_state public.stage_session_states;
begin
  select ss.* into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id=ss.service_id
  join public.organization_memberships om on om.organization_id=svc.organization_id and om.user_id=app.current_user_id()
  where ss.id=p_stage_session_id;
  if v_stage.id is null then raise exception 'stage session not found or not authorized'; end if;
  if v_stage.status <> 'live' then raise exception 'stage session is not live'; end if;

  update public.stage_session_states
  set revision=revision+1, is_running=true, updated_at=now()
  where stage_session_id=p_stage_session_id
  returning * into v_state;
  return v_state;
end;
$$;


--
-- Name: target_stage_prepare_next(uuid, integer, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.target_stage_prepare_next(p_stage_session_id uuid, p_index integer, p_song_id uuid) RETURNS public.stage_session_states
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_stage public.stage_sessions; v_state public.stage_session_states; v_item public.service_items;
begin
  select ss.* into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id=ss.service_id
  join public.organization_memberships om on om.organization_id=svc.organization_id and om.user_id=app.current_user_id()
  where ss.id=p_stage_session_id;
  if v_stage.id is null then raise exception 'stage session not found or not authorized'; end if;
  if v_stage.status <> 'live' then raise exception 'stage session is not live'; end if;

  select * into v_item
  from public.service_items si
  where si.service_id=v_stage.service_id
    and si.position=p_index
    and si.song_id=p_song_id
  limit 1;
  if v_item.id is null then raise exception 'stage item not found'; end if;

  update public.stage_session_states
  set revision=revision+1,
      prepared_index=v_item.position,
      prepared_service_item_id=v_item.id,
      prepared_song_id=v_item.song_id,
      updated_at=now()
  where stage_session_id=p_stage_session_id
  returning * into v_state;
  return v_state;
end;
$$;


--
-- Name: target_stage_previous(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.target_stage_previous(p_stage_session_id uuid) RETURNS public.stage_session_states
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_stage public.stage_sessions; v_state public.stage_session_states; v_item public.service_items;
begin
  select ss.* into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id=ss.service_id
  join public.organization_memberships om on om.organization_id=svc.organization_id and om.user_id=app.current_user_id()
  where ss.id=p_stage_session_id;
  if v_stage.id is null then raise exception 'stage session not found or not authorized'; end if;
  if v_stage.status <> 'live' then raise exception 'stage session is not live'; end if;

  select * into v_state from public.stage_session_states where stage_session_id=p_stage_session_id for update;
  select * into v_item
  from public.service_items si
  where si.service_id=v_stage.service_id
    and si.position < v_state.current_index
  order by si.position desc limit 1;

  if v_item.id is null then
    return v_state;
  end if;

  update public.stage_session_states
  set revision=revision+1,
      current_index=v_item.position,
      current_service_item_id=v_item.id,
      current_song_id=v_item.song_id,
      prepared_index=null,
      prepared_service_item_id=null,
      prepared_song_id=null,
      updated_at=now()
  where stage_session_id=p_stage_session_id
  returning * into v_state;
  return v_state;
end;
$$;


--
-- Name: target_stage_set_annotation(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.target_stage_set_annotation(p_stage_session_id uuid, p_annotation text) RETURNS public.stage_session_states
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_stage public.stage_sessions; v_state public.stage_session_states;
begin
  select ss.* into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id=ss.service_id
  join public.organization_memberships om on om.organization_id=svc.organization_id and om.user_id=app.current_user_id()
  where ss.id=p_stage_session_id;
  if v_stage.id is null then raise exception 'stage session not found or not authorized'; end if;
  if v_stage.status <> 'live' then raise exception 'stage session is not live'; end if;

  update public.stage_session_states
  set revision=revision+1, md_annotation=left(p_annotation, 500), updated_at=now()
  where stage_session_id=p_stage_session_id
  returning * into v_state;
  return v_state;
end;
$$;


--
-- Name: target_stage_set_key(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.target_stage_set_key(p_stage_session_id uuid, p_key text) RETURNS public.stage_session_states
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_stage public.stage_sessions; v_state public.stage_session_states;
begin
  select ss.* into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id=ss.service_id
  join public.organization_memberships om on om.organization_id=svc.organization_id and om.user_id=app.current_user_id()
  where ss.id=p_stage_session_id;
  if v_stage.id is null then raise exception 'stage session not found or not authorized'; end if;
  if v_stage.status <> 'live' then raise exception 'stage session is not live'; end if;

  update public.stage_session_states
  set revision=revision+1, current_key=p_key, updated_at=now()
  where stage_session_id=p_stage_session_id
  returning * into v_state;
  return v_state;
end;
$$;


--
-- Name: target_stage_start(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.target_stage_start(p_stage_session_id uuid) RETURNS public.stage_session_states
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_stage public.stage_sessions;
  v_state public.stage_session_states;
begin
  select ss.*
    into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id = ss.service_id
  join public.organization_memberships om
    on om.organization_id = svc.organization_id
   and om.user_id = app.current_user_id()
  where ss.id = p_stage_session_id
  for update;

  if v_stage.id is null then
    raise exception 'stage session not found or not authorized';
  end if;

  if v_stage.status = 'ended' then
    raise exception 'stage session is ended';
  end if;

  update public.stage_sessions
  set status = 'live',
      started_at = coalesce(started_at, now()),
      ended_at = null,
      updated_at = now()
  where id = p_stage_session_id;

  select *
    into v_state
  from public.stage_session_states
  where stage_session_id = p_stage_session_id
  for update;

  update public.stage_session_states
  set revision = revision + 1,
      is_running = false,
      updated_at = now()
  where stage_session_id = p_stage_session_id
  returning * into v_state;

  return v_state;
end;
$$;


--
-- Name: update_organization_member_role(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_organization_member_role(p_membership_id uuid, p_role text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_target public.organization_memberships%rowtype;
  v_actor_role text;
begin
  if app.current_user_id() is null then raise exception 'authentication required'; end if;
  if p_role not in ('admin', 'member') then raise exception 'invalid member role'; end if;

  select * into v_target
  from public.organization_memberships
  where id = p_membership_id
  for update;

  if not found then raise exception 'membership not found'; end if;
  if v_target.role = 'owner' then raise exception 'owner role cannot be changed'; end if;

  select om.role::text into v_actor_role
  from public.organization_memberships om
  where om.organization_id = v_target.organization_id
    and om.user_id = app.current_user_id();

  if v_actor_role not in ('owner', 'admin') then raise exception 'not authorized'; end if;

  update public.organization_memberships
  set role = p_role, updated_at = now()
  where id = p_membership_id;
end;
$$;


--
-- Name: assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_id uuid NOT NULL,
    user_id uuid NOT NULL,
    musical_function text NOT NULL,
    service_item_id uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT assignments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text])))
);


--
-- Name: organization_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    team_id uuid NOT NULL,
    invited_by_user_id uuid NOT NULL,
    role text NOT NULL,
    invitee_email text,
    token_hash bytea NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    accepted_at timestamp with time zone,
    accepted_by_user_id uuid,
    revoked_at timestamp with time zone,
    CONSTRAINT organization_invites_check CHECK ((expires_at > created_at)),
    CONSTRAINT organization_invites_check1 CHECK (((accepted_at IS NULL) OR (revoked_at IS NULL))),
    CONSTRAINT organization_invites_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'member'::text])))
);


--
-- Name: organization_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organization_memberships_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])))
);


--
-- Name: organization_songs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_songs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    song_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: repertoire_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.repertoire_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    repertoire_id uuid NOT NULL,
    song_id uuid NOT NULL,
    "position" integer NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: repertoires; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.repertoires (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    created_by_user_id uuid NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: service_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_id uuid NOT NULL,
    song_id uuid NOT NULL,
    "position" integer NOT NULL,
    repertoire_id uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    status text DEFAULT 'planned'::text NOT NULL,
    created_by_user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT services_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'confirmed'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: songs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.songs (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    artist text,
    original_key text NOT NULL,
    current_key text NOT NULL,
    bpm integer,
    lyrics text NOT NULL,
    notes text,
    is_favorite boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: team_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: team_musical_functions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_musical_functions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_membership_id uuid NOT NULL,
    musical_function text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT team_musical_functions_musical_function_check CHECK ((musical_function = ANY (ARRAY['vocals'::text, 'electric-guitar'::text, 'acoustic-guitar'::text, 'bass'::text, 'drums'::text, 'keys'::text, 'piano'::text, 'strings'::text, 'brass'::text, 'woodwinds'::text, 'other'::text])))
);


--
-- Name: teams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teams (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT teams_name_check CHECK ((length(btrim(name)) > 0))
);


--
-- Name: assignments assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_pkey PRIMARY KEY (id);


--
-- Name: organization_invites organization_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_invites
    ADD CONSTRAINT organization_invites_pkey PRIMARY KEY (id);


--
-- Name: organization_invites organization_invites_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_invites
    ADD CONSTRAINT organization_invites_token_hash_key UNIQUE (token_hash);


--
-- Name: organization_memberships organization_memberships_organization_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_memberships
    ADD CONSTRAINT organization_memberships_organization_id_user_id_key UNIQUE (organization_id, user_id);


--
-- Name: organization_memberships organization_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_memberships
    ADD CONSTRAINT organization_memberships_pkey PRIMARY KEY (id);


--
-- Name: organization_songs organization_songs_organization_id_song_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_songs
    ADD CONSTRAINT organization_songs_organization_id_song_id_key UNIQUE (organization_id, song_id);


--
-- Name: organization_songs organization_songs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_songs
    ADD CONSTRAINT organization_songs_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: repertoire_items repertoire_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repertoire_items
    ADD CONSTRAINT repertoire_items_pkey PRIMARY KEY (id);


--
-- Name: repertoire_items repertoire_items_repertoire_id_position_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repertoire_items
    ADD CONSTRAINT repertoire_items_repertoire_id_position_key UNIQUE (repertoire_id, "position");


--
-- Name: repertoire_items repertoire_items_repertoire_id_song_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repertoire_items
    ADD CONSTRAINT repertoire_items_repertoire_id_song_id_key UNIQUE (repertoire_id, song_id);


--
-- Name: repertoires repertoires_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repertoires
    ADD CONSTRAINT repertoires_pkey PRIMARY KEY (id);


--
-- Name: service_items service_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_items
    ADD CONSTRAINT service_items_pkey PRIMARY KEY (id);


--
-- Name: service_items service_items_service_id_position_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_items
    ADD CONSTRAINT service_items_service_id_position_key UNIQUE (service_id, "position");


--
-- Name: services services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_pkey PRIMARY KEY (id);


--
-- Name: songs songs_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.songs
    ADD CONSTRAINT songs_id_key UNIQUE (id);


--
-- Name: songs songs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.songs
    ADD CONSTRAINT songs_pkey PRIMARY KEY (user_id, id);


--
-- Name: stage_session_states stage_session_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stage_session_states
    ADD CONSTRAINT stage_session_states_pkey PRIMARY KEY (stage_session_id);


--
-- Name: stage_sessions stage_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stage_sessions
    ADD CONSTRAINT stage_sessions_pkey PRIMARY KEY (id);


--
-- Name: team_memberships team_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_memberships
    ADD CONSTRAINT team_memberships_pkey PRIMARY KEY (id);


--
-- Name: team_memberships team_memberships_team_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_memberships
    ADD CONSTRAINT team_memberships_team_id_user_id_key UNIQUE (team_id, user_id);


--
-- Name: team_musical_functions team_musical_functions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_musical_functions
    ADD CONSTRAINT team_musical_functions_pkey PRIMARY KEY (id);


--
-- Name: team_musical_functions team_musical_functions_team_membership_id_musical_function_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_musical_functions
    ADD CONSTRAINT team_musical_functions_team_membership_id_musical_function_key UNIQUE (team_membership_id, musical_function);


--
-- Name: teams teams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);


--
-- Name: assignments_service_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assignments_service_idx ON public.assignments USING btree (service_id);


--
-- Name: assignments_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assignments_user_idx ON public.assignments USING btree (user_id);


--
-- Name: organization_invites_org_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_invites_org_created_idx ON public.organization_invites USING btree (organization_id, created_at DESC);


--
-- Name: organization_invites_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_invites_pending_idx ON public.organization_invites USING btree (organization_id, expires_at) WHERE ((accepted_at IS NULL) AND (revoked_at IS NULL));


--
-- Name: organization_memberships_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_memberships_user_idx ON public.organization_memberships USING btree (user_id, organization_id);


--
-- Name: organization_songs_organization_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_songs_organization_id_idx ON public.organization_songs USING btree (organization_id);


--
-- Name: organization_songs_song_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_songs_song_id_idx ON public.organization_songs USING btree (song_id);


--
-- Name: organizations_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organizations_updated_idx ON public.organizations USING btree (updated_at);


--
-- Name: repertoire_items_repertoire_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX repertoire_items_repertoire_id_idx ON public.repertoire_items USING btree (repertoire_id);


--
-- Name: repertoire_items_song_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX repertoire_items_song_id_idx ON public.repertoire_items USING btree (song_id);


--
-- Name: repertoires_organization_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX repertoires_organization_id_idx ON public.repertoires USING btree (organization_id);


--
-- Name: service_items_service_position_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX service_items_service_position_idx ON public.service_items USING btree (service_id, "position");


--
-- Name: services_organization_starts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX services_organization_starts_idx ON public.services USING btree (organization_id, starts_at);


--
-- Name: songs_user_id_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX songs_user_id_updated_at_idx ON public.songs USING btree (user_id, updated_at);


--
-- Name: stage_session_states_current_song_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stage_session_states_current_song_idx ON public.stage_session_states USING btree (current_song_id);


--
-- Name: stage_sessions_md_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stage_sessions_md_user_id_idx ON public.stage_sessions USING btree (md_user_id);


--
-- Name: stage_sessions_service_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stage_sessions_service_id_idx ON public.stage_sessions USING btree (service_id);


--
-- Name: team_memberships_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX team_memberships_user_idx ON public.team_memberships USING btree (user_id, team_id);


--
-- Name: team_musical_functions_membership_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX team_musical_functions_membership_idx ON public.team_musical_functions USING btree (team_membership_id);


--
-- Name: teams_organization_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX teams_organization_updated_idx ON public.teams USING btree (organization_id, updated_at);


--
-- Name: stage_session_states stage_session_states_operator_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER stage_session_states_operator_guard BEFORE UPDATE ON public.stage_session_states FOR EACH ROW WHEN (((old.revision IS DISTINCT FROM new.revision) OR (old.current_index IS DISTINCT FROM new.current_index) OR (old.current_service_item_id IS DISTINCT FROM new.current_service_item_id) OR (old.current_song_id IS DISTINCT FROM new.current_song_id) OR (old.current_key IS DISTINCT FROM new.current_key) OR (old.prepared_index IS DISTINCT FROM new.prepared_index) OR (old.prepared_service_item_id IS DISTINCT FROM new.prepared_service_item_id) OR (old.prepared_song_id IS DISTINCT FROM new.prepared_song_id) OR (old.is_running IS DISTINCT FROM new.is_running) OR (old.md_annotation IS DISTINCT FROM new.md_annotation))) EXECUTE FUNCTION private.assert_stage_operator();


--
-- Name: stage_sessions stage_sessions_initialize_target_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER stage_sessions_initialize_target_identity BEFORE INSERT ON public.stage_sessions FOR EACH ROW EXECUTE FUNCTION public.initialize_target_stage_identity();


--
-- Name: stage_sessions stage_sessions_initialize_target_state; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER stage_sessions_initialize_target_state AFTER INSERT ON public.stage_sessions FOR EACH ROW EXECUTE FUNCTION public.initialize_target_stage_state();


--
-- Name: stage_sessions stage_sessions_operator_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER stage_sessions_operator_guard BEFORE UPDATE ON public.stage_sessions FOR EACH ROW WHEN (((old.status IS DISTINCT FROM new.status) OR (old.started_at IS DISTINCT FROM new.started_at) OR (old.ended_at IS DISTINCT FROM new.ended_at) OR (old.md_user_id IS DISTINCT FROM new.md_user_id))) EXECUTE FUNCTION private.assert_stage_operator();


--
-- Name: assignments assignments_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;


--
-- Name: assignments assignments_service_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_service_item_id_fkey FOREIGN KEY (service_item_id) REFERENCES public.service_items(id) ON DELETE CASCADE;


--
-- Name: assignments assignments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: organization_invites organization_invites_accepted_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_invites
    ADD CONSTRAINT organization_invites_accepted_by_user_id_fkey FOREIGN KEY (accepted_by_user_id) REFERENCES app.users(id) ON DELETE SET NULL;


--
-- Name: organization_invites organization_invites_invited_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_invites
    ADD CONSTRAINT organization_invites_invited_by_user_id_fkey FOREIGN KEY (invited_by_user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: organization_invites organization_invites_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_invites
    ADD CONSTRAINT organization_invites_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_invites organization_invites_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_invites
    ADD CONSTRAINT organization_invites_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: organization_memberships organization_memberships_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_memberships
    ADD CONSTRAINT organization_memberships_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_memberships organization_memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_memberships
    ADD CONSTRAINT organization_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: organization_songs organization_songs_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_songs
    ADD CONSTRAINT organization_songs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_songs organization_songs_song_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_songs
    ADD CONSTRAINT organization_songs_song_id_fkey FOREIGN KEY (song_id) REFERENCES public.songs(id) ON DELETE CASCADE;


--
-- Name: repertoire_items repertoire_items_repertoire_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repertoire_items
    ADD CONSTRAINT repertoire_items_repertoire_id_fkey FOREIGN KEY (repertoire_id) REFERENCES public.repertoires(id) ON DELETE CASCADE;


--
-- Name: repertoire_items repertoire_items_song_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repertoire_items
    ADD CONSTRAINT repertoire_items_song_id_fkey FOREIGN KEY (song_id) REFERENCES public.songs(id) ON DELETE RESTRICT;


--
-- Name: repertoires repertoires_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repertoires
    ADD CONSTRAINT repertoires_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: service_items service_items_repertoire_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_items
    ADD CONSTRAINT service_items_repertoire_id_fkey FOREIGN KEY (repertoire_id) REFERENCES public.repertoires(id) ON DELETE SET NULL;


--
-- Name: service_items service_items_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_items
    ADD CONSTRAINT service_items_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;


--
-- Name: service_items service_items_song_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_items
    ADD CONSTRAINT service_items_song_id_fkey FOREIGN KEY (song_id) REFERENCES public.songs(id) ON DELETE RESTRICT;


--
-- Name: services services_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES app.users(id) ON DELETE RESTRICT;


--
-- Name: services services_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: songs songs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.songs
    ADD CONSTRAINT songs_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: stage_session_states stage_session_states_current_service_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stage_session_states
    ADD CONSTRAINT stage_session_states_current_service_item_id_fkey FOREIGN KEY (current_service_item_id) REFERENCES public.service_items(id) ON DELETE SET NULL;


--
-- Name: stage_session_states stage_session_states_current_song_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stage_session_states
    ADD CONSTRAINT stage_session_states_current_song_id_fkey FOREIGN KEY (current_song_id) REFERENCES public.songs(id) ON DELETE SET NULL;


--
-- Name: stage_session_states stage_session_states_prepared_service_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stage_session_states
    ADD CONSTRAINT stage_session_states_prepared_service_item_id_fkey FOREIGN KEY (prepared_service_item_id) REFERENCES public.service_items(id) ON DELETE SET NULL;


--
-- Name: stage_session_states stage_session_states_prepared_song_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stage_session_states
    ADD CONSTRAINT stage_session_states_prepared_song_id_fkey FOREIGN KEY (prepared_song_id) REFERENCES public.songs(id) ON DELETE SET NULL;


--
-- Name: stage_session_states stage_session_states_stage_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stage_session_states
    ADD CONSTRAINT stage_session_states_stage_session_id_fkey FOREIGN KEY (stage_session_id) REFERENCES public.stage_sessions(id) ON DELETE CASCADE;


--
-- Name: stage_sessions stage_sessions_md_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stage_sessions
    ADD CONSTRAINT stage_sessions_md_user_id_fkey FOREIGN KEY (md_user_id) REFERENCES app.users(id) ON DELETE SET NULL;


--
-- Name: stage_sessions stage_sessions_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stage_sessions
    ADD CONSTRAINT stage_sessions_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;


--
-- Name: team_memberships team_memberships_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_memberships
    ADD CONSTRAINT team_memberships_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: team_memberships team_memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_memberships
    ADD CONSTRAINT team_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: team_musical_functions team_musical_functions_team_membership_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_musical_functions
    ADD CONSTRAINT team_musical_functions_team_membership_id_fkey FOREIGN KEY (team_membership_id) REFERENCES public.team_memberships(id) ON DELETE CASCADE;


--
-- Name: teams teams_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_memberships Organization admins can manage memberships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organization admins can manage memberships" ON public.organization_memberships TO cantum_user USING (app.has_organization_role(organization_id, ARRAY['owner'::text, 'admin'::text])) WITH CHECK (app.has_organization_role(organization_id, ARRAY['owner'::text, 'admin'::text]));


--
-- Name: team_memberships Organization admins can manage team memberships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organization admins can manage team memberships" ON public.team_memberships TO cantum_user USING (EXISTS ( SELECT 1 FROM public.teams t WHERE t.id = team_memberships.team_id AND app.has_organization_role(t.organization_id, ARRAY['owner'::text, 'admin'::text]))) WITH CHECK (EXISTS ( SELECT 1 FROM public.teams t WHERE t.id = team_memberships.team_id AND app.has_organization_role(t.organization_id, ARRAY['owner'::text, 'admin'::text])));


--
-- Name: teams Organization admins can manage teams; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organization admins can manage teams" ON public.teams TO cantum_user USING ((EXISTS ( SELECT 1
   FROM public.organization_memberships om
  WHERE ((om.organization_id = teams.organization_id) AND (om.user_id = ( SELECT app.current_user_id() AS uid)) AND (om.role = ANY (ARRAY['owner'::text, 'admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organization_memberships om
  WHERE ((om.organization_id = teams.organization_id) AND (om.user_id = ( SELECT app.current_user_id() AS uid)) AND (om.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));


--
-- Name: organization_memberships Organization members can read memberships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organization members can read memberships" ON public.organization_memberships FOR SELECT TO cantum_user USING (app.is_organization_member(organization_id));


--
-- Name: organizations Organization members can read organizations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organization members can read organizations" ON public.organizations FOR SELECT TO cantum_user USING ((EXISTS ( SELECT 1
   FROM public.organization_memberships om
  WHERE ((om.organization_id = organizations.id) AND (om.user_id = ( SELECT app.current_user_id() AS uid))))));


--
-- Name: team_memberships Organization members can read team memberships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organization members can read team memberships" ON public.team_memberships FOR SELECT TO cantum_user USING (EXISTS ( SELECT 1 FROM public.teams t WHERE t.id = team_memberships.team_id AND app.is_organization_member(t.organization_id)));


--
-- Name: teams Organization members can read teams; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organization members can read teams" ON public.teams FOR SELECT TO cantum_user USING ((EXISTS ( SELECT 1
   FROM public.organization_memberships om
  WHERE ((om.organization_id = teams.organization_id) AND (om.user_id = ( SELECT app.current_user_id() AS uid))))));


--
-- Name: organization_invites Organization owners and admins can read invites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organization owners and admins can read invites" ON public.organization_invites FOR SELECT TO cantum_user USING ((EXISTS ( SELECT 1
   FROM public.organization_memberships om
  WHERE ((om.organization_id = organization_invites.organization_id) AND (om.user_id = app.current_user_id()) AND (om.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));


--
-- Name: organization_invites Organization owners and admins can revoke invites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organization owners and admins can revoke invites" ON public.organization_invites FOR UPDATE TO cantum_user USING (((accepted_at IS NULL) AND (revoked_at IS NULL) AND (EXISTS ( SELECT 1
   FROM public.organization_memberships om
  WHERE ((om.organization_id = organization_invites.organization_id) AND (om.user_id = app.current_user_id()) AND (om.role = ANY (ARRAY['owner'::text, 'admin'::text]))))))) WITH CHECK (((organization_id = organization_id) AND (invited_by_user_id = invited_by_user_id) AND (role = role) AND (token_hash = token_hash) AND (created_at = created_at) AND (expires_at = expires_at) AND (accepted_at = accepted_at) AND (accepted_by_user_id = accepted_by_user_id) AND (revoked_at IS NOT NULL)));


--
-- Name: organizations Organization owners can delete organizations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organization owners can delete organizations" ON public.organizations FOR DELETE TO cantum_user USING ((EXISTS ( SELECT 1
   FROM public.organization_memberships om
  WHERE ((om.organization_id = organizations.id) AND (om.user_id = ( SELECT app.current_user_id() AS uid)) AND (om.role = 'owner'::text)))));


--
-- Name: organizations Organization owners can update organizations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organization owners can update organizations" ON public.organizations FOR UPDATE TO cantum_user USING ((EXISTS ( SELECT 1
   FROM public.organization_memberships om
  WHERE ((om.organization_id = organizations.id) AND (om.user_id = ( SELECT app.current_user_id() AS uid)) AND (om.role = 'owner'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organization_memberships om
  WHERE ((om.organization_id = organizations.id) AND (om.user_id = ( SELECT app.current_user_id() AS uid)) AND (om.role = 'owner'::text)))));


--
-- Name: team_musical_functions Team members can add own musical functions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team members can add own musical functions" ON public.team_musical_functions FOR INSERT TO cantum_user WITH CHECK ((EXISTS ( SELECT 1
   FROM public.team_memberships tm
  WHERE ((tm.id = team_musical_functions.team_membership_id) AND (tm.user_id = app.current_user_id())))));


--
-- Name: team_musical_functions Team members can read musical functions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team members can read musical functions" ON public.team_musical_functions FOR SELECT TO cantum_user USING (((EXISTS ( SELECT 1
   FROM public.team_memberships tm
  WHERE ((tm.id = team_musical_functions.team_membership_id) AND (tm.user_id = app.current_user_id())))) OR (EXISTS ( SELECT 1
   FROM ((public.team_memberships tm
     JOIN public.teams t ON ((t.id = tm.team_id)))
     JOIN public.organization_memberships om ON ((om.organization_id = t.organization_id)))
  WHERE ((tm.id = team_musical_functions.team_membership_id) AND (om.user_id = app.current_user_id()) AND (om.role = ANY (ARRAY['owner'::text, 'admin'::text])))))));


--
-- Name: team_musical_functions Team members can remove own musical functions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team members can remove own musical functions" ON public.team_musical_functions FOR DELETE TO cantum_user USING ((EXISTS ( SELECT 1
   FROM public.team_memberships tm
  WHERE ((tm.id = team_musical_functions.team_membership_id) AND (tm.user_id = app.current_user_id())))));


--
-- Name: songs Users can create own songs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own songs" ON public.songs FOR INSERT TO cantum_user WITH CHECK ((( SELECT app.current_user_id() AS uid) = user_id));


--
-- Name: songs Users can delete own songs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own songs" ON public.songs FOR DELETE TO cantum_user USING ((( SELECT app.current_user_id() AS uid) = user_id));


--
-- Name: songs Users can read own songs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own songs" ON public.songs FOR SELECT TO cantum_user USING ((( SELECT app.current_user_id() AS uid) = user_id));


--
-- Name: songs Users can update own songs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own songs" ON public.songs FOR UPDATE TO cantum_user USING ((( SELECT app.current_user_id() AS uid) = user_id)) WITH CHECK ((( SELECT app.current_user_id() AS uid) = user_id));


--
-- Name: assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_songs organization admins can delete organization songs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "organization admins can delete organization songs" ON public.organization_songs FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.organization_memberships om
  WHERE ((om.organization_id = organization_songs.organization_id) AND (om.user_id = app.current_user_id()) AND (om.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));


--
-- Name: organization_songs organization admins can insert organization songs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "organization admins can insert organization songs" ON public.organization_songs FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organization_memberships om
  WHERE ((om.organization_id = organization_songs.organization_id) AND (om.user_id = app.current_user_id()) AND (om.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));


--
-- Name: organization_songs organization admins can update organization songs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "organization admins can update organization songs" ON public.organization_songs FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.organization_memberships om
  WHERE ((om.organization_id = organization_songs.organization_id) AND (om.user_id = app.current_user_id()) AND (om.role = ANY (ARRAY['owner'::text, 'admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organization_memberships om
  WHERE ((om.organization_id = organization_songs.organization_id) AND (om.user_id = app.current_user_id()) AND (om.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));


--
-- Name: assignments organization admins can write assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "organization admins can write assignments" ON public.assignments USING ((EXISTS ( SELECT 1
   FROM (public.services s
     JOIN public.organization_memberships om ON ((om.organization_id = s.organization_id)))
  WHERE ((s.id = assignments.service_id) AND (om.user_id = app.current_user_id()) AND (om.role = ANY (ARRAY['owner'::text, 'admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.services s
     JOIN public.organization_memberships om ON ((om.organization_id = s.organization_id)))
  WHERE ((s.id = assignments.service_id) AND (om.user_id = app.current_user_id()) AND (om.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));


--
-- Name: repertoire_items organization admins can write repertoire items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "organization admins can write repertoire items" ON public.repertoire_items USING ((EXISTS ( SELECT 1
   FROM (public.repertoires r
     JOIN public.organization_memberships om ON ((om.organization_id = r.organization_id)))
  WHERE ((r.id = repertoire_items.repertoire_id) AND (om.user_id = app.current_user_id()) AND (om.role = ANY (ARRAY['owner'::text, 'admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.repertoires r
     JOIN public.organization_memberships om ON ((om.organization_id = r.organization_id)))
  WHERE ((r.id = repertoire_items.repertoire_id) AND (om.user_id = app.current_user_id()) AND (om.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));


--
-- Name: repertoires organization admins can write repertoires; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "organization admins can write repertoires" ON public.repertoires USING ((EXISTS ( SELECT 1
   FROM public.organization_memberships om
  WHERE ((om.organization_id = repertoires.organization_id) AND (om.user_id = app.current_user_id()) AND (om.role = ANY (ARRAY['owner'::text, 'admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organization_memberships om
  WHERE ((om.organization_id = repertoires.organization_id) AND (om.user_id = app.current_user_id()) AND (om.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));


--
-- Name: service_items organization admins can write service items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "organization admins can write service items" ON public.service_items USING ((EXISTS ( SELECT 1
   FROM (public.services s
     JOIN public.organization_memberships om ON ((om.organization_id = s.organization_id)))
  WHERE ((s.id = service_items.service_id) AND (om.user_id = app.current_user_id()) AND (om.role = ANY (ARRAY['owner'::text, 'admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.services s
     JOIN public.organization_memberships om ON ((om.organization_id = s.organization_id)))
  WHERE ((s.id = service_items.service_id) AND (om.user_id = app.current_user_id()) AND (om.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));


--
-- Name: services organization admins can write services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "organization admins can write services" ON public.services USING ((EXISTS ( SELECT 1
   FROM public.organization_memberships om
  WHERE ((om.organization_id = services.organization_id) AND (om.user_id = app.current_user_id()) AND (om.role = ANY (ARRAY['owner'::text, 'admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organization_memberships om
  WHERE ((om.organization_id = services.organization_id) AND (om.user_id = app.current_user_id()) AND (om.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));


--
-- Name: assignments organization members can read assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "organization members can read assignments" ON public.assignments FOR SELECT USING (((user_id = app.current_user_id()) OR (EXISTS ( SELECT 1
   FROM (public.services s
     JOIN public.organization_memberships om ON ((om.organization_id = s.organization_id)))
  WHERE ((s.id = assignments.service_id) AND (om.user_id = app.current_user_id()) AND (om.role = ANY (ARRAY['owner'::text, 'admin'::text])))))));


--
-- Name: organization_songs organization members can read organization songs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "organization members can read organization songs" ON public.organization_songs FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.organization_memberships om
  WHERE ((om.organization_id = organization_songs.organization_id) AND (om.user_id = app.current_user_id())))));


--
-- Name: repertoire_items organization members can read repertoire items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "organization members can read repertoire items" ON public.repertoire_items FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.repertoires r
     JOIN public.organization_memberships om ON ((om.organization_id = r.organization_id)))
  WHERE ((r.id = repertoire_items.repertoire_id) AND (om.user_id = app.current_user_id())))));


--
-- Name: repertoires organization members can read repertoires; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "organization members can read repertoires" ON public.repertoires FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.organization_memberships om
  WHERE ((om.organization_id = repertoires.organization_id) AND (om.user_id = app.current_user_id())))));


--
-- Name: service_items organization members can read service items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "organization members can read service items" ON public.service_items FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.services s
     JOIN public.organization_memberships om ON ((om.organization_id = s.organization_id)))
  WHERE ((s.id = service_items.service_id) AND (om.user_id = app.current_user_id())))));


--
-- Name: services organization members can read services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "organization members can read services" ON public.services FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.organization_memberships om
  WHERE ((om.organization_id = services.organization_id) AND (om.user_id = app.current_user_id())))));


--
-- Name: stage_session_states organization members can read stage session states; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "organization members can read stage session states" ON public.stage_session_states FOR SELECT TO cantum_user USING ((EXISTS ( SELECT 1
   FROM ((public.stage_sessions ss
     JOIN public.services svc ON ((svc.id = ss.service_id)))
     JOIN public.organization_memberships om ON ((om.organization_id = svc.organization_id)))
  WHERE ((ss.id = stage_session_states.stage_session_id) AND (om.user_id = app.current_user_id())))));


--
-- Name: stage_sessions organization members can read stage sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "organization members can read stage sessions" ON public.stage_sessions FOR SELECT TO cantum_user USING ((EXISTS ( SELECT 1
   FROM (public.services s
     JOIN public.organization_memberships om ON ((om.organization_id = s.organization_id)))
  WHERE ((s.id = stage_sessions.service_id) AND (om.user_id = app.current_user_id())))));


--
-- Name: organization_invites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_invites ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_memberships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_songs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_songs ENABLE ROW LEVEL SECURITY;

--
-- Name: organizations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

--
-- Name: repertoire_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.repertoire_items ENABLE ROW LEVEL SECURITY;

--
-- Name: repertoires; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.repertoires ENABLE ROW LEVEL SECURITY;

--
-- Name: service_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.service_items ENABLE ROW LEVEL SECURITY;

--
-- Name: services; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

--
-- Name: songs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;

--
-- Name: stage_session_states; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stage_session_states ENABLE ROW LEVEL SECURITY;

--
-- Name: stage_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stage_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: team_memberships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team_memberships ENABLE ROW LEVEL SECURITY;

--
-- Name: team_musical_functions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team_musical_functions ENABLE ROW LEVEL SECURITY;

--
-- Name: teams; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA app; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA app TO cantum_anon;
GRANT USAGE ON SCHEMA app TO cantum_user;


--
-- Name: FUNCTION current_user_id(); Type: ACL; Schema: app; Owner: -
--

REVOKE ALL ON FUNCTION app.current_user_id() FROM PUBLIC;
GRANT ALL ON FUNCTION app.current_user_id() TO cantum_anon;
GRANT ALL ON FUNCTION app.current_user_id() TO cantum_user;


--
-- Name: FUNCTION accept_organization_invite(p_token text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.accept_organization_invite(p_token text) FROM PUBLIC;
GRANT ALL ON FUNCTION private.accept_organization_invite(p_token text) TO cantum_user;


--
-- Name: FUNCTION create_organization_invite(p_organization_id uuid, p_team_id uuid, p_role text, p_invitee_email text, p_expires_in_hours integer); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.create_organization_invite(p_organization_id uuid, p_team_id uuid, p_role text, p_invitee_email text, p_expires_in_hours integer) FROM PUBLIC;
GRANT ALL ON FUNCTION private.create_organization_invite(p_organization_id uuid, p_team_id uuid, p_role text, p_invitee_email text, p_expires_in_hours integer) TO cantum_user;


--
-- Name: FUNCTION get_organization_invite(p_token text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.get_organization_invite(p_token text) FROM PUBLIC;
GRANT ALL ON FUNCTION private.get_organization_invite(p_token text) TO cantum_user;


--
-- Name: FUNCTION revoke_organization_invite(p_invite_id uuid); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.revoke_organization_invite(p_invite_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION private.revoke_organization_invite(p_invite_id uuid) TO cantum_user;


--
-- Name: FUNCTION accept_organization_invite(p_token text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.accept_organization_invite(p_token text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.accept_organization_invite(p_token text) TO cantum_user;


--
-- Name: TABLE organizations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,DELETE,UPDATE ON TABLE public.organizations TO cantum_user;


--
-- Name: FUNCTION create_organization(p_id uuid, p_name text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_organization(p_id uuid, p_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_organization(p_id uuid, p_name text) TO cantum_user;


--
-- Name: FUNCTION create_organization_invite(p_organization_id uuid, p_team_id uuid, p_role text, p_invitee_email text, p_expires_in_hours integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_organization_invite(p_organization_id uuid, p_team_id uuid, p_role text, p_invitee_email text, p_expires_in_hours integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_organization_invite(p_organization_id uuid, p_team_id uuid, p_role text, p_invitee_email text, p_expires_in_hours integer) TO cantum_user;


--
-- Name: TABLE stage_sessions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.stage_sessions TO cantum_user;


--
-- Name: FUNCTION create_target_stage_session(p_service_id uuid, p_session_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_target_stage_session(p_service_id uuid, p_session_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_target_stage_session(p_service_id uuid, p_session_id uuid) TO cantum_user;


--
-- Name: FUNCTION get_my_team_musical_functions(p_team_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_team_musical_functions(p_team_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_team_musical_functions(p_team_id uuid) TO cantum_user;


--
-- Name: FUNCTION get_organization_invite(p_token text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_organization_invite(p_token text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_organization_invite(p_token text) TO cantum_user;


--
-- Name: FUNCTION get_service_stage_session(p_stage_session_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_service_stage_session(p_stage_session_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_service_stage_session(p_stage_session_id uuid) TO cantum_user;


--
-- Name: FUNCTION get_service_stage_songs(p_stage_session_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_service_stage_songs(p_stage_session_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_service_stage_songs(p_stage_session_id uuid) TO cantum_user;


--
-- Name: FUNCTION get_target_stage_snapshot(p_stage_session_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_target_stage_snapshot(p_stage_session_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_target_stage_snapshot(p_stage_session_id uuid) TO cantum_user;


--
-- Name: FUNCTION initialize_target_stage_state(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.initialize_target_stage_state() FROM PUBLIC;


--
-- Name: FUNCTION remove_organization_member(p_membership_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.remove_organization_member(p_membership_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.remove_organization_member(p_membership_id uuid) TO cantum_user;


--
-- Name: FUNCTION revoke_organization_invite(p_invite_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.revoke_organization_invite(p_invite_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.revoke_organization_invite(p_invite_id uuid) TO cantum_user;


--
-- Name: FUNCTION set_my_team_musical_functions(p_team_id uuid, p_musical_functions text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_my_team_musical_functions(p_team_id uuid, p_musical_functions text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_my_team_musical_functions(p_team_id uuid, p_musical_functions text[]) TO cantum_user;


--
-- Name: TABLE stage_session_states; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.stage_session_states TO cantum_user;


--
-- Name: FUNCTION target_stage_clear_prepared(p_stage_session_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.target_stage_clear_prepared(p_stage_session_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.target_stage_clear_prepared(p_stage_session_id uuid) TO cantum_user;


--
-- Name: FUNCTION target_stage_end(p_stage_session_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.target_stage_end(p_stage_session_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.target_stage_end(p_stage_session_id uuid) TO cantum_user;


--
-- Name: FUNCTION target_stage_goto(p_stage_session_id uuid, p_index integer, p_song_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.target_stage_goto(p_stage_session_id uuid, p_index integer, p_song_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.target_stage_goto(p_stage_session_id uuid, p_index integer, p_song_id uuid) TO cantum_user;


--
-- Name: FUNCTION target_stage_next(p_stage_session_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.target_stage_next(p_stage_session_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.target_stage_next(p_stage_session_id uuid) TO cantum_user;


--
-- Name: FUNCTION target_stage_pause(p_stage_session_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.target_stage_pause(p_stage_session_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.target_stage_pause(p_stage_session_id uuid) TO cantum_user;


--
-- Name: FUNCTION target_stage_play(p_stage_session_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.target_stage_play(p_stage_session_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.target_stage_play(p_stage_session_id uuid) TO cantum_user;


--
-- Name: FUNCTION target_stage_prepare_next(p_stage_session_id uuid, p_index integer, p_song_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.target_stage_prepare_next(p_stage_session_id uuid, p_index integer, p_song_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.target_stage_prepare_next(p_stage_session_id uuid, p_index integer, p_song_id uuid) TO cantum_user;


--
-- Name: FUNCTION target_stage_previous(p_stage_session_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.target_stage_previous(p_stage_session_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.target_stage_previous(p_stage_session_id uuid) TO cantum_user;


--
-- Name: FUNCTION target_stage_set_annotation(p_stage_session_id uuid, p_annotation text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.target_stage_set_annotation(p_stage_session_id uuid, p_annotation text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.target_stage_set_annotation(p_stage_session_id uuid, p_annotation text) TO cantum_user;


--
-- Name: FUNCTION target_stage_set_key(p_stage_session_id uuid, p_key text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.target_stage_set_key(p_stage_session_id uuid, p_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.target_stage_set_key(p_stage_session_id uuid, p_key text) TO cantum_user;


--
-- Name: FUNCTION target_stage_start(p_stage_session_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.target_stage_start(p_stage_session_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.target_stage_start(p_stage_session_id uuid) TO cantum_user;


--
-- Name: FUNCTION update_organization_member_role(p_membership_id uuid, p_role text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_organization_member_role(p_membership_id uuid, p_role text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_organization_member_role(p_membership_id uuid, p_role text) TO cantum_user;


--
-- Name: TABLE assignments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.assignments TO cantum_user;


--
-- Name: TABLE organization_invites; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,UPDATE ON TABLE public.organization_invites TO cantum_user;


--
-- Name: TABLE organization_memberships; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.organization_memberships TO cantum_user;


--
-- Name: TABLE organization_songs; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.organization_songs TO cantum_user;


--
-- Name: TABLE repertoire_items; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.repertoire_items TO cantum_user;


--
-- Name: TABLE repertoires; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.repertoires TO cantum_user;


--
-- Name: TABLE service_items; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.service_items TO cantum_user;


--
-- Name: TABLE services; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.services TO cantum_user;


--
-- Name: TABLE songs; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.songs TO cantum_user;


--
-- Name: TABLE team_memberships; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.team_memberships TO cantum_user;


--
-- Name: TABLE team_musical_functions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE ON TABLE public.team_musical_functions TO cantum_user;


--
-- Name: TABLE teams; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.teams TO cantum_user;
