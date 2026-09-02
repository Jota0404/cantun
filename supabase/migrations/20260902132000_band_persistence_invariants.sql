create or replace function private.protect_band_invariants()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_table_name = 'bands' and tg_op = 'UPDATE' and new.owner_user_id <> old.owner_user_id then
    raise exception 'band owner cannot be changed';
  end if;
  if tg_table_name = 'band_members' then
    if tg_op = 'DELETE' and old.role = 'owner' then raise exception 'band owner membership cannot be deleted'; end if;
    if tg_op = 'UPDATE' and old.role = 'owner' and (new.role <> 'owner' or new.user_id <> old.user_id or new.band_id <> old.band_id) then raise exception 'band owner membership cannot be changed'; end if;
    if tg_op = 'UPDATE' and old.band_id <> new.band_id then raise exception 'band membership band cannot be changed'; end if;
  end if;
  if tg_table_name = 'band_songs' and tg_op = 'UPDATE' and new.band_id <> old.band_id then
    raise exception 'band song band cannot be changed';
  end if;
  if tg_table_name = 'band_song_member_states' and tg_op = 'UPDATE' and (new.band_song_id <> old.band_song_id or new.user_id <> old.user_id) then
    raise exception 'band song member state identity cannot be changed';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists band_members_protect_invariants on public.band_members;
drop trigger if exists bands_protect_invariants on public.bands;
drop trigger if exists band_songs_protect_invariants on public.band_songs;
drop trigger if exists band_song_member_states_protect_invariants on public.band_song_member_states;

create trigger bands_protect_invariants before update on public.bands for each row execute function private.protect_band_invariants();
create trigger band_members_protect_invariants before update or delete on public.band_members for each row execute function private.protect_band_invariants();
create trigger band_songs_protect_invariants before update on public.band_songs for each row execute function private.protect_band_invariants();
create trigger band_song_member_states_protect_invariants before update on public.band_song_member_states for each row execute function private.protect_band_invariants();

drop policy if exists "Members can update their song states" on public.band_song_member_states;
drop policy if exists "Members can delete their song states" on public.band_song_member_states;
create policy "Members can update their song states" on public.band_song_member_states
  for update to authenticated
  using (user_id = (select auth.uid()) and exists (select 1 from public.band_songs bs where bs.id = band_song_id and private.is_band_member(bs.band_id)))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.band_songs bs where bs.id = band_song_id and private.is_band_member(bs.band_id)));
create policy "Members can delete their song states" on public.band_song_member_states
  for delete to authenticated
  using (user_id = (select auth.uid()) and exists (select 1 from public.band_songs bs where bs.id = band_song_id and private.is_band_member(bs.band_id)));

revoke all on function private.protect_band_invariants() from public;
