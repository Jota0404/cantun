import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acceptBandInvite,
  buildBandInviteUrl,
  createBandInvite,
  getBandInvite,
  listBandInvites,
  removeBandMember,
  revokeBandInvite,
  updateBandMemberRole,
} from './bandInviteService'

const getContextMock = vi.fn()
const createInviteMock = vi.fn()
const getInviteMock = vi.fn()
const acceptInviteMock = vi.fn()
const listInvitesMock = vi.fn()
const revokeInviteMock = vi.fn()
const updateMemberRoleMock = vi.fn()
const removeMemberMock = vi.fn()

vi.mock('../organizations/legacyBandBridgeService', () => ({
  getLegacyBandOrganizationContext: (...args: unknown[]) => getContextMock(...args),
}))

vi.mock('../organizations/organizationInviteService', () => ({
  acceptOrganizationInvite: (...args: unknown[]) => acceptInviteMock(...args),
  createOrganizationInvite: (...args: unknown[]) => createInviteMock(...args),
  getOrganizationInvite: (...args: unknown[]) => getInviteMock(...args),
  listOrganizationInvites: (...args: unknown[]) => listInvitesMock(...args),
  revokeOrganizationInvite: (...args: unknown[]) => revokeInviteMock(...args),
  updateOrganizationMemberRole: (...args: unknown[]) => updateMemberRoleMock(...args),
  removeOrganizationMember: (...args: unknown[]) => removeMemberMock(...args),
}))

beforeEach(() => {
  vi.clearAllMocks()
  getContextMock.mockResolvedValue({ bandId: 'b1', organizationId: 'o1', teamId: 't1' })
})

describe('bandInviteService', () => {
  it('creates an organization invite through the migration bridge and returns the one-time token', async () => {
    createInviteMock.mockResolvedValue({
      id: 'i1',
      organizationId: 'o1',
      teamId: 't1',
      invitedByUserId: 'u1',
      role: 'member',
      createdAt: '2026-09-02T00:00:00Z',
      expiresAt: '2026-09-09T00:00:00Z',
      token: 'secret',
    })

    const result = await createBandInvite('b1', 'member')

    expect(createInviteMock).toHaveBeenCalledWith('o1', 't1', 'member', undefined)
    expect(result.token).toBe('secret')
    expect(result.bandId).toBe('b1')
  })

  it('uses target organization invite services for preview and acceptance', async () => {
    getInviteMock.mockResolvedValue({
      id: 'i1',
      organizationId: 'o1',
      teamId: 't1',
      invitedByUserId: 'u1',
      role: 'member',
      createdAt: '2026-09-02T00:00:00Z',
      expiresAt: '2026-09-09T00:00:00Z',
      organizationName: 'Banda',
      teamName: 'Equipe',
      status: 'pending',
    })
    acceptInviteMock.mockResolvedValue({
      organizationId: 'o1',
      organizationName: 'Banda',
      teamId: 't1',
      teamName: 'Equipe',
      role: 'member',
      organizationMembershipId: 'm1',
      teamMembershipId: 'tm1',
      alreadyOrganizationMember: false,
      alreadyTeamMember: false,
    })

    await expect(getBandInvite('secret')).resolves.toMatchObject({ bandId: 'b1', status: 'pending' })
    await expect(acceptBandInvite('secret')).resolves.toMatchObject({ bandId: 'b1', membershipId: 'm1' })
    expect(getInviteMock).toHaveBeenCalledWith('secret')
    expect(acceptInviteMock).toHaveBeenCalledWith('secret')
  })

  it('revokes invites and manages members through target organization APIs', async () => {
    revokeInviteMock.mockResolvedValue(undefined)
    updateMemberRoleMock.mockResolvedValue(undefined)
    removeMemberMock.mockResolvedValue(undefined)

    await revokeBandInvite('i1')
    await updateBandMemberRole('m1', 'editor')
    await removeBandMember('m1')

    expect(revokeInviteMock).toHaveBeenCalledWith('i1')
    expect(updateMemberRoleMock).toHaveBeenCalledWith('m1', 'admin')
    expect(removeMemberMock).toHaveBeenCalledWith('m1')
  })

  it('lists invite status without persisting invite data locally', async () => {
    listInvitesMock.mockResolvedValue([{
      id: 'i1',
      organizationId: 'o1',
      teamId: 't1',
      invitedByUserId: 'u1',
      role: 'member',
      createdAt: '2026-09-02T00:00:00Z',
      expiresAt: '2999-09-09T00:00:00Z',
      status: 'pending',
    }])

    await expect(listBandInvites('b1')).resolves.toMatchObject([{ id: 'i1', status: 'pending' }])
    expect(listInvitesMock).toHaveBeenCalledWith('o1')
  })

  it('builds an invite URL under the Vite base path', () => {
    expect(buildBandInviteUrl('secret')).toContain('/bands/invite/secret')
  })
})
