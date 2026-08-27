create table public.songs (
  id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  artist text,
  original_key text not null,
  current_key text not null,
  bpm integer,
  lyrics text not null,
  notes text,
  is_favorite boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (user_id, id)
);

create table public.setlists (
  id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (user_id, id)
);

create table public.setlist_songs (
  id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  setlist_id uuid not null,
  song_id uuid not null,
  position integer not null,
  primary key (user_id, id),
  foreign key (user_id, setlist_id) references public.setlists(user_id, id) on delete cascade,
  foreign key (user_id, song_id) references public.songs(user_id, id) on delete cascade,
  unique (user_id, setlist_id, song_id)
);

create index songs_user_id_updated_at_idx on public.songs(user_id, updated_at);
create index setlists_user_id_updated_at_idx on public.setlists(user_id, updated_at);
create index setlist_songs_user_id_setlist_id_position_idx on public.setlist_songs(user_id, setlist_id, position);

alter table public.songs enable row level security;
alter table public.setlists enable row level security;
alter table public.setlist_songs enable row level security;

revoke all on table public.songs, public.setlists, public.setlist_songs from anon;
grant select, insert, update, delete on table public.songs, public.setlists, public.setlist_songs to authenticated;

create policy "Users can read own songs" on public.songs for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can create own songs" on public.songs for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update own songs" on public.songs for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete own songs" on public.songs for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Users can read own setlists" on public.setlists for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can create own setlists" on public.setlists for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update own setlists" on public.setlists for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete own setlists" on public.setlists for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Users can read own setlist songs" on public.setlist_songs for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can create own setlist songs" on public.setlist_songs for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update own setlist songs" on public.setlist_songs for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete own setlist songs" on public.setlist_songs for delete to authenticated using ((select auth.uid()) = user_id);

alter publication supabase_realtime add table public.songs;
alter publication supabase_realtime add table public.setlists;
alter publication supabase_realtime add table public.setlist_songs;
