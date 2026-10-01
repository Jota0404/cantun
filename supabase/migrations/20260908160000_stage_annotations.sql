-- CANTUM — Tarefa T: anotações operacionais do MD no Modo Banda
--
-- Annotations are session state: the MD is the only writer, while all band
-- members consume the current annotation through the existing snapshot/RPC.

alter table public.band_stage_states
  add column if not exists md_annotation text;

create or replace function public.band_stage_set_annotation(
  p_session_id uuid,
  p_annotation text default null
)
returns public.band_stage_states
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.band_stage_sessions;
  v_state public.band_stage_states;
  v_now timestamptz := now();
  v_annotation text := nullif(btrim(coalesce(p_annotation, '')), '');
begin
  v_session := private.require_band_stage_md(p_session_id);

  if v_session.status <> 'live' then
    raise exception 'operational stage commands require a live session';
  end if;

  if v_annotation is not null and char_length(v_annotation) > 500 then
    raise exception 'stage annotation cannot exceed 500 characters';
  end if;

  update public.band_stage_states
  set md_annotation = v_annotation,
      revision = revision + 1,
      updated_at = v_now
  where session_id = p_session_id
  returning * into v_state;

  if not found then
    raise exception 'stage state not found';
  end if;

  return v_state;
end;
$$;

revoke execute on function public.band_stage_set_annotation(uuid, text) from public, anon;
grant execute on function public.band_stage_set_annotation(uuid, text) to authenticated;
