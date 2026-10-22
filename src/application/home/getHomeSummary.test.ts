import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const access = vi.hoisted(() => vi.fn())
vi.mock('../../platform/auth', () => ({ getCurrentUser: () => ({ id: 'me', email: 'm@example.com', emailVerified: true, displayName: 'Eu' }) }))
vi.mock('../teams/teamMemberService', () => ({ listTeamMembers: vi.fn(), getMyAccessContext: access }))
vi.mock('../../sync/syncService', () => ({ queueTargetUpsert: vi.fn() }))

import { db } from '../../db/database'
import type { Service } from '../../domain/services/service'
import { getHomeSummary } from './getHomeSummary'

const now = '2026-10-01T00:00:00.000Z'
const svc = (id: string, startsAt: string, extra: Partial<Service> = {}): Service => ({ id, organizationId: 'o1', teamId: 't1', name: id, startsAt, status: 'ready', createdByUserId: 'u', createdAt: now, updatedAt: now, ...extra })
const assignment = (id: string, serviceId: string, status: string, userId = 'me') => ({ id, serviceId, positionId: `p-${serviceId}`, userId, musicalFunction: 'vocals', status: status as never, createdAt: now, updatedAt: now })

describe('getHomeSummary (RN-13)', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    access.mockResolvedValue({ organizationRole: 'member', teamRole: 'member', teamStatus: 'active' })
    await Promise.all([db.organizations.clear(), db.services.clear(), db.assignments.clear(), db.servicePositions.clear(), db.stageSessions.clear(), db.serviceItems.clear()])
  })

  it('signals onboarding when the user has no organization', async () => {
    expect(await getHomeSummary()).toEqual({ hasOrganization: false, pendingConfirmations: [], managedGaps: [] })
  })

  it('returns empty lists for an organization without B4 data', async () => {
    await db.organizations.put({ id: 'o1', name: 'Igreja', createdAt: now, updatedAt: now })
    expect(await getHomeSummary()).toEqual({ hasOrganization: true, nextService: undefined, pendingConfirmations: [], managedGaps: [], liveStage: undefined })
  })

  it('gathers next service, pending confirmations, managed gaps and the live stage', async () => {
    await db.organizations.put({ id: 'o1', name: 'Igreja', createdAt: now, updatedAt: now })
    await db.services.bulkPut([svc('near', '2099-02-01T12:00:00Z', { location: 'Templo' }), svc('far', '2099-03-01T12:00:00Z'), svc('past', '2020-01-01T12:00:00Z')])
    await db.assignments.bulkPut([
      assignment('a1', 'far', 'confirmed'), assignment('a2', 'near', 'invited'), assignment('a3', 'past', 'invited'),
      assignment('a4', 'near', 'invited', 'someone-else'),
    ])
    await db.servicePositions.put({ id: 'p-far', serviceId: 'far', musicalFunction: 'vocals', quantity: 1, createdAt: now, updatedAt: now })
    await db.servicePositions.put({ id: 'p-near', serviceId: 'near', musicalFunction: 'vocals', quantity: 2, createdAt: now, updatedAt: now })
    access.mockResolvedValue({ organizationRole: 'member', teamRole: 'leader', teamStatus: 'active' })
    await db.stageSessions.bulkPut([
      { id: 'live-1', serviceId: 'near', status: 'live', createdAt: now, updatedAt: now },
      { id: 'lobby-1', serviceId: 'far', status: 'lobby', createdAt: now, updatedAt: now },
    ])

    const summary = await getHomeSummary()

    expect(summary.hasOrganization).toBe(true)
    expect(summary.nextService).toMatchObject({ assignment: { id: 'a2', musicalFunction: 'vocals', status: 'invited' }, service: { id: 'near', location: 'Templo' } })
    expect(summary.pendingConfirmations.map((item) => item.assignment.id)).toEqual(['a2'])
    expect(summary.managedGaps.map((gap) => [gap.service.id, gap.missingTotal])).toEqual([['near', 2]])
    expect(summary.liveStage).toMatchObject({ stageSessionId: 'live-1', service: { id: 'near' } })
  })

  it('ignores live stages of other organizations and finished services', async () => {
    await db.organizations.put({ id: 'o1', name: 'Igreja', createdAt: now, updatedAt: now })
    await db.services.bulkPut([svc('other', '2099-02-01T12:00:00Z', { organizationId: 'o2' }), svc('done', '2099-02-01T12:00:00Z', { status: 'completed' })])
    await db.stageSessions.bulkPut([
      { id: 'l1', serviceId: 'other', status: 'live', createdAt: now, updatedAt: now },
      { id: 'l2', serviceId: 'done', status: 'live', createdAt: now, updatedAt: now },
    ])
    expect((await getHomeSummary()).liveStage).toBeUndefined()
  })

  it('shows no managed gaps to a plain member', async () => {
    await db.organizations.put({ id: 'o1', name: 'Igreja', createdAt: now, updatedAt: now })
    await db.services.put(svc('near', '2099-02-01T12:00:00Z'))
    await db.servicePositions.put({ id: 'p-near', serviceId: 'near', musicalFunction: 'vocals', quantity: 1, createdAt: now, updatedAt: now })
    expect((await getHomeSummary()).managedGaps).toEqual([])
  })
})
