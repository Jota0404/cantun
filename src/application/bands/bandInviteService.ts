import type { BandInvite, BandInviteRole, BandInviteStatus } from '../../domain/bands/bandInvite'
import type { BandMemberRole } from '../../domain/bands/bandMember'
import { getLegacyBandOrganizationContext } from '../organizations/legacyBandBridgeService'
import {
  acceptOrganizationInvite,
  createOrganizationInvite,
  getOrganizationInvite,
  listOrganizationInvites,
  revokeOrganizationInvite,
  updateOrganizationMemberRole,
  removeOrganizationMember,
} from '../organizations/organizationInviteService'
import { supabase } from '../../lib/supabase'

export interface CreatedBandInvite extends BandInvite { token: string }
export interface BandInvitePreview extends BandInvite { bandName: string; status: BandInviteStatus }

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não está configurado.')
  return supabase
}

function mapInvite(row: Record<string, unknown>, bandId: string): BandInvite {
  return {
    id: row.id as string,
    bandId,
    invitedByUserId: row.invited_by_user_id as string,
    role: row.role === 'admin' ? 'editor' : row.role as BandInviteRole,
    inviteeEmail: (row.invitee_email as string | null) ?? undefined,
    createdAt: row.created_at as string,
    expiresAt: row.expires_at as string,
    acceptedAt: (row.accepted_at as string | null) ?? undefined,
    acceptedByUserId: (row.accepted_by_user_id as string | null) ?? undefined,
    revokedAt: (row.revoked_at as string | null) ?? undefined,
  }
}

export async function createBandInvite(bandId: string, role: BandInviteRole, inviteeEmail?: string): Promise<CreatedBandInvite> {
  const context = await getLegacyBandOrganizationContext(bandId)
  if (!context) throw new Error('Não foi possível localizar a organização da banda.')
  const created = await createOrganizationInvite(
    context.organizationId,
    context.teamId,
    role === 'editor' ? 'admin' : 'member',
    inviteeEmail,
  )
  return {
    ...mapInvite(created as unknown as Record<string, unknown>, bandId),
    token: created.token,
  }
}

export async function getBandInvite(token: string): Promise<BandInvitePreview | null> {
  const invite = await getOrganizationInvite(token)
  if (!invite) return null
  const context = await getLegacyBandOrganizationContext(invite.organizationId)
  if (!context) return null
  return {
    ...mapInvite(invite as unknown as Record<string, unknown>, context.bandId),
    bandName: invite.organizationName,
    status: invite.status,
  }
}

export async function acceptBandInvite(token: string) {
  const result = await acceptOrganizationInvite(token)
  const context = await getLegacyBandOrganizationContext(result.organizationId)
  if (!context) throw new Error('Organização aceita, mas a ponte da banda não foi encontrada.')
  return {
    bandId: context.bandId,
    bandName: result.organizationName,
    role: (result.role === 'admin' ? 'editor' : 'member') as BandInviteRole,
    membershipId: result.organizationMembershipId,
    alreadyMember: result.alreadyOrganizationMember,
  }
}

export async function listBandInvites(bandId: string): Promise<Array<BandInvite & { status: BandInviteStatus }>> {
  const context = await getLegacyBandOrganizationContext(bandId)
  if (!context) return []
  const invites = await listOrganizationInvites(context.organizationId)
  return invites.map((invite) => ({
    ...mapInvite(invite as unknown as Record<string, unknown>, bandId),
    status: invite.status,
  }))
}

export async function revokeBandInvite(inviteId: string) {
  await revokeOrganizationInvite(inviteId)
}

async function getOrganizationMembershipId(bandMemberId: string) {
  const { data, error } = await requireSupabase().rpc('get_band_member_organization_membership', {
    p_band_member_id: bandMemberId,
  })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('Não foi possível localizar a associação do membro.')
  return row.organization_membership_id as string
}

export async function updateBandMemberRole(memberId: string, role: Exclude<BandMemberRole, 'owner'>) {
  const membershipId = await getOrganizationMembershipId(memberId)
  await updateOrganizationMemberRole(membershipId, role === 'editor' ? 'admin' : 'member')
}

export async function removeBandMember(memberId: string) {
  const membershipId = await getOrganizationMembershipId(memberId)
  await removeOrganizationMember(membershipId)
}

export function buildBandInviteUrl(token: string) {
  const base = new URL(import.meta.env.BASE_URL, window.location.origin)
  base.pathname = `${base.pathname.replace(/\/$/, '')}/bands/invite/${encodeURIComponent(token)}`
  base.search = ''
  return base.toString()
}
