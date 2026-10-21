-- CANTUM — B6 fatia 2 / tom por serviço (VS-04-05, RN-06…09).
-- service_items.key guarda o tom de execução da música naquele serviço (nulo = herda songs.current_key).
-- Mesmo modo (maior/menor) do original_key da música; só em itens 'song'. A RLS existente de service_items
-- (can_edit_service = service.edit, negado em completed/cancelled) já cobre quem pode gravar.
-- O Palco online (get_service_stage_songs) passa a devolver coalesce(si.key, s.current_key) (RN-08).

alter table public.service_items
  add column key text,
  add constraint service_items_key_valid check (key is null or key ~ '^(C#?|Db|D#?|Eb|E|F#?|Gb|G#?|Ab|A#?|Bb|B)m?$'),
  add constraint service_items_key_song_only check (key is null or type = 'song');

create function app.service_item_key_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_original text;
begin
  if new.key is null then return new; end if;
  -- O upsert do /sync reescreve key e song_id em todo push; sem mudança, não revalida (tom órfão é mantido).
  if tg_op = 'UPDATE' and new.key is not distinct from old.key and new.song_id is not distinct from old.song_id then
    return new;
  end if;
  -- Só vê o modo de música da mesma organização do serviço; outra organização cai no service_items_scope.
  select s.original_key into v_original
  from public.songs s
  join public.services svc on svc.id = new.service_id
  where s.id = new.song_id and s.organization_id = svc.organization_id;
  if v_original is not null and (right(new.key, 1) = 'm') <> (right(v_original, 1) = 'm') then
    raise exception 'service item key must have the same mode as the song original key' using errcode = '23514';
  end if;
  return new;
end
$$;
revoke all on function app.service_item_key_guard() from public;

create trigger service_items_key_guard before insert or update of key, song_id, type on public.service_items
  for each row execute function app.service_item_key_guard();

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
    coalesce(si.key, s.current_key),
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
