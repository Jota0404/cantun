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
  if v_user_id is null then raise exception 'authentication required'; end if;

  update public.band_invites
  set revoked_at = now()
  where id = p_invite_id
    and accepted_at is null
    and revoked_at is null
    and private.has_band_role(band_id, array['owner','editor'])
  returning true into v_updated;

  if coalesce(v_updated, false) = false then
    raise exception 'invite not found or not authorized';
  end if;
end;
$$;

create or replace function public.create_band_invite(
  p_band_id uuid,
  p_role text,
  p_invitee_email text default null,
  p_expires_in_hours integer default 168
)
returns table (id uuid, band_id uuid, invited_by_user_id uuid, role text, invitee_email text, created_at timestamptz, expires_at timestamptz, token text)
language sql security definer set search_path = ''
as $$ select * from private.create_band_invite(p_band_id, p_role, p_invitee_email, p_expires_in_hours); $$;

create or replace function public.get_band_invite(p_token text)
returns table (id uuid, band_id uuid, band_name text, role text, invitee_email text, created_at timestamptz, expires_at timestamptz, accepted_at timestamptz, revoked_at timestamptz, status text)
language sql security definer set search_path = ''
as $$ select * from private.get_band_invite(p_token); $$;

create or replace function public.accept_band_invite(p_token text)
returns table (band_id uuid, band_name text, role text, membership_id uuid, already_member boolean)
language sql security definer set search_path = ''
as $$ select * from private.accept_band_invite(p_token); $$;

create or replace function public.revoke_band_invite(p_invite_id uuid)
returns void
language sql security definer set search_path = ''
as $$ select private.revoke_band_invite(p_invite_id); $$;

revoke execute on function public.create_band_invite(uuid, text, text, integer), public.get_band_invite(text), public.accept_band_invite(text), public.revoke_band_invite(uuid) from public, anon;
grant execute on function public.create_band_invite(uuid, text, text, integer), public.get_band_invite(text), public.accept_band_invite(text), public.revoke_band_invite(uuid) to authenticated;
revoke all on function private.revoke_band_invite(uuid) from public;
grant execute on function private.revoke_band_invite(uuid) to authenticated;
