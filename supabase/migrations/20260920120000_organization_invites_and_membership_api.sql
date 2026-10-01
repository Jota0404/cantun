create table public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  invited_by_user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'member')),
  invitee_email text,
  token_hash bytea not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by_user_id uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  check (expires_at > created_at),
  check (accepted_at is null or revoked_at is null)
);

create index organization_invites_org_created_idx
  on public.organization_invites(organization_id, created_at desc);

create index organization_invites_pending_idx
  on public.organization_invites(organization_id, expires_at)
  where accepted_at is null and revoked_at is null;

alter table public.organization_invites enable row level security;

revoke all on table public.organization_invites from anon;
grant select, update on table public.organization_invites to authenticated;

create policy "Organization owners and admins can read invites"
on public.organization_invites for select to authenticated
using (
  exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = organization_invites.organization_id
      and om.user_id = auth.uid()
      and om.role in ('owner', 'admin')
  )
);

create policy "Organization owners and admins can revoke invites"
on public.organization_invites for update to authenticated
using (
  accepted_at is null
  and revoked_at is null
  and exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = organization_invites.organization_id
      and om.user_id = auth.uid()
      and om.role in ('owner', 'admin')
  )
)
with check (
  organization_id = organization_invites.organization_id
  and invited_by_user_id = organization_invites.invited_by_user_id
  and role = organization_invites.role
  and token_hash = organization_invites.token_hash
  and created_at = organization_invites.created_at
  and expires_at = organization_invites.expires_at
  and accepted_at = organization_invites.accepted_at
  and accepted_by_user_id = organization_invites.accepted_by_user_id
  and revoked_at is not null
);

create or replace function private.create_organization_invite(
  p_organization_id uuid,
  p_team_id uuid,
  p_role text,
  p_invitee_email text default null,
  p_expires_in_hours integer default 168
)
returns table (
  id uuid,
  organization_id uuid,
  team_id uuid,
  invited_by_user_id uuid,
  role text,
  invitee_email text,
  created_at timestamptz,
  expires_at timestamptz,
  token text
)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
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

  v_token := encode(gen_random_bytes(32), 'hex');
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
    digest(v_token, 'sha256'), v_created_at, v_expires_at
  );

  return query
    select v_id, p_organization_id, p_team_id, v_user_id, p_role,
      nullif(lower(btrim(p_invitee_email)), ''), v_created_at, v_expires_at, v_token;
end;
$$;

create or replace function private.get_organization_invite(p_token text)
returns table (
  id uuid,
  organization_id uuid,
  team_id uuid,
  organization_name text,
  team_name text,
  role text,
  invitee_email text,
  created_at timestamptz,
  expires_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  status text
)
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

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
    where i.token_hash = digest(p_token, 'sha256');
end;
$$;

create or replace function private.accept_organization_invite(p_token text)
returns table (
  organization_id uuid,
  organization_name text,
  team_id uuid,
  team_name text,
  role text,
  organization_membership_id uuid,
  team_membership_id uuid,
  already_organization_member boolean,
  already_team_member boolean
)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
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
  where token_hash = digest(p_token, 'sha256')
  for update;

  if not found then raise exception 'invalid invite'; end if;
  if v_invite.revoked_at is not null then raise exception 'invite revoked'; end if;
  if v_invite.accepted_at is not null then raise exception 'invite already used'; end if;
  if v_invite.expires_at <= now() then raise exception 'invite expired'; end if;

  select lower(email) into v_email from auth.users where id = v_user_id;
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

create or replace function private.revoke_organization_invite(p_invite_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
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

create or replace function public.create_organization_invite(
  p_organization_id uuid,
  p_team_id uuid,
  p_role text,
  p_invitee_email text default null,
  p_expires_in_hours integer default 168
)
returns table (
  id uuid, organization_id uuid, team_id uuid, invited_by_user_id uuid,
  role text, invitee_email text, created_at timestamptz, expires_at timestamptz, token text
)
language sql security definer set search_path = ''
as $$ select * from private.create_organization_invite(
  p_organization_id, p_team_id, p_role, p_invitee_email, p_expires_in_hours
); $$;

create or replace function public.get_organization_invite(p_token text)
returns table (
  id uuid, organization_id uuid, team_id uuid, organization_name text,
  team_name text, role text, invitee_email text, created_at timestamptz,
  expires_at timestamptz, accepted_at timestamptz, revoked_at timestamptz, status text
)
language sql security definer set search_path = ''
as $$ select * from private.get_organization_invite(p_token); $$;

create or replace function public.accept_organization_invite(p_token text)
returns table (
  organization_id uuid, organization_name text, team_id uuid, team_name text,
  role text, organization_membership_id uuid, team_membership_id uuid,
  already_organization_member boolean, already_team_member boolean
)
language sql security definer set search_path = ''
as $$ select * from private.accept_organization_invite(p_token); $$;

create or replace function public.revoke_organization_invite(p_invite_id uuid)
returns void
language sql security definer set search_path = ''
as $$ select private.revoke_organization_invite(p_invite_id); $$;

create or replace function public.update_organization_member_role(
  p_membership_id uuid,
  p_role text
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_target public.organization_memberships%rowtype;
  v_actor_role text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
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
    and om.user_id = auth.uid();

  if v_actor_role not in ('owner', 'admin') then raise exception 'not authorized'; end if;

  update public.organization_memberships
  set role = p_role, updated_at = now()
  where id = p_membership_id;
end;
$$;

create or replace function public.remove_organization_member(p_membership_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_target public.organization_memberships%rowtype;
  v_actor_role text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  select * into v_target
  from public.organization_memberships
  where id = p_membership_id
  for update;

  if not found then raise exception 'membership not found'; end if;
  if v_target.role = 'owner' then raise exception 'organization owner cannot be removed'; end if;

  select om.role::text into v_actor_role
  from public.organization_memberships om
  where om.organization_id = v_target.organization_id
    and om.user_id = auth.uid();

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

revoke all on function private.create_organization_invite(uuid, uuid, text, text, integer),
  private.get_organization_invite(text),
  private.accept_organization_invite(text),
  private.revoke_organization_invite(uuid)
from public;

grant execute on function private.create_organization_invite(uuid, uuid, text, text, integer),
  private.get_organization_invite(text),
  private.accept_organization_invite(text),
  private.revoke_organization_invite(uuid)
to authenticated;

revoke execute on function public.create_organization_invite(uuid, uuid, text, text, integer),
  public.get_organization_invite(text),
  public.accept_organization_invite(text),
  public.revoke_organization_invite(uuid),
  public.update_organization_member_role(uuid, text),
  public.remove_organization_member(uuid)
from public, anon;

grant execute on function public.create_organization_invite(uuid, uuid, text, text, integer),
  public.get_organization_invite(text),
  public.accept_organization_invite(text),
  public.revoke_organization_invite(uuid),
  public.update_organization_member_role(uuid, text),
  public.remove_organization_member(uuid)
to authenticated;
