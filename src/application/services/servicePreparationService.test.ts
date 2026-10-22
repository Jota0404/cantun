import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db/database'
import { servicePreparationRepository } from '../../db/repositories/servicePreparationRepository'
import { serviceRepository } from '../../db/repositories/serviceRepository'
import { teamMembershipRepository } from '../../db/repositories/teamRepository'
import type { AccessContext } from '../../domain/access/permissions'
import { getPreparationSummary, setPreparation, type PreparationRepositories } from './servicePreparationService'

const sync = vi.hoisted(() => ({ queueTargetUpsert: vi.fn(), queueTargetUpserts: vi.fn(async (_e: string, _p: unknown, _t: unknown, write: () => Promise<void>) => write()), queueTargetDeleteAtomic: vi.fn(async (_e: string, _i: string, _t: unknown, write: () => Promise<void>) => write()) }))
vi.mock('../../sync/syncService', () => sync)

const now = '2026-10-01T12:00:00Z'
const service = { id: 's1', organizationId: 'org-1', teamId: 't1', name: 'Culto', startsAt: now, status: 'draft' as const, createdByUserId: 'u1', createdAt: now, updatedAt: now }
const member = (userId: string, status: 'active' | 'inactive' = 'active') => ({ id: `m-${userId}`, teamId: 't1', userId, role: 'member' as const, status, createdAt: now, updatedAt: now })
const repos = (access: Partial<AccessContext>): PreparationRepositories => ({
  services: serviceRepository, preparations: servicePreparationRepository, memberships: teamMembershipRepository,
  access: async () => ({ organizationRole: 'member', teamRole: 'member', teamStatus: 'active', ...access }) as AccessContext,
  currentUserId: () => 'me', displayNames: async () => ({ me: 'Eu', ana: 'Ana' }),
})

describe('service preparation (RN-15…18)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await Promise.all([db.services.clear(), db.servicePreparations.clear(), db.teamMemberships.clear()])
    await db.services.put(service)
    await db.teamMemberships.bulkPut([member('me'), member('ana'), member('bob', 'inactive')])
  })

  it('marks and unmarks offline, queueing sync, and is idempotent', async () => {
    expect(await setPreparation('s1', true, repos({}))).toEqual({ success: true })
    await setPreparation('s1', true, repos({}))
    expect(sync.queueTargetUpserts).toHaveBeenCalledTimes(1)
    expect(await db.servicePreparations.get('s1:me')).toMatchObject({ serviceId: 's1', userId: 'me' })
    expect(await setPreparation('s1', false, repos({}))).toEqual({ success: true })
    expect(await db.servicePreparations.count()).toBe(0)
    expect(sync.queueTargetDeleteAtomic).toHaveBeenCalledWith('servicePreparations', 's1:me', expect.anything(), expect.any(Function))
  })

  it('rejects inactive members, non-members, final services and missing services', async () => {
    expect(await setPreparation('s1', true, repos({ teamStatus: 'inactive' }))).toMatchObject({ success: false })
    expect(await setPreparation('s1', true, repos({ teamRole: null, teamStatus: null }))).toMatchObject({ success: false })
    expect(await setPreparation('nope', true, repos({}))).toMatchObject({ success: false })
    await db.services.put({ ...service, status: 'completed' })
    expect(await setPreparation('s1', true, repos({}))).toMatchObject({ success: false })
    expect(await db.servicePreparations.count()).toBe(0)
  })

  it('a common member gets no team list, even with rows in Dexie', async () => {
    await db.servicePreparations.put({ id: 's1:ana', serviceId: 's1', userId: 'ana', preparedAt: now, updatedAt: now })
    expect(await getPreparationSummary('s1', repos({}))).toEqual({ success: true, summary: { canSeeTeam: false, preparedCount: 0, totalCount: 0, people: [] } })
  })

  it('leader sees active members with their state; admin too', async () => {
    await db.servicePreparations.put({ id: 's1:ana', serviceId: 's1', userId: 'ana', preparedAt: now, updatedAt: now })
    for (const access of [{ teamRole: 'leader' as const }, { organizationRole: 'admin' as const }]) {
      const result = await getPreparationSummary('s1', repos(access))
      expect(result).toEqual({ success: true, summary: { canSeeTeam: true, preparedCount: 1, totalCount: 2, people: [
        { userId: 'ana', name: 'Ana', prepared: true }, { userId: 'me', name: 'Eu', prepared: false },
      ] } })
    }
    expect(await getPreparationSummary('nope', repos({}))).toMatchObject({ success: false })
  })
})
