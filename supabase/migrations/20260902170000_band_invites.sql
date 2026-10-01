create table public.band_invites (
  id uuid primary key default gen_random_uuid(),
  band_id uuid not null references public.bands(id) on delete cascade,
  invited_by_user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('editor', 'member')),
  invitee_email text,
  token_hash bytea not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by_user_id uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  check (expires_at > created_at),
  check (accepted_at is null or revoked_at is null)
);

create index band_invites_band_created_idx on public.band_invites(band_id, created_at desc);
create index band_invites_band_pending_idx on public.band_invites(band_id, expires_at) where accepted_at is null and revoked_at is null;

alter table public.band_invites enable row level security;
revoke all on table public.band_invites from anon;
grant select, update on table public.band_invites to authenticated;

create policy "Band members can read band invites"
on public.band_invites for select to authenticated
using (private.has_band_role(band_id, array['owner','editor']));

create policy "Band owners and editors can revoke invites"
on public.band_invites for update to authenticated
using (private.has_band_role(band_id, array['owner','editor']) and accepted_at is null and revoked_at is null)
with check (private.has_band_role(band_id, array['owner','editor']) and band_id = band_invites.band_id and invited_by_user_id = band_invites.invited_by_user_id and role = band_invites.role and token_hash = band_invites.token_hash and created_at = band_invites.created_at and expires_at = band_invites.expires_at and accepted_at = band_invites.accepted_at and accepted_by_user_id = band_invites.accepted_by_user_id and revoked_at is not null);

create or replace function private.create_band_invite(
  p_band_id uuid,
  p_role text,
  p_invitee_email text default null,
  p_expires_in_hours integer default 168
)
returns table (id uuid, band_id uuid, invited_by_user_id uuid, role text, invitee_email text, created_at timestamptz, expires_at timestamptz, token text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid(); v_token text; v_id uuid; v_created_at timestamptz; v_expires_at timestamptz;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  if p_role not in ('editor', 'member') then raise exception 'invalid invite role'; end if;
  if p_expires_in_hours < 1 or p_expires_in_hours > 720 then raise exception 'invalid invite expiration'; end if;
  if not private.has_band_role(p_band_id, array['owner','editor']) then raise exception 'not authorized to invite members'; end if;
  v_token := encode(gen_random_bytes(32), 'hex'); v_created_at := now(); v_expires_at := v_created_at + make_interval(hours => p_expires_in_hours); v_id := gen_random_uuid();
  insert into public.band_invites (id, band_id, invited_by_user_id, role, invitee_email, token_hash, created_at, expires_at)
  values (v_id, p_band_id, v_user_id, p_role, nullif(lower(btrim(p_invitee_email)), ''), digest(v_token, 'sha256'), v_created_at, v_expires_at);
  return query select v_id, p_band_id, v_user_id, p_role, nullif(lower(btrim(p_invitee_email)), ''), v_created_at, v_expires_at, v_token;
end;
$$;

create or replace function private.get_band_invite(p_token text)
returns table (id uuid, band_id uuid, band_name text, role text, invitee_email text, created_at timestamptz, expires_at timestamptz, accepted_at timestamptz, revoked_at timestamptz, status text)
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  return query select i.id, i.band_id, b.name, i.role, i.invitee_email, i.created_at, i.expires_at, i.accepted_at, i.revoked_at,
    case when i.revoked_at is not null then 'revoked' when i.accepted_at is not null then 'accepted' when i.expires_at <= now() then 'expired' else 'pending' end
  from public.band_invites i join public.bands b on b.id = i.band_id where i.token_hash = digest(p_token, 'sha256');
end;
$$;

create or replace function private.accept_band_invite(p_token text)
returns table (band_id uuid, band_name text, role text, membership_id uuid, already_member boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid(); v_invite public.band_invites%rowtype; v_membership_id uuid; v_already_member boolean; v_email text;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  select * into v_invite from public.band_invites where token_hash = digest(p_token, 'sha256') for update;
  if not found then raise exception 'invalid invite'; end if;
  if v_invite.revoked_at is not null then raise exception 'invite revoked'; end if;
  if v_invite.accepted_at is not null then raise exception 'invite already used'; end if;
  if v_invite.expires_at <= now() then raise exception 'invite expired'; end if;
  select lower(email) into v_email from auth.users where id = v_user_id;
  if v_invite.invitee_email is not null and lower(v_invite.invitee_email) <> coalesce(v_email, '') then raise exception 'invite is restricted to another email'; end if;
  select bm.id into v_membership_id from public.band_members bm where bm.band_id = v_invite.band_id and bm.user_id = v_user_id for update;
  v_already_member := found;
  if not v_already_member then
    v_membership_id := gen_random_uuid();
    insert into public.band_members (id, band_id, user_id, role, created_at, updated_at) values (v_membership_id, v_invite.band_id, v_user_id, v_invite.role, now(), now());
  end if;
  update public.band_invites set accepted_at = now(), accepted_by_user_id = v_user_id where id = v_invite.id and accepted_at is null and revoked_at is null;
  if not found then raise exception 'invite already used'; end if;
  return query select v_invite.band_id, b.name, coalesce((select bm.role from public.band_members bm where bm.id = v_membership_id), v_invite.role), v_membership_id, v_already_member from public.bands b where b.id = v_invite.band_id;
end;
$$;

revoke all on function private.create_band_invite(uuid, text, text, integer), private.get_band_invite(text), private.accept_band_invite(text) from public;
grant execute on function private.create_band_invite(uuid, text, text, integer), private.get_band_invite(text), private.accept_band_invite(text) to authenticated;
