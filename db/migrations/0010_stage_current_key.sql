-- CANTUM — FIX-01 / correção do tom no Palco do serviço.
-- get_service_stage_songs devolvia original_key também como current_key, então o Palco online ignorava o tom
-- que o músico escolheu (e que a cópia do Ministério herda), enquanto o offline (Dexie) usava current_key.
-- Passa a devolver songs.current_key, igual ao caminho offline e ao Palco solo.

create or replace function public.get_service_stage_songs(p_stage_session_id uuid) returns table("position" integer, song_id uuid, title text, artist text, original_key text, current_key text, lyrics text, notes text, bpm integer, musical_role text)
  language sql stable security definer
  set search_path = ''
as $$
  select
    si.position,
    s.id,
    s.title,
    s.artist,
    s.original_key,
    s.current_key,
    s.lyrics,
    s.notes,
    s.bpm,
    coalesce(
      (
        select sp.musical_function
        from public.assignments a
        join public.service_positions sp on sp.id = a.position_id
        where a.service_id = svc.id
          and a.user_id = app.current_user_id()
          and (a.service_item_id = si.id or a.service_item_id is null)
          and a.status in ('invited', 'confirmed')
        order by case when a.service_item_id = si.id then 0 else 1 end, a.created_at desc
        limit 1
      ),
      'other'
    )
  from public.stage_sessions ss
  join public.services svc on svc.id = ss.service_id
  join public.service_items si on si.service_id = svc.id and si.type = 'song'
  join public.songs s on s.id = si.song_id
  where ss.id = p_stage_session_id
    and app.has_permission(svc.organization_id, null, 'stage.run')
  order by si.position asc;
$$;
