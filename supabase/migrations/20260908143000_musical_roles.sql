-- CANTUM — Tarefa R: personalização do Modo Banda por função musical
--
-- A função musical é uma preferência persistente do integrante da banda.
-- O fallback permanece compatível com membros existentes: 'other'.

alter table public.band_members
  add column if not exists musical_role text not null default 'other'
  check (musical_role in (
    'vocals',
    'electric-guitar',
    'acoustic-guitar',
    'bass',
    'drums',
    'keys',
    'piano',
    'strings',
    'brass',
    'woodwinds',
    'other'
  ));

create index if not exists band_members_band_musical_role_idx
  on public.band_members(band_id, musical_role);

create or replace function public.get_my_band_musical_role(p_band_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select bm.musical_role
  from public.band_members bm
  where bm.band_id = p_band_id
    and bm.user_id = auth.uid();
$$;

revoke all on function public.get_my_band_musical_role(uuid) from public, anon;
grant execute on function public.get_my_band_musical_role(uuid) to authenticated;

create or replace function public.update_my_band_musical_role(
  p_band_id uuid,
  p_musical_role text
)
returns public.band_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.band_members;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if p_musical_role not in (
    'vocals',
    'electric-guitar',
    'acoustic-guitar',
    'bass',
    'drums',
    'keys',
    'piano',
    'strings',
    'brass',
    'woodwinds',
    'other'
  ) then
    raise exception 'invalid musical role';
  end if;

  update public.band_members
  set musical_role = p_musical_role,
      updated_at = now()
  where band_id = p_band_id
    and user_id = auth.uid()
  returning * into v_member;

  if not found then
    raise exception 'band membership not found';
  end if;

  return v_member;
end;
$$;

revoke all on function public.update_my_band_musical_role(uuid, text) from public, anon;
grant execute on function public.update_my_band_musical_role(uuid, text) to authenticated;

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
  bpm integer,
  musical_role text
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
    bs.bpm,
    coalesce(bm.musical_role, 'other')
  from public.band_setlist_songs bss
  join public.band_songs bs on bs.id = bss.band_song_id
  left join public.band_song_member_states bsms
    on bsms.band_song_id = bs.id
   and bsms.user_id = auth.uid()
  left join public.band_members bm
    on bm.band_id = v_session.band_id
   and bm.user_id = auth.uid()
  where bss.band_setlist_id = v_session.setlist_id
  order by bss.position asc;
end;
$$;

revoke all on function public.get_band_stage_setlist(uuid) from public, anon;
grant execute on function public.get_band_stage_setlist(uuid) to authenticated;
