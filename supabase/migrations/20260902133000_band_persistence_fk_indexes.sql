create index if not exists bands_owner_user_idx on public.bands(owner_user_id);
create index if not exists band_setlists_created_by_user_idx on public.band_setlists(created_by_user_id);
create index if not exists band_setlist_songs_band_song_idx on public.band_setlist_songs(band_song_id);
