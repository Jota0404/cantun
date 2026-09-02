create schema if not exists private;

create table public.bands (
  id uuid primary key,
  name text not null check (length(btrim(name)) > 0),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table public.band_members (
  id uuid primary key,
  band_id uuid not null references public.bands(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'member')),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (band_id, user_id)
);

create table public.band_songs (
  id uuid primary key,
  band_id uuid not null references public.bands(id) on delete cascade,
  title text not null,
  artist text,
  original_key text not null,
  bpm integer,
  lyrics text not null,
  notes text,
  source_song_id uuid,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table public.band_song_member_states (
  id uuid primary key,
  band_song_id uuid not null references public.band_songs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  current_key text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (band_song_id, user_id)
);

create table public.band_setlists (
  id uuid primary key,
  band_id uuid not null references public.bands(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  version integer not null check (version >= 0),
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table public.band_setlist_songs (
  id uuid primary key,
  band_setlist_id uuid not null references public.band_setlists(id) on delete cascade,
  band_song_id uuid not null references public.band_songs(id) on delete cascade,
  position integer not null check (position >= 0),
  updated_at timestamptz not null,
  unique (band_setlist_id, band_song_id),
  unique (band_setlist_id, position)
);

create index band_members_user_band_idx on public.band_members(user_id, band_id);
create index band_songs_band_updated_idx on public.band_songs(band_id, updated_at);
create index band_song_member_states_user_idx on public.band_song_member_states(user_id, band_song_id);
create index band_setlists_band_updated_idx on public.band_setlists(band_id, updated_at);
create index band_setlist_songs_setlist_position_idx on public.band_setlist_songs(band_setlist_id, position);
create unique index band_one_owner_idx on public.band_members(band_id) where role = 'owner';

create or replace function private.is_band_member(target_band_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.band_members bm
    where bm.band_id = target_band_id and bm.user_id = (select auth.uid())
  );
$$;

create or replace function private.has_band_role(target_band_id uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.band_members bm
    where bm.band_id = target_band_id
      and bm.user_id = (select auth.uid())
      and bm.role = any(allowed_roles)
  );
$$;

create or replace function private.add_band_owner_member()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.band_members (id, band_id, user_id, role, created_at, updated_at)
  values (gen_random_uuid(), new.id, new.owner_user_id, 'owner', new.created_at, new.updated_at);
  return new;
end;
$$;

create trigger bands_create_owner_member
after insert on public.bands
for each row execute function private.add_band_owner_member();

revoke all on function private.is_band_member(uuid) from public;
revoke all on function private.has_band_role(uuid, text[]) from public;
revoke all on function private.add_band_owner_member() from public;
grant execute on function private.is_band_member(uuid) to authenticated;
grant execute on function private.has_band_role(uuid, text[]) to authenticated;

alter table public.bands enable row level security;
alter table public.band_members enable row level security;
alter table public.band_songs enable row level security;
alter table public.band_song_member_states enable row level security;
alter table public.band_setlists enable row level security;
alter table public.band_setlist_songs enable row level security;

revoke all on table public.bands, public.band_members, public.band_songs, public.band_song_member_states, public.band_setlists, public.band_setlist_songs from anon;
grant select, insert, update, delete on table public.bands, public.band_members, public.band_songs, public.band_song_member_states, public.band_setlists, public.band_setlist_songs to authenticated;

create policy "Band members can read bands" on public.bands
  for select to authenticated using (private.is_band_member(id));
create policy "Authenticated users can create owned bands" on public.bands
  for insert to authenticated with check (owner_user_id = (select auth.uid()));
create policy "Owners can update bands" on public.bands
  for update to authenticated using (owner_user_id = (select auth.uid())) with check (owner_user_id = (select auth.uid()));
create policy "Owners can delete bands" on public.bands
  for delete to authenticated using (owner_user_id = (select auth.uid()));

create policy "Band members can read membership" on public.band_members
  for select to authenticated using (private.is_band_member(band_id));
create policy "Owners can insert membership" on public.band_members
  for insert to authenticated with check (exists (select 1 from public.bands b where b.id = band_id and b.owner_user_id = (select auth.uid())));
create policy "Owners can update membership" on public.band_members
  for update to authenticated
  using (exists (select 1 from public.bands b where b.id = band_id and b.owner_user_id = (select auth.uid())))
  with check (exists (select 1 from public.bands b where b.id = band_id and b.owner_user_id = (select auth.uid())) and not (role = 'owner' and user_id <> (select auth.uid())));
create policy "Owners can delete membership" on public.band_members
  for delete to authenticated
  using (exists (select 1 from public.bands b where b.id = band_id and b.owner_user_id = (select auth.uid())) and role <> 'owner');

create policy "Band members can read shared songs" on public.band_songs
  for select to authenticated using (private.is_band_member(band_id));
create policy "Band editors can insert shared songs" on public.band_songs
  for insert to authenticated with check (private.has_band_role(band_id, array['owner','editor']));
create policy "Band editors can update shared songs" on public.band_songs
  for update to authenticated using (private.has_band_role(band_id, array['owner','editor'])) with check (private.has_band_role(band_id, array['owner','editor']));
create policy "Band editors can delete shared songs" on public.band_songs
  for delete to authenticated using (private.has_band_role(band_id, array['owner','editor']));

create policy "Members can read their song states" on public.band_song_member_states
  for select to authenticated
  using (user_id = (select auth.uid()) and exists (select 1 from public.band_songs bs where bs.id = band_song_id and private.is_band_member(bs.band_id)));
create policy "Members can create their song states" on public.band_song_member_states
  for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.band_songs bs where bs.id = band_song_id and private.is_band_member(bs.band_id)));
create policy "Members can update their song states" on public.band_song_member_states
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Members can delete their song states" on public.band_song_member_states
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "Band members can read band setlists" on public.band_setlists
  for select to authenticated using (private.is_band_member(band_id));
create policy "Band editors can insert band setlists" on public.band_setlists
  for insert to authenticated with check (private.has_band_role(band_id, array['owner','editor']) and created_by_user_id = (select auth.uid()));
create policy "Band editors can update band setlists" on public.band_setlists
  for update to authenticated using (private.has_band_role(band_id, array['owner','editor'])) with check (private.has_band_role(band_id, array['owner','editor']));
create policy "Band editors can delete band setlists" on public.band_setlists
  for delete to authenticated using (private.has_band_role(band_id, array['owner','editor']));

create policy "Band members can read band setlist songs" on public.band_setlist_songs
  for select to authenticated using (exists (select 1 from public.band_setlists bs where bs.id = band_setlist_id and private.is_band_member(bs.band_id)));
create policy "Band editors can insert band setlist songs" on public.band_setlist_songs
  for insert to authenticated
  with check (
    exists (select 1 from public.band_setlists bs where bs.id = band_setlist_id and private.has_band_role(bs.band_id, array['owner','editor']))
    and exists (select 1 from public.band_songs bso join public.band_setlists bs on bs.band_id = bso.band_id where bso.id = band_song_id and bs.id = band_setlist_id)
  );
create policy "Band editors can update band setlist songs" on public.band_setlist_songs
  for update to authenticated
  using (exists (select 1 from public.band_setlists bs where bs.id = band_setlist_id and private.has_band_role(bs.band_id, array['owner','editor'])))
  with check (
    exists (select 1 from public.band_setlists bs where bs.id = band_setlist_id and private.has_band_role(bs.band_id, array['owner','editor']))
    and exists (select 1 from public.band_songs bso join public.band_setlists bs on bs.band_id = bso.band_id where bso.id = band_song_id and bs.id = band_setlist_id)
  );
create policy "Band editors can delete band setlist songs" on public.band_setlist_songs
  for delete to authenticated using (exists (select 1 from public.band_setlists bs where bs.id = band_setlist_id and private.has_band_role(bs.band_id, array['owner','editor'])));
