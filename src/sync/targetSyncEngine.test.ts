import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SalmodiaDatabase } from '../db/database'
import type { TargetSyncQueueItem } from './targetSyncEngine'
import { TargetSyncEngine } from './targetSyncEngine'
import { onRemoteDataApplied } from './remoteChanges'

const remote = vi.hoisted(() => ({ selectRows: vi.fn(), upsertRows: vi.fn(), updateRows: vi.fn(), deleteRows: vi.fn() }))
vi.mock('../platform/sync', () => remote)
vi.mock('../platform/rpc', () => ({ rpc: vi.fn() }))

const db = new SalmodiaDatabase()
const now = '2026-10-01T12:00:00Z'

describe('TargetSyncEngine', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    remote.selectRows.mockResolvedValue([])
    remote.upsertRows.mockResolvedValue({ count: 1 })
    await Promise.all([db.targetSyncQueue.clear(), db.stageSessions.clear(), db.teams.clear()])
  })

  it('drops queued Stage items instead of pushing them and keeps pushing the rest', async () => {
    const stageSession = { id: 'stage-1', serviceId: 'service-1', status: 'lobby', createdAt: now, updatedAt: now }
    // Simula itens deixados na fila por versões antigas (o tipo atual não aceita mais essas entidades).
    await db.targetSyncQueue.bulkAdd([
      { entity: 'stageSessions', entityId: 'stage-1', operation: 'upsert', payload: stageSession, updatedAt: now, attempts: 3 },
      { entity: 'stageSessionStates', entityId: 'stage-1', operation: 'delete', updatedAt: now, attempts: 0 },
      { entity: 'teams', entityId: 'team-1', operation: 'upsert', payload: { id: 'team-1', organizationId: 'org-1', name: 'Louvor', createdAt: now, updatedAt: now }, updatedAt: now, attempts: 0 },
    ] as unknown as TargetSyncQueueItem[])

    await new TargetSyncEngine(db).sync()

    expect(remote.upsertRows).toHaveBeenCalledTimes(1)
    expect(remote.upsertRows).toHaveBeenCalledWith('teams', [expect.objectContaining({ id: 'team-1' })])
    expect(remote.deleteRows).not.toHaveBeenCalled()
    expect(await db.targetSyncQueue.count()).toBe(0)
  })

  it('still pulls Stage sessions from the server', async () => {
    remote.selectRows.mockImplementation(async (table: string) => table === 'stage_sessions'
      ? [{ id: 'stage-1', service_id: 'service-1', md_user_id: null, status: 'live', created_at: now, started_at: now, ended_at: null, updated_at: now }]
      : [])

    const listener = vi.fn()
    const off = onRemoteDataApplied(listener)
    await new TargetSyncEngine(db).sync()
    off()

    expect(listener).toHaveBeenCalledTimes(1)
    expect(await db.stageSessions.get('stage-1')).toMatchObject({ status: 'live', serviceId: 'service-1' })
  })
})
