-- CANTUM: tighten canonical Stage operator authorization.
-- An update is authorized by the current MD identity, never by a newly supplied md_user_id.

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
    v_md_user_id := old.md_user_id;
  else
    select ss.md_user_id
      into v_md_user_id
    from public.stage_session_states st
    join public.stage_sessions ss on ss.id = st.stage_session_id
    where st.stage_session_id = new.stage_session_id;
  end if;

  if v_md_user_id is null or v_md_user_id <> auth.uid() then
    raise exception 'only the current Stage MD can mutate execution state';
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
  or old.md_user_id is distinct from new.md_user_id
)
execute function private.assert_stage_operator();
