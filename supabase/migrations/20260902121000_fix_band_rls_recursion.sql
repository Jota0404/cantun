create or replace function public.is_band_member(target_band_id uuid, target_user_id uuid default (select auth.uid()))
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.band_members bm
    where bm.band_id = target_band_id
      and bm.user_id = target_user_id
      and bm.deleted_at is null
  );
$$;

create or replace function public.is_band_md(target_band_id uuid, target_user_id uuid default (select auth.uid()))
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.band_members bm
    where bm.band_id = target_band_id
      and bm.user_id = target_user_id
      and bm.role = 'md'
      and bm.deleted_at is null
  );
$$;

revoke all on function public.is_band_member(uuid, uuid) from public;
revoke all on function public.is_band_md(uuid, uuid) from public;
grant execute on function public.is_band_member(uuid, uuid) to authenticated;
grant execute on function public.is_band_md(uuid, uuid) to authenticated;

drop policy if exists "Band members can read their bands" on public.bands;
drop policy if exists "Band managers can update their bands" on public.bands;
create policy "Band members can read their bands" on public.bands
  for select to authenticated
  using (created_by = (select auth.uid()) or public.is_band_member(id));

create policy "Band managers can update their bands" on public.bands
  for update to authenticated
  using (public.is_band_md(id))
  with check (public.is_band_md(id));

drop policy if exists "Band members can read memberships" on public.band_members;
drop policy if exists "Band managers can create memberships" on public.band_members;
drop policy if exists "Band managers can update memberships" on public.band_members;
drop policy if exists "Band managers can delete memberships" on public.band_members;

create policy "Band members can read memberships" on public.band_members
  for select to authenticated
  using (public.is_band_member(band_id));

create policy "Band managers can create memberships" on public.band_members
  for insert to authenticated
  with check (
    (exists (
      select 1 from public.bands b
      where b.id = band_id and b.created_by = (select auth.uid())
    ) and role = 'md')
    or public.is_band_md(band_id)
  );

create policy "Band managers can update memberships" on public.band_members
  for update to authenticated
  using (public.is_band_md(band_id))
  with check (public.is_band_md(band_id));

create policy "Band managers can delete memberships" on public.band_members
  for delete to authenticated
  using (public.is_band_md(band_id));
