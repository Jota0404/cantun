create or replace function public.get_band_member_organization_membership(
  p_band_member_id uuid
)
returns table (
  band_member_id uuid,
  organization_membership_id uuid,
  team_membership_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.band_member_id,
    m.organization_membership_id,
    m.team_membership_id
  from private.legacy_band_member_mappings m
  join public.band_members bm on bm.id = m.band_member_id
  where m.band_member_id = p_band_member_id
    and private.is_band_member(bm.band_id);
$$;

revoke all on function public.get_band_member_organization_membership(uuid) from public, anon;
grant execute on function public.get_band_member_organization_membership(uuid) to authenticated;
