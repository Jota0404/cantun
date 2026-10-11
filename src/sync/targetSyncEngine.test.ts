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

describe('TargetSyncEngine team memberships (VS-01)', () => {
  const team = { id: 'team-1', organizationId: 'org-1', name: 'Louvor', createdAt: now, updatedAt: now }
  const membershipRow = (overrides: Record<string, unknown> = {}) => ({ id: 'tm-server', team_id: 'team-1', user_id: 'u-1', role: 'leader', status: 'active', created_at: now, updated_at: now, ...overrides })

  beforeEach(async () => {
    vi.resetAllMocks()
    remote.selectRows.mockResolvedValue([])
    remote.upsertRows.mockResolvedValue({ count: 1 })
    await Promise.all([db.targetSyncQueue.clear(), db.teamMemberships.clear(), db.teams.clear()])
  })

  it('pushes team memberships without role and status', async () => {
    await db.targetSyncQueue.add({ entity: 'teamMemberships', entityId: 'tm-1', operation: 'upsert', payload: { id: 'tm-1', teamId: 'team-1', userId: 'u-2', role: 'leader', status: 'inactive', createdAt: now, updatedAt: now }, updatedAt: now, attempts: 0 } as TargetSyncQueueItem)
    await new TargetSyncEngine(db).sync()
    const [, rows] = remote.upsertRows.mock.calls[0]
    expect(rows[0]).not.toHaveProperty('role')
    expect(rows[0]).not.toHaveProperty('status')
  })

  it('pull overwrites role and status even when the local copy is newer (no LWW)', async () => {
    await db.teamMemberships.put({ id: 'tm-server', teamId: 'team-1', userId: 'u-1', role: 'member', status: 'active', createdAt: now, updatedAt: '2030-01-01T00:00:00Z' })
    remote.selectRows.mockImplementation(async (table: string) => table === 'team_memberships' ? [membershipRow({ status: 'inactive' })] : [])
    await new TargetSyncEngine(db).sync()
    expect(await db.teamMemberships.get('tm-server')).toMatchObject({ role: 'leader', status: 'inactive', updatedAt: '2030-01-01T00:00:00Z' })
  })

  it('replaces the optimistic creator membership by [teamId+userId]', async () => {
    await db.teams.put(team)
    await db.teamMemberships.put({ id: 'tm-local', teamId: 'team-1', userId: 'u-1', role: 'leader', status: 'active', createdAt: now, updatedAt: now })
    remote.selectRows.mockImplementation(async (table: string) => table === 'team_memberships' ? [membershipRow()] : [])
    await new TargetSyncEngine(db).sync()
    expect((await db.teamMemberships.toArray()).map((m) => m.id)).toEqual(['tm-server'])
  })
})

describe('TargetSyncEngine services (VS-02)', () => {
  const service = { id: 'svc-1', organizationId: 'org-1', teamId: 'team-1', name: 'Culto', startsAt: now, status: 'ready', createdByUserId: 'u', createdAt: now, updatedAt: now }
  const item = (id: string, position: number, serviceId = 'svc-1') => ({ id, serviceId, type: id === 'i1' ? 'song' : 'prayer', songId: id === 'i1' ? 'song-1' : undefined, title: id === 'i1' ? undefined : 'Oração', position, updatedAt: now })

  beforeEach(async () => {
    vi.resetAllMocks()
    remote.selectRows.mockResolvedValue([])
    remote.upsertRows.mockResolvedValue({ count: 1 })
    await Promise.all([db.targetSyncQueue.clear(), db.services.clear(), db.serviceItems.clear()])
  })

  it('pushes services without status and the items of one service in a single batch', async () => {
    await db.targetSyncQueue.bulkAdd([
      { entity: 'services', entityId: 'svc-1', operation: 'upsert', payload: service, updatedAt: now, attempts: 0 },
      { entity: 'serviceItems', entityId: 'i1', operation: 'upsert', payload: item('i1', 1), updatedAt: now, attempts: 0 },
      { entity: 'serviceItems', entityId: 'x1', operation: 'upsert', payload: item('x1', 0, 'svc-2'), updatedAt: now, attempts: 0 },
      { entity: 'serviceItems', entityId: 'i2', operation: 'upsert', payload: item('i2', 0), updatedAt: now, attempts: 0 },
    ] as unknown as TargetSyncQueueItem[])
    await new TargetSyncEngine(db).sync()

    const calls = remote.upsertRows.mock.calls
    expect(calls[0][0]).toBe('services')
    expect(calls[0][1][0]).not.toHaveProperty('status')
    expect(calls[0][1][0]).toMatchObject({ team_id: 'team-1' })
    expect(calls[1]).toEqual(['service_items', [
      expect.objectContaining({ id: 'i1', type: 'song', song_id: 'song-1', title: null, position: 1 }),
      expect.objectContaining({ id: 'i2', type: 'prayer', song_id: null, title: 'Oração', position: 0 }),
    ]])
    expect(calls[2][1].map((row: { id: string }) => row.id)).toEqual(['x1'])
    expect(await db.targetSyncQueue.count()).toBe(0)
  })

  it('pull overwrites status without LWW and maps the new item fields', async () => {
    await db.services.put({ ...service, status: 'draft', name: 'Local', updatedAt: '2030-01-01T00:00:00Z' } as never)
    remote.selectRows.mockImplementation(async (table: string) => {
      if (table === 'services') return [{ id: 'svc-1', organization_id: 'org-1', team_id: 'team-1', name: 'Remoto', starts_at: now, location: null, notes: null, status: 'in_progress', created_by_user_id: 'u', created_at: now, updated_at: now }]
      if (table === 'service_items') return [{ id: 'i9', service_id: 'svc-1', type: 'announcement', song_id: null, title: 'Avisos', notes: null, duration_minutes: 5, position: 0, repertoire_id: null, updated_at: now }]
      return []
    })
    await new TargetSyncEngine(db).sync()
    expect(await db.services.get('svc-1')).toMatchObject({ status: 'in_progress', name: 'Local' })
    expect(await db.serviceItems.get('i9')).toMatchObject({ type: 'announcement', title: 'Avisos', durationMinutes: 5, songId: undefined })
  })
})
