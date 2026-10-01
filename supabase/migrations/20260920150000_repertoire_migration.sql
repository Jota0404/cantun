-- CANTUM: Repertoire replaces legacy BandSetlist/Setlist conceptually.
-- Repertoire is organization-owned and references canonical Songs directly.

create table if not exists public.repertoires (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  created_by_user_id uuid not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists repertoires_organization_id_idx
  on public.repertoires (organization_id);

create table if not exists public.repertoire_items (
  id uuid primary key default gen_random_uuid(),
  repertoire_id uuid not null references public.repertoires(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete restrict,
  position integer not null,
  updated_at timestamptz not null default now(),
  unique (repertoire_id, position),
  unique (repertoire_id, song_id)
);

create index if not exists repertoire_items_repertoire_id_idx
  on public.repertoire_items (repertoire_id);

create index if not exists repertoire_items_song_id_idx
  on public.repertoire_items (song_id);

alter table public.repertoires enable row level security;
alter table public.repertoire_items enable row level security;

create policy "organization members can read repertoires"
  on public.repertoires for select
  using (
    exists (
      select 1 from public.organization_memberships om
      where om.organization_id = repertoires.organization_id
        and om.user_id = auth.uid()
    )
  );

create policy "organization admins can write repertoires"
  on public.repertoires for all
  using (
    exists (
      select 1 from public.organization_memberships om
      where om.organization_id = repertoires.organization_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.organization_memberships om
      where om.organization_id = repertoires.organization_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
  );

create policy "organization members can read repertoire items"
  on public.repertoire_items for select
  using (
    exists (
      select 1
      from public.repertoires r
      join public.organization_memberships om
        on om.organization_id = r.organization_id
      where r.id = repertoire_items.repertoire_id
        and om.user_id = auth.uid()
    )
  );

create policy "organization admins can write repertoire items"
  on public.repertoire_items for all
  using (
    exists (
      select 1
      from public.repertoires r
      join public.organization_memberships om
        on om.organization_id = r.organization_id
      where r.id = repertoire_items.repertoire_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1
      from public.repertoires r
      join public.organization_memberships om
        on om.organization_id = r.organization_id
      where r.id = repertoire_items.repertoire_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
  );

grant select, insert, update, delete on public.repertoires to authenticated;
grant select, insert, update, delete on public.repertoire_items to authenticated;

create table if not exists private.legacy_band_setlist_mappings (
  band_setlist_id uuid primary key references public.band_setlists(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  repertoire_id uuid not null references public.repertoires(id) on delete cascade,
  migrated_at timestamptz not null default now()
);

create table if not exists private.legacy_band_setlist_song_mappings (
  band_setlist_song_id uuid primary key references public.band_setlist_songs(id) on delete cascade,
  repertoire_id uuid not null references public.repertoires(id) on delete cascade,
  repertoire_item_id uuid not null references public.repertoire_items(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete restrict,
  migrated_at timestamptz not null default now()
);

-- Preserve the legacy BandSetlist ID as the new Repertoire ID.
insert into public.repertoires (
  id,
  organization_id,
  name,
  created_by_user_id,
  version,
  created_at,
  updated_at
)
select
  bs.id,
  bo.organization_id,
  bs.name,
  bs.created_by_user_id,
  bs.version,
  bs.created_at,
  bs.updated_at
from public.band_setlists bs
join private.legacy_band_organization_mappings bo
  on bo.band_id = bs.band_id
on conflict (id) do update set
  organization_id = excluded.organization_id,
  name = excluded.name,
  created_by_user_id = excluded.created_by_user_id,
  version = excluded.version,
  updated_at = greatest(public.repertoires.updated_at, excluded.updated_at);

insert into private.legacy_band_setlist_mappings (
  band_setlist_id,
  organization_id,
  repertoire_id
)
select
  bs.id,
  bo.organization_id,
  bs.id
from public.band_setlists bs
join private.legacy_band_organization_mappings bo
  on bo.band_id = bs.band_id
on conflict (band_setlist_id) do nothing;

-- Convert each legacy BandSetlistSong to a direct Song reference.
insert into public.repertoire_items (
  id,
  repertoire_id,
  song_id,
  position,
  updated_at
)
select
  bss.id,
  bss.band_setlist_id,
  bsm.song_id,
  bss.position,
  bss.updated_at
from public.band_setlist_songs bss
join private.legacy_band_song_mappings bsm
  on bsm.band_song_id = bss.band_song_id
join private.legacy_band_setlist_mappings bslm
  on bslm.band_setlist_id = bss.band_setlist_id
on conflict (id) do update set
  repertoire_id = excluded.repertoire_id,
  song_id = excluded.song_id,
  position = excluded.position,
  updated_at = excluded.updated_at;

insert into private.legacy_band_setlist_song_mappings (
  band_setlist_song_id,
  repertoire_id,
  repertoire_item_id,
  song_id
)
select
  bss.id,
  bslm.repertoire_id,
  bss.id,
  bsm.song_id
from public.band_setlist_songs bss
join private.legacy_band_song_mappings bsm
  on bsm.band_song_id = bss.band_song_id
join private.legacy_band_setlist_mappings bslm
  on bslm.band_setlist_id = bss.band_setlist_id
on conflict (band_setlist_song_id) do nothing;

create or replace function public.get_band_setlist_repertoire_context(
  p_band_setlist_id uuid
)
returns table (
  band_setlist_id uuid,
  organization_id uuid,
  repertoire_id uuid
)
language sql
security definer
set search_path = public, private
as $$
  select
    lm.band_setlist_id,
    lm.organization_id,
    lm.repertoire_id
  from private.legacy_band_setlist_mappings lm
  join public.organization_memberships om
    on om.organization_id = lm.organization_id
  where lm.band_setlist_id = p_band_setlist_id
    and om.user_id = auth.uid();
$$;

revoke all on function public.get_band_setlist_repertoire_context(uuid) from public;
grant execute on function public.get_band_setlist_repertoire_context(uuid) to authenticated;
