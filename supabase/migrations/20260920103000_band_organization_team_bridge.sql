-- CANTUM — Bridge legacy Band -> Organization + Team.
-- This migration is additive. Legacy Band tables remain operational.

create table private.legacy_band_organization_mappings (
  band_id uuid primary key references public.bands(id) on delete restrict,
  organization_id uuid not null unique references public.organizations(id) on delete restrict,
  team_id uuid not null unique references public.teams(id) on delete restrict,
  migrated_at timestamptz not null default now()
);

create table private.legacy_band_member_mappings (
  band_member_id uuid primary key references public.band_members(id) on delete restrict,
  organization_membership_id uuid not null unique references public.organization_memberships(id) on delete restrict,
  team_membership_id uuid not null unique references public.team_memberships(id) on delete restrict,
  legacy_musical_role text,
  migrated_at timestamptz not null default now()
);

revoke all on table private.legacy_band_organization_mappings, private.legacy_band_member_mappings from public, anon, authenticated;

-- Preserve the legacy Band identity as the Organization identity.
insert into public.organizations (id, name, created_at, updated_at)
select b.id, b.name, b.created_at, b.updated_at
from public.bands b
on conflict (id) do nothing;

-- Every legacy Band becomes one operational Team.
insert into public.teams (id, organization_id, name, created_at, updated_at)
select gen_random_uuid(), b.id, b.name, b.created_at, b.updated_at
from public.bands b
where not exists (
  select 1
  from private.legacy_band_organization_mappings m
  where m.band_id = b.id
);

-- Record the deterministic Band -> Organization + Team bridge.
insert into private.legacy_band_organization_mappings (band_id, organization_id, team_id)
select b.id, b.id, t.id
from public.bands b
join public.teams t
  on t.organization_id = b.id
where not exists (
  select 1
  from private.legacy_band_organization_mappings m
  where m.band_id = b.id
)
on conflict (band_id) do nothing;

-- Re-run safety: any organization/team created by the first phase is already
-- represented by the mapping before membership migration continues.

insert into public.organization_memberships (
  organization_id,
  user_id,
  role,
  created_at,
  updated_at
)
select
  map.organization_id,
  bm.user_id,
  case bm.role
    when 'owner' then 'owner'
    when 'editor' then 'admin'
    else 'member'
  end,
  bm.created_at,
  bm.updated_at
from private.legacy_band_organization_mappings map
join public.band_members bm on bm.band_id = map.band_id
on conflict (organization_id, user_id) do nothing;

insert into public.team_memberships (
  team_id,
  user_id,
  created_at,
  updated_at
)
select
  map.team_id,
  bm.user_id,
  bm.created_at,
  bm.updated_at
from private.legacy_band_organization_mappings map
join public.band_members bm on bm.band_id = map.band_id
on conflict (team_id, user_id) do nothing;

insert into private.legacy_band_member_mappings (
  band_member_id,
  organization_membership_id,
  team_membership_id,
  legacy_musical_role
)
select
  bm.id,
  om.id,
  tm.id,
  bm.musical_role
from public.band_members bm
join private.legacy_band_organization_mappings map
  on map.band_id = bm.band_id
join public.organization_memberships om
  on om.organization_id = map.organization_id
 and om.user_id = bm.user_id
join public.team_memberships tm
  on tm.team_id = map.team_id
 and tm.user_id = bm.user_id
on conflict (band_member_id) do nothing;

create index legacy_band_member_mappings_org_idx
  on private.legacy_band_member_mappings(organization_membership_id);

create index legacy_band_member_mappings_team_idx
  on private.legacy_band_member_mappings(team_membership_id);

create or replace function public.get_band_organization_context(p_band_id uuid)
returns table (
  band_id uuid,
  organization_id uuid,
  team_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.band_id,
    m.organization_id,
    m.team_id
  from private.legacy_band_organization_mappings m
  where m.band_id = p_band_id
    and private.is_band_member(p_band_id);
$$;

revoke all on function public.get_band_organization_context(uuid) from public, anon;
grant execute on function public.get_band_organization_context(uuid) to authenticated;
