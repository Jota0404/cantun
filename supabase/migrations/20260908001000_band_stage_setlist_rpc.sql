-- CANTUM — Tarefa N: leitura do snapshot lógico do setlist da sessão de palco
-- The client may read the songs required to render a session, but the setlist
-- remains immutable from the live-stage UI.

create or replace function public.get_band_stage_setlist(
  p_session_id uuid
)
returns table (
  position integer,
  song_id uuid,
  title text,
  artist text,
  original_key text,
  current_key text,
  lyrics text,
  notes text,
  bpm integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_session public.band_stage_sessions;
begin
  v_session := private.require_band_stage_session_access(p_session_id);

  return query
  select
    bss.position,
    bs.id,
    bs.title,
    bs.artist,
    bs.original_key,
    coalesce(bsms.current_key, bs.original_key) as current_key,
    bs.lyrics,
    bs.notes,
    bs.bpm
  from public.band_setlist_songs bss
  join public.band_songs bs on bs.id = bss.band_song_id
  left join public.band_song_member_states bsms
    on bsms.band_song_id = bs.id
   and bsms.user_id = auth.uid()
  where bss.band_setlist_id = v_session.setlist_id
  order by bss.position asc;
end;
$$;

revoke all on function public.get_band_stage_setlist(uuid) from public, anon;
grant execute on function public.get_band_stage_setlist(uuid) to authenticated;
