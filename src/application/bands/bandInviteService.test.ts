import { beforeEach, describe, expect, it, vi } from 'vitest'
import { acceptBandInvite, buildBandInviteUrl, createBandInvite, getBandInvite, listBandInvites, removeBandMember, revokeBandInvite, updateBandMemberRole } from './bandInviteService'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }))

type RpcMock = ReturnType<typeof vi.fn>

function mockedSupabase() {
  return supabase as unknown as { rpc: RpcMock; from: RpcMock }
}

beforeEach(() => vi.clearAllMocks())

describe('bandInviteService', () => {
  it('creates an invite through the server RPC and returns the one-time token', async () => {
    const rpc = mockedSupabase().rpc
    rpc.mockResolvedValue({ data: [{ id: 'i1', band_id: 'b1', invited_by_user_id: 'u1', role: 'member', invitee_email: null, created_at: '2026-09-02T00:00:00Z', expires_at: '2026-09-09T00:00:00Z', token: 'secret' }], error: null })
    const result = await createBandInvite('b1', 'member')
    expect(rpc).toHaveBeenCalledWith('create_band_invite', expect.objectContaining({ p_band_id: 'b1', p_role: 'member', p_invitee_email: null }))
    expect(result.token).toBe('secret')
  })

  it('uses the server RPC for preview and acceptance', async () => {
    const rpc = mockedSupabase().rpc
    rpc.mockResolvedValueOnce({ data: [{ id: 'i1', band_id: 'b1', band_name: 'Banda', role: 'member', invitee_email: null, created_at: '2026-09-02T00:00:00Z', expires_at: '2026-09-09T00:00:00Z', accepted_at: null, revoked_at: null, status: 'pending' }], error: null })
      .mockResolvedValueOnce({ data: [{ band_id: 'b1', band_name: 'Banda', role: 'member', membership_id: 'm1', already_member: false }], error: null })
    await expect(getBandInvite('secret')).resolves.toMatchObject({ bandId: 'b1', status: 'pending' })
    await expect(acceptBandInvite('secret')).resolves.toMatchObject({ bandId: 'b1', membershipId: 'm1' })
    expect(rpc).toHaveBeenNthCalledWith(1, 'get_band_invite', { p_token: 'secret' })
    expect(rpc).toHaveBeenNthCalledWith(2, 'accept_band_invite', { p_token: 'secret' })
  })

  it('revokes invites and manages members through authoritative RPCs', async () => {
    const rpc = mockedSupabase().rpc
    rpc.mockResolvedValue({ data: null, error: null })
    await revokeBandInvite('i1')
    await updateBandMemberRole('m1', 'editor')
    await removeBandMember('m1')
    expect(rpc).toHaveBeenNthCalledWith(1, 'revoke_band_invite', { p_invite_id: 'i1' })
    expect(rpc).toHaveBeenNthCalledWith(2, 'update_band_member_role', { p_member_id: 'm1', p_role: 'editor' })
    expect(rpc).toHaveBeenNthCalledWith(3, 'remove_band_member', { p_member_id: 'm1' })
  })

  it('lists invite status without persisting invite data locally', async () => {
    const from = mockedSupabase().from
    const order = vi.fn().mockResolvedValue({ data: [{ id: 'i1', band_id: 'b1', invited_by_user_id: 'u1', role: 'member', invitee_email: null, created_at: '2026-09-02T00:00:00Z', expires_at: '2999-09-09T00:00:00Z', accepted_at: null, accepted_by_user_id: null, revoked_at: null }], error: null })
    const eq = vi.fn().mockReturnValue({ order })
    const select = vi.fn().mockReturnValue({ eq })
    from.mockReturnValue({ select })
    await expect(listBandInvites('b1')).resolves.toMatchObject([{ id: 'i1', status: 'pending' }])
    expect(from).toHaveBeenCalledWith('band_invites')
  })

  it('builds an invite URL under the Vite base path', () => {
    expect(buildBandInviteUrl('secret')).toContain('/bands/invite?token=secret')
  })
})
