create table public.bands (
  id uuid not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  primary key (id)
);

create table public.band_members (
  id uuid not null,
  band_id uuid not null references public.bands(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'md')),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  primary key (id),
  unique (band_id, user_id)
);

create unique index band_members_one_md_idx
  on public.band_members (band_id)
  where role = 'md' and deleted_at is null;

create table public.band_songs (
  id uuid not null,
  band_id uuid not null references public.bands(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  primary key (id),
  unique (band_id, song_id)
);

create table public.band_song_member_states (
  id uuid not null,
  band_song_id uuid not null references public.band_songs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  current_key text,
  notes text,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  primary key (id),
  unique (band_song_id, user_id)
);

create table public.band_setlists (
  id uuid not null,
  band_id uuid not null references public.bands(id) on delete cascade,
  name text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  primary key (id)
);

create table public.band_setlist_songs (
  id uuid not null,
  band_setlist_id uuid not null references public.band_setlists(id) on delete cascade,
  band_song_id uuid not null references public.band_songs(id) on delete cascade,
  position integer not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  primary key (id),
  unique (band_setlist_id, band_song_id)
);

create index band_members_band_id_idx on public.band_members(band_id);
create index band_members_user_id_idx on public.band_members(user_id);
create index band_songs_band_id_idx on public.band_songs(band_id);
create index band_songs_song_id_idx on public.band_songs(song_id);
create index band_song_member_states_user_id_idx on public.band_song_member_states(user_id);
create index band_setlists_band_id_idx on public.band_setlists(band_id);
create index band_setlist_songs_setlist_position_idx on public.band_setlist_songs(band_setlist_id, position);

alter table public.bands enable row level security;
alter table public.band_members enable row level security;
alter table public.band_songs enable row level security;
alter table public.band_song_member_states enable row level security;
alter table public.band_setlists enable row level security;
alter table public.band_setlist_songs enable row level security;

revoke all on table public.bands, public.band_members, public.band_songs, public.band_song_member_states, public.band_setlists, public.band_setlist_songs from anon;
grant select, insert, update, delete on table public.bands, public.band_members, public.band_songs, public.band_song_member_states, public.band_setlists, public.band_setlist_songs to authenticated;

create policy "Band members can read their bands" on public.bands
  for select to authenticated
  using (created_by = (select auth.uid()) or exists (
    select 1 from public.band_members bm
    where bm.band_id = bands.id and bm.user_id = (select auth.uid()) and bm.deleted_at is null
  ));

create policy "Users can create their own bands" on public.bands
  for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy "Band managers can update their bands" on public.bands
  for update to authenticated
  using (created_by = (select auth.uid()) or exists (
    select 1 from public.band_members bm
    where bm.band_id = bands.id and bm.user_id = (select auth.uid()) and bm.role = 'md' and bm.deleted_at is null
  ))
  with check (created_by = (select auth.uid()) or exists (
    select 1 from public.band_members bm
    where bm.band_id = bands.id and bm.user_id = (select auth.uid()) and bm.role = 'md' and bm.deleted_at is null
  ));

create policy "Band owners can delete their bands" on public.bands
  for delete to authenticated
  using (created_by = (select auth.uid()));

create policy "Band members can read memberships" on public.band_members
  for select to authenticated
  using (exists (
    select 1 from public.band_members own
    where own.band_id = band_members.band_id and own.user_id = (select auth.uid()) and own.deleted_at is null
  ));

create policy "Band managers can create memberships" on public.band_members
  for insert to authenticated
  with check (exists (
    select 1 from public.band_members md
    where md.band_id = band_members.band_id and md.user_id = (select auth.uid()) and md.role = 'md' and md.deleted_at is null
  ));

create policy "Band managers can update memberships" on public.band_members
  for update to authenticated
  using (exists (
    select 1 from public.band_members md
    where md.band_id = band_members.band_id and md.user_id = (select auth.uid()) and md.role = 'md' and md.deleted_at is null
  ))
  with check (exists (
    select 1 from public.band_members md
    where md.band_id = band_members.band_id and md.user_id = (select auth.uid()) and md.role = 'md' and md.deleted_at is null
  ));

create policy "Band managers can delete memberships" on public.band_members
  for delete to authenticated
  using (exists (
    select 1 from public.band_members md
    where md.band_id = band_members.band_id and md.user_id = (select auth.uid()) and md.role = 'md' and md.deleted_at is null
  ));

create policy "Band members can read band songs" on public.band_songs
  for select to authenticated
  using (exists (
    select 1 from public.band_members bm
    where bm.band_id = band_songs.band_id and bm.user_id = (select auth.uid()) and bm.deleted_at is null
  ));

create policy "Band managers can write band songs" on public.band_songs
  for insert to authenticated
  with check (exists (
    select 1 from public.band_members bm
    where bm.band_id = band_songs.band_id and bm.user_id = (select auth.uid()) and bm.role = 'md' and bm.deleted_at is null
  ));

create policy "Band managers can update band songs" on public.band_songs
  for update to authenticated
  using (exists (
    select 1 from public.band_members bm
    where bm.band_id = band_songs.band_id and bm.user_id = (select auth.uid()) and bm.role = 'md' and bm.deleted_at is null
  ))
  with check (exists (
    select 1 from public.band_members bm
    where bm.band_id = band_songs.band_id and bm.user_id = (select auth.uid()) and bm.role = 'md' and bm.deleted_at is null
  ));

create policy "Band managers can delete band songs" on public.band_songs
  for delete to authenticated
  using (exists (
    select 1 from public.band_members bm
    where bm.band_id = band_songs.band_id and bm.user_id = (select auth.uid()) and bm.role = 'md' and bm.deleted_at is null
  ));

create policy "Members can read their song states" on public.band_song_member_states
  for select to authenticated
  using (user_id = (select auth.uid()) and exists (
    select 1 from public.band_songs bs
    join public.band_members bm on bm.band_id = bs.band_id
    where bs.id = band_song_member_states.band_song_id and bm.user_id = (select auth.uid()) and bm.deleted_at is null
  ));

create policy "Users can create their own song states" on public.band_song_member_states
  for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.band_songs bs
    join public.band_members bm on bm.band_id = bs.band_id
    where bs.id = band_song_member_states.band_song_id and bm.user_id = (select auth.uid()) and bm.deleted_at is null
  ));

create policy "Users can update their own song states" on public.band_song_member_states
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users can delete their own song states" on public.band_song_member_states
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "Band members can read band setlists" on public.band_setlists
  for select to authenticated
  using (exists (
    select 1 from public.band_members bm
    where bm.band_id = band_setlists.band_id and bm.user_id = (select auth.uid()) and bm.deleted_at is null
  ));

create policy "Band managers can create band setlists" on public.band_setlists
  for insert to authenticated
  with check (exists (
    select 1 from public.band_members bm
    where bm.band_id = band_setlists.band_id and bm.user_id = (select auth.uid()) and bm.role = 'md' and bm.deleted_at is null
  ));

create policy "Band managers can update band setlists" on public.band_setlists
  for update to authenticated
  using (exists (
    select 1 from public.band_members bm
    where bm.band_id = band_setlists.band_id and bm.user_id = (select auth.uid()) and bm.role = 'md' and bm.deleted_at is null
  ))
  with check (exists (
    select 1 from public.band_members bm
    where bm.band_id = band_setlists.band_id and bm.user_id = (select auth.uid()) and bm.role = 'md' and bm.deleted_at is null
  ));

create policy "Band managers can delete band setlists" on public.band_setlists
  for delete to authenticated
  using (exists (
    select 1 from public.band_members bm
    where bm.band_id = band_setlists.band_id and bm.user_id = (select auth.uid()) and bm.role = 'md' and bm.deleted_at is null
  ));

create policy "Band members can read band setlist songs" on public.band_setlist_songs
  for select to authenticated
  using (exists (
    select 1 from public.band_setlists bsl
    join public.band_members bm on bm.band_id = bsl.band_id
    where bsl.id = band_setlist_songs.band_setlist_id and bm.user_id = (select auth.uid()) and bm.deleted_at is null
  ));

create policy "Band managers can create band setlist songs" on public.band_setlist_songs
  for insert to authenticated
  with check (exists (
    select 1 from public.band_setlists bsl
    join public.band_members bm on bm.band_id = bsl.band_id
    where bsl.id = band_setlist_songs.band_setlist_id and bm.user_id = (select auth.uid()) and bm.role = 'md' and bm.deleted_at is null
  ));

create policy "Band managers can update band setlist songs" on public.band_setlist_songs
  for update to authenticated
  using (exists (
    select 1 from public.band_setlists bsl
    join public.band_members bm on bm.band_id = bsl.band_id
    where bsl.id = band_setlist_songs.band_setlist_id and bm.user_id = (select auth.uid()) and bm.role = 'md' and bm.deleted_at is null
  ))
  with check (exists (
    select 1 from public.band_setlists bsl
    join public.band_members bm on bm.band_id = bsl.band_id
    where bsl.id = band_setlist_songs.band_setlist_id and bm.user_id = (select auth.uid()) and bm.role = 'md' and bm.deleted_at is null
  ));

create policy "Band managers can delete band setlist songs" on public.band_setlist_songs
  for delete to authenticated
  using (exists (
    select 1 from public.band_setlists bsl
    join public.band_members bm on bm.band_id = bsl.band_id
    where bsl.id = band_setlist_songs.band_setlist_id and bm.user_id = (select auth.uid()) and bm.role = 'md' and bm.deleted_at is null
  ));

alter publication supabase_realtime add table public.bands;
alter publication supabase_realtime add table public.band_members;
alter publication supabase_realtime add table public.band_songs;
alter publication supabase_realtime add table public.band_song_member_states;
alter publication supabase_realtime add table public.band_setlists;
alter publication supabase_realtime add table public.band_setlist_songs;
