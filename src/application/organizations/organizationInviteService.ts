import type { OrganizationAccessRole } from '../../domain/organizations/organizationMembership'
import { rpc } from '../../platform/rpc'
import { selectRows } from '../../platform/sync'

type Row = Record<string, unknown>

export type OrganizationInviteRole = Exclude<OrganizationAccessRole, 'owner'>
export type OrganizationInviteStatus = 'pending' | 'accepted' | 'expired' | 'revoked'

export interface OrganizationInvite {
  id: string
  organizationId: string
  teamId: string
  invitedByUserId: string
  role: OrganizationInviteRole
  inviteeEmail?: string
  createdAt: string
  expiresAt: string
  acceptedAt?: string
  revokedAt?: string
}

export interface OrganizationInvitePreview extends OrganizationInvite {
  organizationName: string
  teamName: string
  status: OrganizationInviteStatus
}

export interface CreatedOrganizationInvite extends OrganizationInvite {
  token: string
}

function mapInvite(row: Record<string, unknown>): OrganizationInvite {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    teamId: row.team_id as string,
    invitedByUserId: row.invited_by_user_id as string,
    role: row.role as OrganizationInviteRole,
    inviteeEmail: (row.invitee_email as string | null) ?? undefined,
    createdAt: row.created_at as string,
    expiresAt: row.expires_at as string,
    acceptedAt: (row.accepted_at as string | null) ?? undefined,
    revokedAt: (row.revoked_at as string | null) ?? undefined,
  }
}

export async function createOrganizationInvite(
  organizationId: string,
  teamId: string,
  role: OrganizationInviteRole,
  inviteeEmail?: string,
): Promise<CreatedOrganizationInvite> {
  const data = await rpc<Row | Row[] | null>('create_organization_invite', {
    p_organization_id: organizationId,
    p_team_id: teamId,
    p_role: role,
    p_invitee_email: inviteeEmail?.trim() || null,
    p_expires_in_hours: 168,
  })
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('Convite não foi criado.')
  return { ...mapInvite(row), token: row.token as string }
}

export async function getOrganizationInvite(token: string): Promise<OrganizationInvitePreview | null> {
  const data = await rpc<Row | Row[] | null>('get_organization_invite', { p_token: token })
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return null
  return {
    ...mapInvite(row),
    organizationName: row.organization_name as string,
    teamName: row.team_name as string,
    status: row.status as OrganizationInviteStatus,
  }
}

export async function acceptOrganizationInvite(token: string) {
  const data = await rpc<Row | Row[] | null>('accept_organization_invite', { p_token: token })
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('O convite não pôde ser aceito.')
  return {
    organizationId: row.organization_id as string,
    organizationName: row.organization_name as string,
    teamId: row.team_id as string,
    teamName: row.team_name as string,
    role: row.role as OrganizationInviteRole,
    organizationMembershipId: row.organization_membership_id as string,
    teamMembershipId: row.team_membership_id as string,
    alreadyOrganizationMember: Boolean(row.already_organization_member),
    alreadyTeamMember: Boolean(row.already_team_member),
  }
}

export async function listOrganizationInvites(
  organizationId: string,
): Promise<Array<OrganizationInvite & { status: OrganizationInviteStatus }>> {
  const rows = await selectRows('organization_invites', { organization_id: organizationId })
  rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))

  return rows.map((row) => ({
    ...mapInvite(row),
    status: row.revoked_at
      ? 'revoked'
      : row.accepted_at
        ? 'accepted'
        : new Date(String(row.expires_at)).getTime() <= Date.now()
          ? 'expired'
          : 'pending',
  }))
}

export async function revokeOrganizationInvite(inviteId: string) {
  await rpc('revoke_organization_invite', { p_invite_id: inviteId })
}

export async function updateOrganizationMemberRole(
  membershipId: string,
  role: Exclude<OrganizationAccessRole, 'owner'>,
) {
  await rpc('update_organization_member_role', {
    p_membership_id: membershipId,
    p_role: role,
  })
}

export async function removeOrganizationMember(membershipId: string) {
  await rpc('remove_organization_member', {
    p_membership_id: membershipId,
  })
}

export function buildOrganizationInviteUrl(token: string) {
  const base = new URL(import.meta.env.BASE_URL, window.location.origin)
  base.pathname = `${base.pathname.replace(/\/$/, '')}/organization/invite/${encodeURIComponent(token)}`
  base.search = ''
  return base.toString()
}
