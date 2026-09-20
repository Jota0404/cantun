-- CANTUM: Organization -> Song ownership/context
-- Additive migration. Legacy band_songs remain until all consumers migrate.

create table if not exists public.organization_songs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, song_id)
);

create index if not exists organization_songs_organization_id_idx
  on public.organization_songs (organization_id);

create index if not exists organization_songs_song_id_idx
  on public.organization_songs (song_id);

alter table public.organization_songs enable row level security;

create policy "organization members can read organization songs"
  on public.organization_songs
  for select
  using (
    exists (
      select 1
      from public.organization_memberships om
      where om.organization_id = organization_songs.organization_id
        and om.user_id = auth.uid()
    )
  );

create policy "organization admins can insert organization songs"
  on public.organization_songs
  for insert
  with check (
    exists (
      select 1
      from public.organization_memberships om
      where om.organization_id = organization_songs.organization_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
  );

create policy "organization admins can update organization songs"
  on public.organization_songs
  for update
  using (
    exists (
      select 1
      from public.organization_memberships om
      where om.organization_id = organization_songs.organization_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1
      from public.organization_memberships om
      where om.organization_id = organization_songs.organization_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
  );

create policy "organization admins can delete organization songs"
  on public.organization_songs
  for delete
  using (
    exists (
      select 1
      from public.organization_memberships om
      where om.organization_id = organization_songs.organization_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
  );

grant select, insert, update, delete on public.organization_songs to authenticated;

create table if not exists private.legacy_band_song_mappings (
  band_song_id uuid primary key references public.band_songs(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  source_song_id uuid,
  migrated_at timestamptz not null default now()
);

create index if not exists legacy_band_song_mappings_organization_id_idx
  on private.legacy_band_song_mappings (organization_id);

create index if not exists legacy_band_song_mappings_song_id_idx
  on private.legacy_band_song_mappings (song_id);

-- Existing BandSongs that already point to a canonical Song.
insert into private.legacy_band_song_mappings (
  band_song_id,
  organization_id,
  song_id,
  source_song_id
)
select
  bs.id,
  m.organization_id,
  bs.source_song_id,
  bs.source_song_id
from public.band_songs bs
join private.legacy_band_organization_mappings m
  on m.band_id = bs.band_id
join public.songs s
  on s.id = bs.source_song_id
where bs.source_song_id is not null
on conflict (band_song_id) do nothing;

-- Legacy BandSongs without a canonical Song become Songs.
insert into public.songs (
  id,
  user_id,
  title,
  artist,
  original_key,
  current_key,
  bpm,
  lyrics,
  notes,
  is_favorite,
  created_at,
  updated_at
)
select
  bs.id,
  b.owner_user_id,
  bs.title,
  bs.artist,
  bs.original_key,
  bs.original_key,
  bs.bpm,
  bs.lyrics,
  bs.notes,
  false,
  bs.created_at,
  bs.updated_at
from public.band_songs bs
join public.bands b
  on b.id = bs.band_id
left join private.legacy_band_song_mappings lm
  on lm.band_song_id = bs.id
where bs.source_song_id is null
  and lm.band_song_id is null
  and not exists (
    select 1
    from public.songs s
    where s.id = bs.id
  );

insert into private.legacy_band_song_mappings (
  band_song_id,
  organization_id,
  song_id,
  source_song_id
)
select
  bs.id,
  m.organization_id,
  bs.id,
  null
from public.band_songs bs
join private.legacy_band_organization_mappings m
  on m.band_id = bs.band_id
left join private.legacy_band_song_mappings lm
  on lm.band_song_id = bs.id
where lm.band_song_id is null
on conflict (band_song_id) do nothing;

-- If a legacy ID already exists as a Song, preserve that Song rather than
-- creating a duplicate and still record the organizational relationship.
insert into private.legacy_band_song_mappings (
  band_song_id,
  organization_id,
  song_id,
  source_song_id
)
select
  bs.id,
  m.organization_id,
  bs.id,
  null
from public.band_songs bs
join private.legacy_band_organization_mappings m
  on m.band_id = bs.band_id
join public.songs s
  on s.id = bs.id
left join private.legacy_band_song_mappings lm
  on lm.band_song_id = bs.id
where bs.source_song_id is null
  and lm.band_song_id is null
on conflict (band_song_id) do nothing;

insert into public.organization_songs (
  organization_id,
  song_id,
  created_at,
  updated_at
)
select
  lm.organization_id,
  lm.song_id,
  lm.migrated_at,
  lm.migrated_at
from private.legacy_band_song_mappings lm
on conflict (organization_id, song_id)
do update set updated_at = greatest(public.organization_songs.updated_at, excluded.updated_at);

create or replace function public.get_band_song_organization_song(
  p_band_song_id uuid
)
returns table (
  band_song_id uuid,
  organization_id uuid,
  song_id uuid
)
language sql
security definer
set search_path = public, private
as $$
  select
    lm.band_song_id,
    lm.organization_id,
    lm.song_id
  from private.legacy_band_song_mappings lm
  join public.organization_memberships om
    on om.organization_id = lm.organization_id
  where lm.band_song_id = p_band_song_id
    and om.user_id = auth.uid();
$$;

revoke all on function public.get_band_song_organization_song(uuid) from public;
grant execute on function public.get_band_song_organization_song(uuid) to authenticated;
