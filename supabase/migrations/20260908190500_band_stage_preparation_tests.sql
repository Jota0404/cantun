-- CANTUM — Tarefa V: checks de contrato da preparação do palco.

create or replace function private.assert_band_stage_preparation_contract()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prepared_index_type text;
  v_prepared_song_fk boolean;
begin
  select format_type(a.atttypid, a.atttypmod)
    into v_prepared_index_type
  from pg_attribute a
  where a.attrelid = 'public.band_stage_states'::regclass
    and a.attname = 'prepared_index'
    and not a.attisdropped;

  if v_prepared_index_type <> 'integer' then
    raise exception 'prepared_index must be integer';
  end if;

  select exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.band_stage_states'::regclass
      and c.conname = 'band_stage_states_prepared_song_fk'
      and c.contype = 'f'
  ) into v_prepared_song_fk;

  if not v_prepared_song_fk then
    raise exception 'prepared_song_id must have a foreign key';
  end if;

  if has_table_privilege('authenticated', 'public.band_stage_states', 'UPDATE') then
    raise exception 'authenticated clients must not have direct update on stage state';
  end if;
end;
$$;

revoke all on function private.assert_band_stage_preparation_contract() from public;
grant execute on function private.assert_band_stage_preparation_contract() to authenticated;
