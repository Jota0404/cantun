-- CANTUM — Issue #132 item 4: o tom ao vivo do Palco (stage_session_states.current_key, escrito por
-- target_stage_set_key) não era zerado ao trocar de música, e o cliente usa current_key ?? tom do item,
-- então um set_key mascarava o tom por serviço (coalesce(service_items.key, songs.current_key), 0017)
-- das músicas seguintes. goto/next/previous passam a zerar current_key junto com a troca de item, na
-- mesma transação e com revision+1. Assinaturas, autorização e guarda do MD inalteradas.
-- Partem das definições de 0005_service_ops.sql. goto para o mesmo item preserva o tom.

CREATE OR REPLACE FUNCTION public.target_stage_goto(p_stage_session_id uuid, p_index integer, p_song_id uuid DEFAULT NULL::uuid) RETURNS public.stage_session_states
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_stage public.stage_sessions; v_state public.stage_session_states; v_item public.service_items;
begin
  select ss.* into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id=ss.service_id
  join public.organization_memberships om on om.organization_id=svc.organization_id and om.user_id=app.current_user_id()
  where ss.id=p_stage_session_id;
  if v_stage.id is null then raise exception 'stage session not found or not authorized'; end if;
  if v_stage.status <> 'live' then raise exception 'stage session is not live'; end if;

  select * into v_item
  from public.service_items si
  where si.service_id=v_stage.service_id and si.type='song'
    and si.position=p_index
    and (p_song_id is null or si.song_id=p_song_id)
  limit 1;

  if v_item.id is null then raise exception 'stage item not found'; end if;

  update public.stage_session_states
  set revision=revision+1,
      current_index=v_item.position,
      current_service_item_id=v_item.id,
      current_song_id=v_item.song_id,
      current_key=case when v_item.id is distinct from current_service_item_id then null else current_key end,
      prepared_index=null,
      prepared_service_item_id=null,
      prepared_song_id=null,
      updated_at=now()
  where stage_session_id=p_stage_session_id
  returning * into v_state;
  return v_state;
end;
$$;

CREATE OR REPLACE FUNCTION public.target_stage_next(p_stage_session_id uuid) RETURNS public.stage_session_states
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_stage public.stage_sessions; v_state public.stage_session_states; v_item public.service_items;
begin
  select ss.* into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id=ss.service_id
  join public.organization_memberships om on om.organization_id=svc.organization_id and om.user_id=app.current_user_id()
  where ss.id=p_stage_session_id;
  if v_stage.id is null then raise exception 'stage session not found or not authorized'; end if;
  if v_stage.status <> 'live' then raise exception 'stage session is not live'; end if;

  select * into v_state from public.stage_session_states where stage_session_id=p_stage_session_id for update;
  select * into v_item
  from public.service_items si
  where si.service_id=v_stage.service_id and si.type='song'
    and si.position > v_state.current_index
  order by si.position asc limit 1;

  if v_item.id is null then
    return v_state;
  end if;

  update public.stage_session_states
  set revision=revision+1,
      current_index=v_item.position,
      current_service_item_id=v_item.id,
      current_song_id=v_item.song_id,
      current_key=null,
      prepared_index=null,
      prepared_service_item_id=null,
      prepared_song_id=null,
      updated_at=now()
  where stage_session_id=p_stage_session_id
  returning * into v_state;
  return v_state;
end;
$$;

CREATE OR REPLACE FUNCTION public.target_stage_previous(p_stage_session_id uuid) RETURNS public.stage_session_states
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_stage public.stage_sessions; v_state public.stage_session_states; v_item public.service_items;
begin
  select ss.* into v_stage
  from public.stage_sessions ss
  join public.services svc on svc.id=ss.service_id
  join public.organization_memberships om on om.organization_id=svc.organization_id and om.user_id=app.current_user_id()
  where ss.id=p_stage_session_id;
  if v_stage.id is null then raise exception 'stage session not found or not authorized'; end if;
  if v_stage.status <> 'live' then raise exception 'stage session is not live'; end if;

  select * into v_state from public.stage_session_states where stage_session_id=p_stage_session_id for update;
  select * into v_item
  from public.service_items si
  where si.service_id=v_stage.service_id and si.type='song'
    and si.position < v_state.current_index
  order by si.position desc limit 1;

  if v_item.id is null then
    return v_state;
  end if;

  update public.stage_session_states
  set revision=revision+1,
      current_index=v_item.position,
      current_service_item_id=v_item.id,
      current_song_id=v_item.song_id,
      current_key=null,
      prepared_index=null,
      prepared_service_item_id=null,
      prepared_song_id=null,
      updated_at=now()
  where stage_session_id=p_stage_session_id
  returning * into v_state;
  return v_state;
end;
$$;
