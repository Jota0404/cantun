-- CANTUM — Tarefa S: experiência de palco derivada da função musical
--
-- A função musical continua sendo uma preferência do integrante.
-- Esta RPC apenas materializa a experiência inicial consumida pela UI.

create or replace function public.get_my_band_stage_experience(p_band_id uuid)
returns table (
  musical_role text,
  font_size integer,
  read_mode text,
  show_notes boolean,
  show_bpm boolean,
  show_key boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  select coalesce(bm.musical_role, 'other')
    into v_role
  from public.band_members bm
  where bm.band_id = p_band_id
    and bm.user_id = auth.uid();

  v_role := coalesce(v_role, 'other');

  if v_role = 'vocals' then
    return query select v_role, 24, 'scroll', true, true, true;
  elsif v_role = 'bass' then
    return query select v_role, 24, 'scroll', false, true, true;
  elsif v_role = 'drums' then
    return query select v_role, 20, 'pages', false, true, false;
  elsif v_role in ('keys', 'piano') then
    return query select v_role, 21, 'scroll', true, true, true;
  elsif v_role in ('brass', 'woodwinds') then
    return query select v_role, 22, 'scroll', false, true, true;
  else
    return query select v_role, 22, 'scroll', true, true, true;
  end if;
end;
$$;

revoke all on function public.get_my_band_stage_experience(uuid) from public, anon;
grant execute on function public.get_my_band_stage_experience(uuid) to authenticated;
