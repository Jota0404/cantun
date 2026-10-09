import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.hoisted(() => vi.fn())
const invites = vi.hoisted(() => vi.fn())
const currentUser = vi.hoisted(() => ({ value: { id: 'creator', email: 'c@example.com', emailVerified: true } as { id: string } | null }))
vi.mock('../../platform/rpc', () => ({ rpc }))
vi.mock('../../platform/auth', () => ({ getCurrentUser: () => currentUser.value }))
vi.mock('../organizations/organizationInviteService', () => ({ listOrganizationInvites: invites }))

import { SalmodiaDatabase } from '../../db/database'
import { TeamMembershipRepository } from '../../db/repositories/teamRepository'
import type { TeamMembership } from '../../domain/teams/teamMembership'
import { demoteToMember, listTeamMembers, promoteToLeader, setMemberFunctions, setMemberStatus, setMyDisplayName } from './teamMemberService'

const db = new SalmodiaDatabase()
const repository = new TeamMembershipRepository(db)
const now = '2026-10-01T00:00:00.000Z'
const membership: TeamMembership = { id: 'tm-1', teamId: 'team-1', userId: 'u-1', role: 'member', status: 'active', createdAt: now, updatedAt: now }

describe('team member use cases', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    await Promise.all([db.teamMemberships.clear(), db.targetSyncQueue.clear()])
    await db.teamMemberships.put(membership)
  })

  it('promotes and demotes through the RPC and updates the local membership without queueing', async () => {
    rpc.mockResolvedValue({ updated_at: '2026-10-02T00:00:00.000Z' })
    await expect(promoteToLeader('tm-1', repository)).resolves.toMatchObject({ success: true, membership: { role: 'leader' } })
    expect(rpc).toHaveBeenCalledWith('set_team_member_role', { p_membership_id: 'tm-1', p_role: 'leader' })
    expect((await db.teamMemberships.get('tm-1'))?.role).toBe('leader')

    await demoteToMember('tm-1', repository)
    expect((await db.teamMemberships.get('tm-1'))?.role).toBe('member')
    expect(await db.targetSyncQueue.count()).toBe(0)
  })

  it('keeps the local state and returns errors when the server denies', async () => {
    rpc.mockRejectedValueOnce(new Error('permission denied'))
    await expect(setMemberStatus({ membershipId: 'tm-1', status: 'inactive' }, repository)).resolves.toEqual({ success: false, errors: ['permission denied'] })
    expect((await db.teamMemberships.get('tm-1'))?.status).toBe('active')
  })

  it('validates input before calling the server', async () => {
    await expect(setMemberStatus({ membershipId: 'tm-1', status: 'pending_invite' as never }, repository)).resolves.toMatchObject({ success: false })
    await expect(promoteToLeader('missing', repository)).resolves.toEqual({ success: false, errors: ['Membro não encontrado.'] })
    await expect(setMyDisplayName('   ')).resolves.toMatchObject({ success: false })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('sets functions and the own display name through RPCs', async () => {
    rpc.mockResolvedValueOnce([{ musical_function: 'vocals' }, { musical_function: 'keys' }])
    await expect(setMemberFunctions({ teamId: 'team-1', userId: 'u-1', musicalFunctions: [' vocals', 'keys', 'vocals'] }))
      .resolves.toEqual({ success: true, musicalFunctions: ['vocals', 'keys'] })
    expect(rpc).toHaveBeenCalledWith('set_team_member_functions', { p_team_id: 'team-1', p_user_id: 'u-1', p_musical_functions: ['vocals', 'keys'] })

    rpc.mockResolvedValueOnce(null)
    await expect(setMyDisplayName('  Ana ')).resolves.toEqual({ success: true, displayName: 'Ana' })
    expect(rpc).toHaveBeenLastCalledWith('set_my_display_name', { p_display_name: 'Ana' })
  })

  it('lists members by display name (never e-mail) plus pending invites', async () => {
    rpc.mockResolvedValueOnce([{ user_id: 'u-1', display_name: 'Ana' }])
    invites.mockResolvedValueOnce([
      { id: 'inv-1', teamId: 'team-1', status: 'pending' },
      { id: 'inv-2', teamId: 'team-1', status: 'accepted' },
      { id: 'inv-3', teamId: 'team-2', status: 'pending' },
    ])
    const members = await listTeamMembers({ organizationId: 'org-1', teamId: 'team-1', includePendingInvites: true }, repository)
    expect(members).toEqual([
      { membershipId: 'tm-1', userId: 'u-1', displayName: 'Ana', role: 'member', displayStatus: 'active' },
      { inviteId: 'inv-1', displayName: 'Convite pendente', role: 'member', displayStatus: 'pending_invite' },
    ])

    rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    expect((await listTeamMembers({ organizationId: 'org-1', teamId: 'team-1' }, repository))[0].displayName).toBe('Ana')
  })
})
