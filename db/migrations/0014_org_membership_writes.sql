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
