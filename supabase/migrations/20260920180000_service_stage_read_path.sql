-- CANTUM: target Stage read path.
-- Stage reads ServiceItems + canonical Songs; realtime/control remains legacy.

create or replace function public.get_service_stage_songs(
  p_stage_session_id uuid
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
language sql
stable
security definer
set search_path = ''
as $$
  select
    si.position,
    s.id,
    s.title,
    s.artist,
    s.original_key,
    s.original_key,
    s.lyrics,
    s.notes,
    s.bpm,
    coalesce(
      (
        select a.musical_function
        from public.assignments a
        where a.service_id = svc.id
          and a.user_id = auth.uid()
          and (a.service_item_id = si.id or a.service_item_id is null)
          and a.status in ('pending', 'accepted')
        order by case when a.service_item_id = si.id then 0 else 1 end, a.created_at desc
        limit 1
      ),
      'other'
    )
  from public.stage_sessions ss
  join public.services svc on svc.id = ss.service_id
  join public.service_items si on si.service_id = svc.id
  join public.songs s on s.id = si.song_id
  join public.organization_memberships om
    on om.organization_id = svc.organization_id
   and om.user_id = auth.uid()
  where ss.id = p_stage_session_id
  order by si.position asc;
$$;

revoke all on function public.get_service_stage_songs(uuid) from public, anon;
grant execute on function public.get_service_stage_songs(uuid) to authenticated;
