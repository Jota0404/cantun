-- CANTUM — issue #99: organization_memberships sem escrita direta (ADR-051, docs/PERMISSIONS.md).
--
-- A baseline deu ALL a Owner e Admin e INSERT/UPDATE/DELETE a cantum_user: um Admin promovia a si ou a
-- outro para owner e apagava ou rebaixava o Owner fora de qualquer RPC. Mesmo tratamento de team_memberships
-- (0004, 0011): fica só o SELECT. Todo vínculo nasce e muda por função security definer (dono da tabela):
-- create_organization, accept_organization_invite, update_organization_member_role (nunca vira nem sai de
-- owner), remove_organization_member (nunca remove o Owner), delete_my_account. Os cascades de organização
-- e usuário rodam como dono da tabela e não dependem destes grants.

drop policy "Organization admins can manage memberships" on public.organization_memberships;
revoke insert, update, delete on public.organization_memberships from cantum_user;

-- Achado do Revisor: nas duas RPCs abaixo quem não é membro da organização tem v_actor_role nulo, e
-- `null not in ('owner','admin')` é nulo: o IF não lançava e um usuário de fora com o uuid do vínculo
-- promovia, rebaixava ou removia qualquer vínculo que não fosse o do Owner. Só a checagem muda; o restante
-- é a definição da baseline. `create or replace` mantém os grants.
create or replace function public.remove_organization_member(p_membership_id uuid) returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_target public.organization_memberships%rowtype;
  v_actor_role text;
begin
  if app.current_user_id() is null then raise exception 'authentication required'; end if;

  select * into v_target
  from public.organization_memberships
  where id = p_membership_id
  for update;

  if not found then raise exception 'membership not found'; end if;
  if v_target.role = 'owner' then raise exception 'organization owner cannot be removed'; end if;

  select om.role::text into v_actor_role
  from public.organization_memberships om
  where om.organization_id = v_target.organization_id
    and om.user_id = app.current_user_id();

  if v_actor_role is null or v_actor_role not in ('owner', 'admin') then raise exception 'not authorized'; end if;

  delete from public.team_memberships tm
  where tm.user_id = v_target.user_id
    and exists (
      select 1 from public.teams t
      where t.id = tm.team_id and t.organization_id = v_target.organization_id
    );

  delete from public.organization_memberships where id = p_membership_id;
end;
$$;

create or replace function public.update_organization_member_role(p_membership_id uuid, p_role text) returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_target public.organization_memberships%rowtype;
  v_actor_role text;
begin
  if app.current_user_id() is null then raise exception 'authentication required'; end if;
  if p_role is null or p_role not in ('admin', 'member') then raise exception 'invalid member role'; end if;

  select * into v_target
  from public.organization_memberships
  where id = p_membership_id
  for update;

  if not found then raise exception 'membership not found'; end if;
  if v_target.role = 'owner' then raise exception 'owner role cannot be changed'; end if;

  select om.role::text into v_actor_role
  from public.organization_memberships om
  where om.organization_id = v_target.organization_id
    and om.user_id = app.current_user_id();

  if v_actor_role is null or v_actor_role not in ('owner', 'admin') then raise exception 'not authorized'; end if;

  update public.organization_memberships
  set role = p_role, updated_at = now()
  where id = p_membership_id;
end;
$$;
