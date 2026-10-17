import { hasPermission, type AccessContext } from '../access/permissions'
import type { OrganizationAccessRole } from '../organizations/organizationMembership'
import type { MemberStatus, TeamMembership, TeamRole } from './teamMembership'

// Regras puras de transição (RN-04…RN-07). UX apenas; o banco revalida (RN-12).

type Target = Pick<TeamMembership, 'role' | 'status' | 'userId'>

export function canChangeRole(actor: AccessContext, target: Target, nextRole: TeamRole): boolean {
  return target.role !== nextRole && target.status === 'active' && hasPermission(actor, 'team_member.set_role')
}

export function canChangeStatus(actor: AccessContext, target: Target, nextStatus: MemberStatus): boolean {
  if (target.status === nextStatus) return false
  return hasPermission(actor, target.role === 'leader' ? 'team_member.set_leader_status' : 'team_member.set_status')
}

export function canSetFunctions(actor: AccessContext, target: Target, actorUserId: string): boolean {
  const isOrgAdmin = actor.organizationRole === 'owner' || actor.organizationRole === 'admin'
  // O Líder não edita membro inativo (N5); Owner/Admin sim.
  if (target.status === 'inactive' && !isOrgAdmin) return false
  if (target.userId === actorUserId) return hasPermission({ ...actor, isOwnResource: true }, 'team_member.set_own_functions')
  return hasPermission(actor, 'team_member.set_functions')
}

/** B8 (RN-07). O banco revalida: Líder só remove `member`, ninguém remove a si mesmo, Líder não remove Owner/Admin; Admin não remove Owner. */
export function canRemoveMember(actor: AccessContext, target: Target & { organizationRole?: OrganizationAccessRole | null }, actorUserId: string): boolean {
  if (target.userId === actorUserId) return false
  const privileged = actor.organizationRole === 'owner' || actor.organizationRole === 'admin'
  if (!privileged && (target.role === 'leader' || target.organizationRole === 'owner' || target.organizationRole === 'admin')) return false
  if (target.organizationRole === 'owner' && actor.organizationRole !== 'owner') return false
  return hasPermission(actor, 'team_member.remove')
}
