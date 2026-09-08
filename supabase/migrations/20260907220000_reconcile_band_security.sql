-- Reconcile the Band authorization schema with the live Supabase state.
--
-- This migration captures the security changes that were present in the
-- remote project but were not represented by the current branch migrations:
-- invite lookup indexes, RPC-only invite revocation, and owner-only
-- membership management RPCs.

create index if not exists band_invites_accepted_by_user_idx
  on public.band_invites (accepted_by_user_id);

create index if not exists band_invites_invited_by_user_idx
  on public.band_invites (invited_by_user_id);

create or replace function private.revoke_band_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_updated boolean;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  update public.band_invites
  set revoked_at = now()
  where id = p_invite_id
    and accepted_at is null
    and revoked_at is null
    and private.has_band_role(band_id, array['owner', 'editor'])
  returning true into v_updated;

  if coalesce(v_updated, false) = false then
    raise exception 'invite not found or not authorized';
  end if;
end;
$$;

create or replace function public.revoke_band_invite(p_invite_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.revoke_band_invite(p_invite_id);
$$;

revoke execute on function public.revoke_band_invite(uuid) from public, anon;
grant execute on function public.revoke_band_invite(uuid) to authenticated;

revoke all on function private.revoke_band_invite(uuid) from public;
grant execute on function private.revoke_band_invite(uuid) to authenticated;

drop policy if exists "Band owners and editors can revoke invites"
  on public.band_invites;

revoke update on table public.band_invites from authenticated;

create or replace function private.update_band_member_role(
  p_member_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_band_id uuid;
begin
  if v_owner is null then
    raise exception 'authentication required';
  end if;

  if p_role not in ('editor', 'member') then
    raise exception 'invalid member role';
  end if;

  select band_id
    into v_band_id
  from public.band_members
  where id = p_member_id;

  if v_band_id is null then
    raise exception 'member not found';
  end if;

  if not exists (
    select 1
    from public.bands
    where id = v_band_id
      and owner_user_id = v_owner
  ) then
    raise exception 'not authorized to manage members';
  end if;

  update public.band_members
  set role = p_role,
      updated_at = now()
  where id = p_member_id
    and role <> 'owner';
end;
$$;

create or replace function public.update_band_member_role(
  p_member_id uuid,
  p_role text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.update_band_member_role(p_member_id, p_role);
$$;

create or replace function private.remove_band_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_band_id uuid;
begin
  if v_owner is null then
    raise exception 'authentication required';
  end if;

  select band_id
    into v_band_id
  from public.band_members
  where id = p_member_id;

  if v_band_id is null then
    raise exception 'member not found';
  end if;

  if not exists (
    select 1
    from public.bands
    where id = v_band_id
      and owner_user_id = v_owner
  ) then
    raise exception 'not authorized to manage members';
  end if;

  delete from public.band_members
  where id = p_member_id
    and role <> 'owner';
end;
$$;

create or replace function public.remove_band_member(p_member_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.remove_band_member(p_member_id);
$$;

revoke execute on function public.update_band_member_role(uuid, text),
  public.remove_band_member(uuid)
  from public, anon;

grant execute on function public.update_band_member_role(uuid, text),
  public.remove_band_member(uuid)
  to authenticated;

revoke all on function private.update_band_member_role(uuid, text),
  private.remove_band_member(uuid)
  from public;

grant execute on function private.update_band_member_role(uuid, text),
  private.remove_band_member(uuid)
  to authenticated;
