import type { BandInvite, BandInviteRole, BandInviteStatus } from '../../domain/bands/bandInvite'
import type { BandMemberRole } from '../../domain/bands/bandMember'
import { supabase } from '../../lib/supabase'

export interface CreatedBandInvite extends BandInvite { token: string }
export interface BandInvitePreview extends BandInvite { bandName: string; status: BandInviteStatus }

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não está configurado.')
  return supabase
}

function mapInvite(row: Record<string, unknown>): BandInvite {
  return {
    id: row.id as string,
    bandId: row.band_id as string,
    invitedByUserId: row.invited_by_user_id as string,
    role: row.role as BandInviteRole,
    inviteeEmail: (row.invitee_email as string | null) ?? undefined,
    createdAt: row.created_at as string,
    expiresAt: row.expires_at as string,
    acceptedAt: (row.accepted_at as string | null) ?? undefined,
    acceptedByUserId: (row.accepted_by_user_id as string | null) ?? undefined,
    revokedAt: (row.revoked_at as string | null) ?? undefined,
  }
}

export async function createBandInvite(bandId: string, role: BandInviteRole, inviteeEmail?: string): Promise<CreatedBandInvite> {
  const { data, error } = await requireSupabase().rpc('create_band_invite', { p_band_id: bandId, p_role: role, p_invitee_email: inviteeEmail?.trim() || null, p_expires_in_hours: 168 })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('Convite não foi criado.')
  return { ...mapInvite(row), token: row.token as string }
}

export async function getBandInvite(token: string): Promise<BandInvitePreview | null> {
  const { data, error } = await requireSupabase().rpc('get_band_invite', { p_token: token })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return null
  return { ...mapInvite(row), bandName: row.band_name as string, status: row.status as BandInviteStatus }
}

export async function acceptBandInvite(token: string) {
  const { data, error } = await requireSupabase().rpc('accept_band_invite', { p_token: token })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('O convite não pôde ser aceito.')
  return { bandId: row.band_id as string, bandName: row.band_name as string, role: row.role as BandInviteRole, membershipId: row.membership_id as string, alreadyMember: Boolean(row.already_member) }
}

export async function listBandInvites(bandId: string): Promise<Array<BandInvite & { status: BandInviteStatus }>> {
  const { data, error } = await requireSupabase().from('band_invites').select('*').eq('band_id', bandId).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row) => ({ ...mapInvite(row), status: row.revoked_at ? 'revoked' : row.accepted_at ? 'accepted' : new Date(row.expires_at).getTime() <= Date.now() ? 'expired' : 'pending' }))
}

export async function revokeBandInvite(inviteId: string) {
  const { error } = await requireSupabase().rpc('revoke_band_invite', { p_invite_id: inviteId })
  if (error) throw error
}

export async function updateBandMemberRole(memberId: string, role: Exclude<BandMemberRole, 'owner'>) {
  const { error } = await requireSupabase().rpc('update_band_member_role', { p_member_id: memberId, p_role: role })
  if (error) throw error
}

export async function removeBandMember(memberId: string) {
  const { error } = await requireSupabase().rpc('remove_band_member', { p_member_id: memberId })
  if (error) throw error
}

export function buildBandInviteUrl(token: string) {
  const base = new URL(import.meta.env.BASE_URL, window.location.origin)
  base.pathname = `${base.pathname.replace(/\/$/, '')}/bands/invite`
  base.search = new URLSearchParams({ token }).toString()
  return base.toString()
}
