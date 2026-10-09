import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../platform/auth', () => ({ getCurrentUser: () => ({ id: 'creator', email: 'c@example.com', emailVerified: true }) }))
vi.mock('../../platform/http', () => ({ isPlatformConfigured: true }))
vi.mock('../../platform/rpc', () => ({ rpc: vi.fn() }))
vi.mock('../../platform/sync', () => ({ selectRows: vi.fn(async () => []), upsertRows: vi.fn(), updateRows: vi.fn(), deleteRows: vi.fn() }))

import { db } from '../../db/database'
import { createTeam } from './teamService'

describe('createTeam', () => {
  it('stores an optimistic local leader membership that is never queued (RN-03)', async () => {
    const team = await createTeam('org-1', ' Louvor ', '00000000-0000-4000-8000-000000000002')
    const memberships = await db.teamMemberships.where('teamId').equals(team.id).toArray()
    expect(memberships).toEqual([expect.objectContaining({ userId: 'creator', role: 'leader', status: 'active' })])
    const queued = await db.targetSyncQueue.toArray()
    expect(queued.map((item) => item.entity)).not.toContain('teamMemberships')
  })
})
