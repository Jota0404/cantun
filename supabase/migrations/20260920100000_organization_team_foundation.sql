create table public.organizations (
  id uuid primary key,
  name text not null check (length(btrim(name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table public.teams (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.team_memberships (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, user_id)
);

create index organizations_updated_idx on public.organizations(updated_at);
create index organization_memberships_user_idx on public.organization_memberships(user_id, organization_id);
create index teams_organization_updated_idx on public.teams(organization_id, updated_at);
create index team_memberships_user_idx on public.team_memberships(user_id, team_id);

alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.teams enable row level security;
alter table public.team_memberships enable row level security;

revoke all on table public.organizations, public.organization_memberships, public.teams, public.team_memberships from anon;
grant select, update, delete on table public.organizations to authenticated;
grant select, insert, update, delete on table public.organization_memberships, public.teams, public.team_memberships to authenticated;

create policy "Organization members can read organizations"
on public.organizations for select to authenticated
using (
  exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = organizations.id
      and om.user_id = (select auth.uid())
  )
);

create policy "Organization owners can update organizations"
on public.organizations for update to authenticated
using (
  exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = organizations.id
      and om.user_id = (select auth.uid())
      and om.role = 'owner'
  )
)
with check (
  exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = organizations.id
      and om.user_id = (select auth.uid())
      and om.role = 'owner'
  )
);

create policy "Organization owners can delete organizations"
on public.organizations for delete to authenticated
using (
  exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = organizations.id
      and om.user_id = (select auth.uid())
      and om.role = 'owner'
  )
);

create policy "Organization members can read memberships"
on public.organization_memberships for select to authenticated
using (
  exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = organization_memberships.organization_id
      and om.user_id = (select auth.uid())
  )
);

create policy "Organization admins can manage memberships"
on public.organization_memberships for all to authenticated
using (
  exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = organization_memberships.organization_id
      and om.user_id = (select auth.uid())
      and om.role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = organization_memberships.organization_id
      and om.user_id = (select auth.uid())
      and om.role in ('owner', 'admin')
  )
);

create policy "Organization members can read teams"
on public.teams for select to authenticated
using (
  exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = teams.organization_id
      and om.user_id = (select auth.uid())
  )
);

create policy "Organization admins can manage teams"
on public.teams for all to authenticated
using (
  exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = teams.organization_id
      and om.user_id = (select auth.uid())
      and om.role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = teams.organization_id
      and om.user_id = (select auth.uid())
      and om.role in ('owner', 'admin')
  )
);

create policy "Organization members can read team memberships"
on public.team_memberships for select to authenticated
using (
  exists (
    select 1
    from public.team_memberships tm
    join public.teams t on t.id = tm.team_id
    join public.organization_memberships om on om.organization_id = t.organization_id
    where tm.id = team_memberships.id
      and om.user_id = (select auth.uid())
  )
);

create policy "Organization admins can manage team memberships"
on public.team_memberships for all to authenticated
using (
  exists (
    select 1
    from public.team_memberships tm
    join public.teams t on t.id = tm.team_id
    join public.organization_memberships om on om.organization_id = t.organization_id
    where tm.id = team_memberships.id
      and om.user_id = (select auth.uid())
      and om.role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.teams t
    join public.organization_memberships om on om.organization_id = t.organization_id
    where t.id = team_memberships.team_id
      and om.user_id = (select auth.uid())
      and om.role in ('owner', 'admin')
  )
);

-- Organization creation is exposed through this security-definer RPC so the
-- organization and its owner membership are created atomically.
create or replace function public.create_organization(
  p_id uuid,
  p_name text
)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization public.organizations;
  v_user_id uuid := auth.uid();
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

revoke all on function public.create_organization(uuid, text) from public, anon;
grant execute on function public.create_organization(uuid, text) to authenticated;

-- Membership creation for an existing organization remains restricted to
-- owners/admins through the policies above.