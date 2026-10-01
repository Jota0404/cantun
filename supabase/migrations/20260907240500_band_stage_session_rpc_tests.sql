-- CANTUM — Tarefa L: checks de contrato para RPCs da BandStageSession
--
-- This migration adds a small SQL assertion helper so the deployed schema
-- cannot accidentally re-open direct table mutation for authenticated users.
-- Functional multi-user authorization tests remain environment/integration
-- tests because they require distinct authenticated JWT identities.

create or replace function private.assert_band_stage_rpc_surface()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_has_insert_policy boolean;
  v_has_update_policy boolean;
  v_has_delete_policy boolean;
begin
  select exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'band_stage_sessions'
      and cmd = 'INSERT'
  ) into v_has_insert_policy;

  select exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'band_stage_sessions'
      and cmd = 'UPDATE'
  ) into v_has_update_policy;

  select exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'band_stage_sessions'
      and cmd = 'DELETE'
  ) into v_has_delete_policy;

  if v_has_insert_policy or v_has_update_policy or v_has_delete_policy then
    raise exception 'band stage session direct mutation policies must remain disabled';
  end if;

  select exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'band_stage_states'
      and cmd = 'INSERT'
  ) into v_has_insert_policy;

  select exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'band_stage_states'
      and cmd = 'UPDATE'
  ) into v_has_update_policy;

  select exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'band_stage_states'
      and cmd = 'DELETE'
  ) into v_has_delete_policy;

  if v_has_insert_policy or v_has_update_policy or v_has_delete_policy then
    raise exception 'band stage state direct mutation policies must remain disabled';
  end if;
end;
$$;

revoke all on function private.assert_band_stage_rpc_surface() from public;
grant execute on function private.assert_band_stage_rpc_surface() to authenticated;
