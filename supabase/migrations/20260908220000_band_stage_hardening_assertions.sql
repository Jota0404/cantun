-- CANTUM — Hardening: structural assertions for the Band Mode contract.
--
-- These checks are intentionally read-only and fail the migration if the
-- schema drifts away from the RPC-only / monotonic-revision contract.

create or replace function private.assert_band_stage_hardening()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trigger_count integer;
  v_has_sessions_rls boolean;
  v_has_states_rls boolean;
  v_has_revision_index boolean;
begin
  select count(*)
    into v_trigger_count
  from pg_trigger
  where tgrelid = 'public.band_stage_states'::regclass
    and tgname = 'band_stage_states_protect_invariants'
    and not tgisinternal;

  if v_trigger_count <> 1 then
    raise exception 'band stage states must have exactly one invariant trigger';
  end if;

  select relrowsecurity
    into v_has_sessions_rls
  from pg_class
  where oid = 'public.band_stage_sessions'::regclass;

  select relrowsecurity
    into v_has_states_rls
  from pg_class
  where oid = 'public.band_stage_states'::regclass;

  if not coalesce(v_has_sessions_rls, false) or not coalesce(v_has_states_rls, false) then
    raise exception 'band stage tables must keep RLS enabled';
  end if;

  select exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'band_stage_states'
      and indexname = 'band_stage_states_revision_idx'
  ) into v_has_revision_index;

  if not v_has_revision_index then
    raise exception 'band stage revision index is missing';
  end if;
end;
$$;

revoke all on function private.assert_band_stage_hardening() from public;
grant execute on function private.assert_band_stage_hardening() to authenticated;
