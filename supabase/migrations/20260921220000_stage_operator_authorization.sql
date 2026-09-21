-- CANTUM: only the assigned Stage MD may mutate canonical execution state.

create or replace function private.assert_stage_operator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_md_user_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if tg_table_name = 'stage_sessions' then
    v_md_user_id := new.md_user_id;
  else
    select ss.md_user_id
      into v_md_user_id
    from public.stage_session_states st
    join public.stage_sessions ss on ss.id = st.stage_session_id
    where st.stage_session_id = new.stage_session_id;
  end if;

  if v_md_user_id is null or v_md_user_id <> auth.uid() then
    raise exception 'only the Stage MD can mutate execution state';
  end if;

  return new;
end;
$$;

drop trigger if exists stage_sessions_operator_guard on public.stage_sessions;
create trigger stage_sessions_operator_guard
before update on public.stage_sessions
for each row
when (
  old.status is distinct from new.status
  or old.started_at is distinct from new.started_at
  or old.ended_at is distinct from new.ended_at
)
execute function private.assert_stage_operator();

drop trigger if exists stage_session_states_operator_guard on public.stage_session_states;
create trigger stage_session_states_operator_guard
before update on public.stage_session_states
for each row
when (
  old.revision is distinct from new.revision
  or old.current_index is distinct from new.current_index
  or old.current_service_item_id is distinct from new.current_service_item_id
  or old.current_song_id is distinct from new.current_song_id
  or old.current_key is distinct from new.current_key
  or old.prepared_index is distinct from new.prepared_index
  or old.prepared_service_item_id is distinct from new.prepared_service_item_id
  or old.prepared_song_id is distinct from new.prepared_song_id
  or old.is_running is distinct from new.is_running
  or old.md_annotation is distinct from new.md_annotation
)
execute function private.assert_stage_operator();
