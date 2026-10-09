import type { OrganizationAccessRole } from '../organizations/organizationMembership'
import type { MemberStatus, TeamRole } from '../teams/teamMembership'

// Espelho de docs/PERMISSIONS.md §3, só para UX (RN-12). Quem decide é `app.has_permission`.

/** ✅ / ❌ · `L`: Líder ativo da equipe do contexto · `L*`: Líder ativo de alguma equipe · `P`: só no próprio recurso. */
export type PermissionRule = true | false | 'L' | 'L*' | 'P'

type Row = { scope: 'organization' | 'team' | 'own'; owner: PermissionRule; admin: PermissionRule; leader: PermissionRule; member: PermissionRule }

export const PERMISSION_MATRIX = {
  'organization.edit': { scope: 'organization', owner: true, admin: true, leader: false, member: false },
  'organization.delete': { scope: 'organization', owner: true, admin: false, leader: false, member: false },
  'team.create': { scope: 'organization', owner: true, admin: true, leader: false, member: false },
  'team.rename': { scope: 'team', owner: true, admin: true, leader: 'L', member: false },
  'team.delete': { scope: 'team', owner: true, admin: true, leader: false, member: false },
  'team_member.add': { scope: 'team', owner: true, admin: true, leader: 'L', member: false },
  'team_member.set_status': { scope: 'team', owner: true, admin: true, leader: 'L', member: false },
  'team_member.set_leader_status': { scope: 'team', owner: true, admin: true, leader: false, member: false },
  'team_member.set_role': { scope: 'team', owner: true, admin: true, leader: false, member: false },
  'team_member.set_functions': { scope: 'team', owner: true, admin: true, leader: 'L', member: false },
  'team_member.set_own_functions': { scope: 'team', owner: true, admin: true, leader: 'L', member: 'P' },
  'song.create': { scope: 'organization', owner: true, admin: true, leader: true, member: true },
  'song.edit': { scope: 'organization', owner: true, admin: true, leader: 'L*', member: false },
  'song.edit_own': { scope: 'own', owner: true, admin: true, leader: true, member: 'P' },
  'song.delete': { scope: 'organization', owner: true, admin: true, leader: false, member: false },
  'song.delete_own': { scope: 'own', owner: true, admin: true, leader: true, member: 'P' },
  'repertoire.create': { scope: 'organization', owner: true, admin: true, leader: true, member: true },
  'repertoire.edit': { scope: 'organization', owner: true, admin: true, leader: 'L*', member: false },
  'repertoire.edit_own': { scope: 'own', owner: true, admin: true, leader: true, member: 'P' },
  'repertoire.delete': { scope: 'organization', owner: true, admin: true, leader: false, member: false },
  'repertoire.delete_own': { scope: 'own', owner: true, admin: true, leader: true, member: 'P' },
  'stage.run': { scope: 'organization', owner: true, admin: true, leader: true, member: true },
} as const satisfies Record<string, Row>

export type Capability = keyof typeof PERMISSION_MATRIX

export interface AccessContext {
  organizationRole: OrganizationAccessRole | null
  /** Vínculo de quem age na equipe do contexto (capacidades de equipe). */
  teamRole?: TeamRole | null
  teamStatus?: MemberStatus | null
  /** Líder ativo de alguma equipe da organização (`L*`). */
  isActiveLeaderInOrganization?: boolean
  /** Sem vínculos de equipe ou com ao menos um ativo (PERMISSIONS §4). Padrão: true. */
  isActiveInOrganization?: boolean
  /** O recurso (ou o vínculo, em `set_own_functions`) é de quem age. */
  isOwnResource?: boolean
}

export function hasPermission(context: AccessContext, capability: Capability): boolean {
  const row: Row | undefined = (PERMISSION_MATRIX as Record<string, Row>)[capability]
  const role = context.organizationRole
  if (!row || !role) return false
  if (role === 'owner' || role === 'admin') return row[role] === true

  let rule: PermissionRule
  if (row.scope === 'team') {
    if (!context.teamRole || context.teamStatus !== 'active') return false
    rule = row[context.teamRole]
  } else {
    if (context.isActiveInOrganization === false) return false
    rule = context.isActiveLeaderInOrganization ? row.leader : row.member
  }
  if (rule === 'P') return context.isOwnResource === true
  if (rule === 'L') return context.teamRole === 'leader'
  if (rule === 'L*') return context.isActiveLeaderInOrganization === true
  return rule
}
