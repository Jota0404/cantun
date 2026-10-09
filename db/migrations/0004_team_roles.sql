-- CANTUM — B2 / VS-01: papéis em dois níveis, status do membro e permissões no banco.
-- ADR-051 · docs/PERMISSIONS.md · docs/specs/VS-01-equipe.md (RN-01…RN-16).
--
-- 1. team_memberships.role/status + backfill; guarda contra escrita direta.
-- 2. Criador da equipe vira leader no servidor (trigger em teams).
-- 3. app.has_permission e helpers; RPCs de papel, status e funções.
-- 4. Políticas da matriz (organização, equipes, vínculos, funções, músicas, repertórios, convites).
-- 5. Convites: sem e-mail só concede member; aceite com e-mail exige e-mail verificado.
-- 6. app.users.display_name + set_my_display_name + get_organization_member_profiles.
-- 7. Stage exige stage.run (N11).

-- ---------------------------------------------------------------------------
-- 1. Papel e status de equipe
-- ---------------------------------------------------------------------------

alter table public.team_memberships
  add column role text not null default 'member' check (role in ('leader', 'member')),
  add column status text not null default 'active' check (status in ('active', 'inactive'));

-- Backfill: teams não guarda o criador. O vínculo mais antigo de cada equipe vira
-- leader se a pessoa for owner ou admin da organização; senão a equipe fica sem
-- Líder e Owner/Admin promovem.
update public.team_memberships tm
set role = 'leader'
from (
  select distinct on (tm2.team_id) tm2.id
  from public.team_memberships tm2
  order by tm2.team_id, tm2.created_at, tm2.id
) first_membership, public.teams t, public.organization_memberships om
where tm.id = first_membership.id
  and t.id = tm.team_id
  and om.organization_id = t.organization_id
  and om.user_id = tm.user_id
  and om.role in ('owner', 'admin');

-- Escrita direta não muda role/status nem move o vínculo. As funções security
-- definer (dono da tabela) passam: current_user é o dono. Sem GUC como bypass.
create function app.guard_team_membership() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if current_user = (select pg_catalog.pg_get_userbyid(c.relowner) from pg_catalog.pg_class c where c.oid = tg_relid) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.role <> 'member' or new.status <> 'active' then
      raise exception 'team membership role and status change only through RPC' using errcode = 'insufficient_privilege';
    end if;
  elsif new.role is distinct from old.role or new.status is distinct from old.status
     or new.team_id is distinct from old.team_id or new.user_id is distinct from old.user_id then
    raise exception 'team membership role and status change only through RPC' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
revoke all on function app.guard_team_membership() from public;

create trigger team_memberships_guard
  before insert or update on public.team_memberships
  for each row execute function app.guard_team_membership();

-- Reforço (ADR-051): o cliente não grava role/status nem por upsert.
revoke insert, update on public.team_memberships from cantum_user;
grant insert (id, team_id, user_id, created_at, updated_at) on public.team_memberships to cantum_user;
grant update (team_id, user_id, created_at, updated_at) on public.team_memberships to cantum_user;

-- ---------------------------------------------------------------------------
-- 2. app.has_permission (ADR-051; matriz em docs/PERMISSIONS.md §3 e §4)
-- ---------------------------------------------------------------------------

create function app.has_permission(p_organization_id uuid, p_team_id uuid, p_capability text) returns boolean
  language plpgsql stable security definer
  set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_org_role text;
  v_team_role text;
  v_team_status text;
  v_privileged boolean;
begin
  if v_user_id is null or p_organization_id is null or p_capability is null then
    return false;
  end if;

  select om.role into v_org_role
  from public.organization_memberships om
  where om.organization_id = p_organization_id and om.user_id = v_user_id;
  if v_org_role is null then
    return false;
  end if;

  -- Equipe informada tem de ser da organização (N14), em qualquer escopo.
  if p_team_id is not null and not exists (
    select 1 from public.teams t where t.id = p_team_id and t.organization_id = p_organization_id
  ) then
    return false;
  end if;

  v_privileged := v_org_role in ('owner', 'admin');

  -- Escopo organização
  if p_capability = 'organization.delete' then
    return v_org_role = 'owner';
  elsif p_capability in ('organization.edit', 'team.create', 'song.delete', 'repertoire.delete') then
    return v_privileged;
  elsif p_capability in ('song.edit', 'repertoire.edit') then
    -- L*: Líder ativo de alguma equipe da organização.
    return v_privileged or exists (
      select 1 from public.team_memberships tm
      join public.teams t on t.id = tm.team_id
      where t.organization_id = p_organization_id and tm.user_id = v_user_id
        and tm.role = 'leader' and tm.status = 'active'
    );
  elsif p_capability in ('song.create', 'song.edit_own', 'song.delete_own',
                         'repertoire.create', 'repertoire.edit_own', 'repertoire.delete_own', 'stage.run') then
    -- Ativo na organização: sem vínculos de equipe nela ou com ao menos um active.
    return v_privileged or not exists (
      select 1 from public.team_memberships tm
      join public.teams t on t.id = tm.team_id
      where t.organization_id = p_organization_id and tm.user_id = v_user_id
    ) or exists (
      select 1 from public.team_memberships tm
      join public.teams t on t.id = tm.team_id
      where t.organization_id = p_organization_id and tm.user_id = v_user_id and tm.status = 'active'
    );
  end if;

  -- Escopo equipe
  if p_capability not in ('team.rename', 'team.delete', 'team_member.add', 'team_member.set_status',
                          'team_member.set_leader_status', 'team_member.set_role',
                          'team_member.set_functions', 'team_member.set_own_functions') then
    return false;
  end if;
  if p_team_id is null then
    return false;
  end if;
  if v_privileged then
    return true;
  end if;

  select tm.role, tm.status into v_team_role, v_team_status
  from public.team_memberships tm
  where tm.team_id = p_team_id and tm.user_id = v_user_id;
  if v_team_status is distinct from 'active' then
    return false;
  end if;

  if p_capability in ('team.rename', 'team_member.add', 'team_member.set_status', 'team_member.set_functions') then
    return v_team_role = 'leader';
  elsif p_capability = 'team_member.set_own_functions' then
    return true;
  end if;
  return false; -- team.delete, set_role, set_leader_status: só Owner e Admin
end;
$$;
revoke all on function app.has_permission(uuid, uuid, text) from public;
grant execute on function app.has_permission(uuid, uuid, text) to cantum_user;

-- Funções de um vínculo: o próprio (set_own_functions) ou de outro (set_functions).
-- O Líder não edita membro inactive (PERMISSIONS.md §4); Owner e Admin editam.
create function app.can_set_member_functions(p_team_membership_id uuid) returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select coalesce((
    select case
      when tm.user_id = app.current_user_id()
        then app.has_permission(t.organization_id, tm.team_id, 'team_member.set_own_functions')
      else app.has_permission(t.organization_id, tm.team_id, 'team_member.set_functions')
        and (tm.status = 'active' or app.has_organization_role(t.organization_id, array['owner', 'admin']))
    end
    from public.team_memberships tm
    join public.teams t on t.id = tm.team_id
    where tm.id = p_team_membership_id
  ), false)
$$;
revoke all on function app.can_set_member_functions(uuid) from public;
grant execute on function app.can_set_member_functions(uuid) to cantum_user;

-- Música de outra pessoa (alternativa A): só se vinculada a exatamente uma organização.
create function app.can_manage_organization_song(p_song_id uuid, p_capability text) returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select p_capability in ('song.edit', 'song.delete') and coalesce((
    select app.has_permission(min(os.organization_id::text)::uuid, null, p_capability)
    from public.organization_songs os
    where os.song_id = p_song_id
    having count(*) = 1
  ), false)
$$;
revoke all on function app.can_manage_organization_song(uuid, text) from public;
grant execute on function app.can_manage_organization_song(uuid, text) to cantum_user;

-- Dono da música sem passar pela RLS de songs (que consulta organization_songs:
-- usar a tabela direto nas políticas de organization_songs entraria em recursão).
create function app.is_my_song(p_song_id uuid) returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select exists (select 1 from public.songs s where s.id = p_song_id and s.user_id = app.current_user_id())
$$;
revoke all on function app.is_my_song(uuid) from public;
grant execute on function app.is_my_song(uuid) to cantum_user;

create function app.can_edit_repertoire(p_repertoire_id uuid) returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select coalesce((
    select app.has_permission(r.organization_id, null, 'repertoire.edit')
      or (r.created_by_user_id = app.current_user_id()
          and app.has_permission(r.organization_id, null, 'repertoire.edit_own'))
    from public.repertoires r
    where r.id = p_repertoire_id
  ), false)
$$;
revoke all on function app.can_edit_repertoire(uuid) from public;
grant execute on function app.can_edit_repertoire(uuid) to cantum_user;

-- Autoria e organização não mudam por update: senão quem edita viraria "dono"
-- e ganharia *.delete_own.
create function app.guard_content_owner() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  -- Ifs aninhados: o PL/pgSQL não garante curto-circuito ao resolver campos de new.
  if tg_table_name = 'songs' then
    if new.user_id is distinct from old.user_id or new.id is distinct from old.id then
      raise exception 'song owner cannot change' using errcode = 'insufficient_privilege';
    end if;
  elsif new.created_by_user_id is distinct from old.created_by_user_id
     or new.organization_id is distinct from old.organization_id then
    raise exception 'repertoire owner and organization cannot change' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
revoke all on function app.guard_content_owner() from public;

create trigger songs_guard_owner before update on public.songs
  for each row execute function app.guard_content_owner();
create trigger repertoires_guard_owner before update on public.repertoires
  for each row execute function app.guard_content_owner();

-- ---------------------------------------------------------------------------
-- 3. Criador da equipe vira leader (RN-03)
-- ---------------------------------------------------------------------------

create function app.create_team_leader() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if app.current_user_id() is not null then
    insert into public.team_memberships (team_id, user_id, role, status)
    values (new.id, app.current_user_id(), 'leader', 'active')
    on conflict (team_id, user_id) do nothing;
  end if;
  return null;
end;
$$;
revoke all on function app.create_team_leader() from public;

create trigger teams_create_leader after insert on public.teams
  for each row execute function app.create_team_leader();

-- ---------------------------------------------------------------------------
-- 4. RPCs de papel, status e funções
-- ---------------------------------------------------------------------------

create function public.set_team_member_role(p_team_membership_id uuid, p_role text) returns public.team_memberships
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_target public.team_memberships;
  v_organization_id uuid;
begin
  if app.current_user_id() is null then raise exception 'authentication required'; end if;
  if p_role is null or p_role not in ('leader', 'member') then raise exception 'invalid team role'; end if;

  select tm.* into v_target from public.team_memberships tm where tm.id = p_team_membership_id for update;
  select t.organization_id into v_organization_id from public.teams t where t.id = v_target.team_id;
  if v_target.id is null or not app.has_permission(v_organization_id, v_target.team_id, 'team_member.set_role') then
    raise exception 'not authorized to change team role';
  end if;

  update public.team_memberships set role = p_role, updated_at = now()
  where id = p_team_membership_id
  returning * into v_target;
  return v_target;
end;
$$;
revoke all on function public.set_team_member_role(uuid, text) from public;
grant execute on function public.set_team_member_role(uuid, text) to cantum_user;

create function public.set_team_member_status(p_team_membership_id uuid, p_status text) returns public.team_memberships
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_target public.team_memberships;
  v_organization_id uuid;
  v_capability text;
begin
  if app.current_user_id() is null then raise exception 'authentication required'; end if;
  if p_status is null or p_status not in ('active', 'inactive') then raise exception 'invalid team member status'; end if;

  select tm.* into v_target from public.team_memberships tm where tm.id = p_team_membership_id for update;
  select t.organization_id into v_organization_id from public.teams t where t.id = v_target.team_id;
  -- Alvo Líder (inclusive o próprio Líder): só Owner e Admin (N3).
  v_capability := case when v_target.role = 'leader' then 'team_member.set_leader_status' else 'team_member.set_status' end;
  if v_target.id is null or not app.has_permission(v_organization_id, v_target.team_id, v_capability) then
    raise exception 'not authorized to change team member status';
  end if;

  update public.team_memberships set status = p_status, updated_at = now()
  where id = p_team_membership_id
  returning * into v_target;
  return v_target;
end;
$$;
revoke all on function public.set_team_member_status(uuid, text) from public;
grant execute on function public.set_team_member_status(uuid, text) to cantum_user;

create function public.set_team_member_functions(p_team_membership_id uuid, p_musical_functions text[]) returns table(musical_function text)
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_function text;
begin
  if app.current_user_id() is null then raise exception 'authentication required'; end if;
  if not app.can_set_member_functions(p_team_membership_id) then
    raise exception 'not authorized to change musical functions';
  end if;

  delete from public.team_musical_functions tmf where tmf.team_membership_id = p_team_membership_id;
  foreach v_function in array coalesce(p_musical_functions, array[]::text[]) loop
    if v_function not in ('vocals', 'electric-guitar', 'acoustic-guitar', 'bass', 'drums',
                          'keys', 'piano', 'strings', 'brass', 'woodwinds', 'other') then
      raise exception 'invalid musical function';
    end if;
    insert into public.team_musical_functions (team_membership_id, musical_function)
    values (p_team_membership_id, v_function)
    on conflict do nothing;
  end loop;

  return query
    select tmf.musical_function from public.team_musical_functions tmf
    where tmf.team_membership_id = p_team_membership_id
    order by tmf.musical_function;
end;
$$;
revoke all on function public.set_team_member_functions(uuid, text[]) from public;
grant execute on function public.set_team_member_functions(uuid, text[]) to cantum_user;

-- A RPC existente passa a exigir set_own_functions (vínculo active).
create or replace function public.set_my_team_musical_functions(p_team_id uuid, p_musical_functions text[]) returns table(musical_function text)
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_membership_id uuid;
begin
  if app.current_user_id() is null then raise exception 'authentication required'; end if;
  select tm.id into v_membership_id
  from public.team_memberships tm
  where tm.team_id = p_team_id and tm.user_id = app.current_user_id();
  if v_membership_id is null then raise exception 'team membership not found'; end if;

  return query select * from public.set_team_member_functions(v_membership_id, p_musical_functions);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Políticas da matriz
-- ---------------------------------------------------------------------------

-- Organização: Admin renomeia; só o Owner exclui.
drop policy "Organization owners can update organizations" on public.organizations;
drop policy "Organization owners can delete organizations" on public.organizations;
create policy organizations_update on public.organizations for update to cantum_user
  using (app.has_permission(id, null, 'organization.edit'))
  with check (app.has_permission(id, null, 'organization.edit'));
create policy organizations_delete on public.organizations for delete to cantum_user
  using (app.has_permission(id, null, 'organization.delete'));

-- Equipes
drop policy "Organization admins can manage teams" on public.teams;
create policy teams_insert on public.teams for insert to cantum_user
  with check (app.has_permission(organization_id, null, 'team.create'));
create policy teams_update on public.teams for update to cantum_user
  using (app.has_permission(organization_id, id, 'team.rename'))
  with check (app.has_permission(organization_id, id, 'team.rename'));
create policy teams_delete on public.teams for delete to cantum_user
  using (app.has_permission(organization_id, id, 'team.delete'));

-- Vínculos de equipe: adicionar só quem já é da organização; delete segue
-- restrito a Owner e Admin (team_member.remove fica para o B8).
drop policy "Organization admins can manage team memberships" on public.team_memberships;
create policy team_memberships_insert on public.team_memberships for insert to cantum_user
  with check (exists (
    select 1 from public.teams t
    where t.id = team_memberships.team_id
      and app.has_permission(t.organization_id, t.id, 'team_member.add')
      and exists (select 1 from public.organization_memberships om
                  where om.organization_id = t.organization_id and om.user_id = team_memberships.user_id)
  ));
create policy team_memberships_update on public.team_memberships for update to cantum_user
  using (exists (select 1 from public.teams t where t.id = team_memberships.team_id
                 and app.has_permission(t.organization_id, t.id, 'team_member.add')))
  with check (exists (select 1 from public.teams t where t.id = team_memberships.team_id
                      and app.has_permission(t.organization_id, t.id, 'team_member.add')));
create policy team_memberships_delete on public.team_memberships for delete to cantum_user
  using (exists (select 1 from public.teams t where t.id = team_memberships.team_id
                 and app.has_organization_role(t.organization_id, array['owner', 'admin'])));

-- Funções musicais: membros da organização leem (tela de Equipe); escrita pela matriz.
drop policy "Team members can add own musical functions" on public.team_musical_functions;
drop policy "Team members can read musical functions" on public.team_musical_functions;
drop policy "Team members can remove own musical functions" on public.team_musical_functions;
create policy team_musical_functions_select on public.team_musical_functions for select to cantum_user
  using (exists (
    select 1 from public.team_memberships tm
    join public.teams t on t.id = tm.team_id
    where tm.id = team_musical_functions.team_membership_id and app.is_organization_member(t.organization_id)
  ));
create policy team_musical_functions_insert on public.team_musical_functions for insert to cantum_user
  with check (app.can_set_member_functions(team_membership_id));
create policy team_musical_functions_delete on public.team_musical_functions for delete to cantum_user
  using (app.can_set_member_functions(team_membership_id));

-- Músicas (alternativa A): as políticas "own" continuam; membros leem as vinculadas
-- à organização; terceiros editam/excluem conforme a matriz.
create policy songs_organization_select on public.songs for select to cantum_user
  using (exists (select 1 from public.organization_songs os
                 where os.song_id = songs.id and app.is_organization_member(os.organization_id)));
create policy songs_organization_update on public.songs for update to cantum_user
  using (app.can_manage_organization_song(id, 'song.edit'))
  with check (app.can_manage_organization_song(id, 'song.edit'));
create policy songs_organization_delete on public.songs for delete to cantum_user
  using (app.can_manage_organization_song(id, 'song.delete'));

-- Vínculo música-organização: só o dono vincula a própria música (song.create);
-- desvincular: Owner/Admin (song.delete) ou o dono (song.delete_own).
drop policy "organization admins can insert organization songs" on public.organization_songs;
drop policy "organization admins can update organization songs" on public.organization_songs;
drop policy "organization admins can delete organization songs" on public.organization_songs;
create policy organization_songs_insert on public.organization_songs for insert to cantum_user
  with check (
    app.has_permission(organization_id, null, 'song.create')
    and app.is_my_song(song_id)
  );
create policy organization_songs_update on public.organization_songs for update to cantum_user
  using (app.has_permission(organization_id, null, 'song.delete'))
  with check (app.has_permission(organization_id, null, 'song.delete'));
create policy organization_songs_delete on public.organization_songs for delete to cantum_user
  using (
    app.has_permission(organization_id, null, 'song.delete')
    or (app.has_permission(organization_id, null, 'song.delete_own')
        and app.is_my_song(song_id))
  );

-- Repertórios
drop policy "organization admins can write repertoires" on public.repertoires;
create policy repertoires_insert on public.repertoires for insert to cantum_user
  with check (created_by_user_id = app.current_user_id()
              and app.has_permission(organization_id, null, 'repertoire.create'));
create policy repertoires_update on public.repertoires for update to cantum_user
  using (app.has_permission(organization_id, null, 'repertoire.edit')
         or (created_by_user_id = app.current_user_id() and app.has_permission(organization_id, null, 'repertoire.edit_own')))
  with check (app.has_permission(organization_id, null, 'repertoire.edit')
              or (created_by_user_id = app.current_user_id() and app.has_permission(organization_id, null, 'repertoire.edit_own')));
create policy repertoires_delete on public.repertoires for delete to cantum_user
  using (app.has_permission(organization_id, null, 'repertoire.delete')
         or (created_by_user_id = app.current_user_id() and app.has_permission(organization_id, null, 'repertoire.delete_own')));

drop policy "organization admins can write repertoire items" on public.repertoire_items;
create policy repertoire_items_write on public.repertoire_items to cantum_user
  using (app.can_edit_repertoire(repertoire_id))
  with check (app.can_edit_repertoire(repertoire_id));

-- Convites pendentes: lista quem tem team_member.add na equipe do convite.
drop policy "Organization owners and admins can read invites" on public.organization_invites;
create policy organization_invites_select on public.organization_invites for select to cantum_user
  using (app.has_permission(organization_id, team_id, 'team_member.add'));

-- ---------------------------------------------------------------------------
-- 6. Convites (PERMISSIONS.md §7.3)
-- ---------------------------------------------------------------------------

create or replace function private.create_organization_invite(p_organization_id uuid, p_team_id uuid, p_role text, p_invitee_email text DEFAULT NULL::text, p_expires_in_hours integer DEFAULT 168) RETURNS TABLE(id uuid, organization_id uuid, team_id uuid, invited_by_user_id uuid, role text, invitee_email text, created_at timestamp with time zone, expires_at timestamp with time zone, token text)
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_email text := nullif(lower(btrim(p_invitee_email)), '');
  v_token text;
  v_id uuid;
  v_created_at timestamptz;
  v_expires_at timestamptz;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  if p_role not in ('admin', 'member') then raise exception 'invalid invite role'; end if;
  if p_role = 'admin' and v_email is null then raise exception 'invite without email can only grant member'; end if;
  if p_expires_in_hours < 1 or p_expires_in_hours > 720 then raise exception 'invalid invite expiration'; end if;

  if not app.has_organization_role(p_organization_id, array['owner', 'admin']) then
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
    v_id, p_organization_id, p_team_id, v_user_id, p_role, v_email,
    extensions.digest(v_token, 'sha256'), v_created_at, v_expires_at
  );

  return query
    select v_id, p_organization_id, p_team_id, v_user_id, p_role, v_email, v_created_at, v_expires_at, v_token;
end;
$$;

create or replace function private.accept_organization_invite(p_token text) RETURNS TABLE(organization_id uuid, organization_name text, team_id uuid, team_name text, role text, organization_membership_id uuid, team_membership_id uuid, already_organization_member boolean, already_team_member boolean)
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_invite public.organization_invites%rowtype;
  v_role text;
  v_org_membership_id uuid;
  v_team_membership_id uuid;
  v_already_org boolean;
  v_already_team boolean;
  v_email text;
  v_email_verified boolean;
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

  select lower(u.email), u.email_verified_at is not null into v_email, v_email_verified
  from app.users u where u.id = v_user_id;
  if v_invite.invitee_email is not null then
    if lower(v_invite.invitee_email) <> coalesce(v_email, '') then
      raise exception 'invite is restricted to another email';
    end if;
    if not coalesce(v_email_verified, false) then
      raise exception 'invite requires verified email';
    end if;
  end if;
  -- Convite por link (sem e-mail) nunca concede admin, nem um antigo.
  v_role := case when v_invite.invitee_email is null then 'member' else v_invite.role end;

  select om.id into v_org_membership_id
  from public.organization_memberships om
  where om.organization_id = v_invite.organization_id
    and om.user_id = v_user_id
  for update;
  v_already_org := found;

  if not v_already_org then
    v_org_membership_id := gen_random_uuid();
    insert into public.organization_memberships (id, organization_id, user_id, role, created_at, updated_at)
    values (v_org_membership_id, v_invite.organization_id, v_user_id, v_role, now(), now());
  end if;

  select tm.id into v_team_membership_id
  from public.team_memberships tm
  where tm.team_id = v_invite.team_id
    and tm.user_id = v_user_id
  for update;
  v_already_team := found;

  if not v_already_team then
    v_team_membership_id := gen_random_uuid();
    insert into public.team_memberships (id, team_id, user_id, created_at, updated_at)
    values (v_team_membership_id, v_invite.team_id, v_user_id, now(), now());
  end if;

  update public.organization_invites
  set accepted_at = now(), accepted_by_user_id = v_user_id
  where id = v_invite.id and accepted_at is null and revoked_at is null;

  if not found then raise exception 'invite already used'; end if;

  return query
    select v_invite.organization_id, o.name, v_invite.team_id, t.name,
      coalesce(
        (select om.role::text from public.organization_memberships om where om.id = v_org_membership_id),
        v_role
      ),
      v_org_membership_id, v_team_membership_id,
      v_already_org, v_already_team
    from public.organizations o
    join public.teams t on t.id = v_invite.team_id
    where o.id = v_invite.organization_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Nome de exibição (RN-15)
-- ---------------------------------------------------------------------------

-- Sem backfill: os dados do Supabase não são migrados (ADR-059 §1).
alter table app.users
  add column display_name text not null check (char_length(btrim(display_name)) between 1 and 80);

create function public.set_my_display_name(p_display_name text) returns text
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_name text := btrim(p_display_name);
begin
  if app.current_user_id() is null then raise exception 'authentication required'; end if;
  if v_name is null or char_length(v_name) not between 1 and 80 then
    raise exception 'display name must have 1 to 80 characters';
  end if;
  update app.users set display_name = v_name, updated_at = now() where id = app.current_user_id();
  return v_name;
end;
$$;
revoke all on function public.set_my_display_name(text) from public;
grant execute on function public.set_my_display_name(text) to cantum_user;

-- Nomes dos membros da organização, nunca o e-mail.
create function public.get_organization_member_profiles(p_organization_id uuid) returns table(user_id uuid, display_name text)
  language sql stable security definer
  set search_path = ''
as $$
  select u.id, u.display_name
  from public.organization_memberships om
  join app.users u on u.id = om.user_id
  where om.organization_id = p_organization_id
    and app.is_organization_member(p_organization_id)
  order by u.display_name, u.id
$$;
revoke all on function public.get_organization_member_profiles(uuid) from public;
grant execute on function public.get_organization_member_profiles(uuid) to cantum_user;

-- ---------------------------------------------------------------------------
-- 8. Stage exige stage.run (N11, REALTIME_CONTRACT.md pendência 3)
-- ---------------------------------------------------------------------------

create or replace function app.can_subscribe_stage_session(p_stage_session_id uuid) returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select coalesce((
    select app.has_permission(svc.organization_id, null, 'stage.run')
    from public.stage_sessions ss
    join public.services svc on svc.id = ss.service_id
    where ss.id = p_stage_session_id
  ), false)
$$;

create or replace function public.get_service_stage_session(p_stage_session_id uuid) returns public.stage_sessions
  language sql stable security definer
  set search_path = ''
as $$
  select ss
  from public.stage_sessions ss
  join public.services svc on svc.id = ss.service_id
  where ss.id = p_stage_session_id
    and app.has_permission(svc.organization_id, null, 'stage.run');
$$;

create or replace function public.get_service_stage_songs(p_stage_session_id uuid) returns table("position" integer, song_id uuid, title text, artist text, original_key text, current_key text, lyrics text, notes text, bpm integer, musical_role text)
  language sql stable security definer
  set search_path = ''
as $$
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
  where ss.id = p_stage_session_id
    and app.has_permission(svc.organization_id, null, 'stage.run')
  order by si.position asc;
$$;

create or replace function public.get_target_stage_snapshot(p_stage_session_id uuid) returns jsonb
  language plpgsql stable security definer
  set search_path = ''
as $$
declare
  v_stage public.stage_sessions;
  v_state public.stage_session_states;
begin
  select ss.* into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id = ss.service_id
  where ss.id = p_stage_session_id
    and app.has_permission(svc.organization_id, null, 'stage.run');

  if v_stage.id is null then
    raise exception 'stage session not found or not authorized';
  end if;

  select * into v_state
  from public.stage_session_states
  where stage_session_id = p_stage_session_id;

  if v_state.stage_session_id is null then
    raise exception 'stage session state not found';
  end if;

  return jsonb_build_object('session', to_jsonb(v_stage), 'state', to_jsonb(v_state));
end;
$$;
