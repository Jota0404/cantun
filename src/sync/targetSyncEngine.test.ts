import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SalmodiaDatabase } from '../db/database'
import type { TargetSyncQueueItem } from './targetSyncEngine'
import { TargetSyncEngine } from './targetSyncEngine'
import { onRemoteDataApplied } from './remoteChanges'
import { ApiError } from '../platform/http'

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

  it('pushes and pulls the item key (B6 / RN-06)', async () => {
    await db.targetSyncQueue.add({ entity: 'serviceItems', entityId: 'i1', operation: 'upsert', payload: { ...item('i1', 0), key: 'A' }, updatedAt: now, attempts: 0 } as TargetSyncQueueItem)
    await new TargetSyncEngine(db).sync()
    expect(remote.upsertRows.mock.calls[0][1][0]).toMatchObject({ key: 'A' })

    remote.selectRows.mockImplementation(async (table: string) => table === 'service_items'
      ? [{ id: 'i1', service_id: 'svc-1', type: 'song', song_id: 'song-1', position: 0, key: 'Bb', updated_at: now }, { id: 'i2', service_id: 'svc-1', type: 'song', song_id: 'song-2', position: 1, key: null, updated_at: now }]
      : table === 'services' ? [{ ...service, id: 'svc-1', organization_id: 'org-1', team_id: 'team-1', starts_at: now, created_by_user_id: 'u', created_at: now, updated_at: now }] : [])
    await new TargetSyncEngine(db).sync()
    expect((await db.serviceItems.get('i1'))?.key).toBe('Bb')
    expect((await db.serviceItems.get('i2'))?.key).toBeUndefined()
  })

  it('pushes ref_item_id, sends the target before its reprise and pulls it back (RN-10)', async () => {
    await db.targetSyncQueue.bulkAdd([
      { entity: 'serviceItems', entityId: 'r1', operation: 'upsert', payload: { ...item('r1', 1), type: 'reprise', songId: undefined, title: 'Reprise: a', refItemId: 'i1' }, updatedAt: now, attempts: 0 },
      { entity: 'serviceItems', entityId: 'i1', operation: 'upsert', payload: item('i1', 0), updatedAt: now, attempts: 0 },
    ] as unknown as TargetSyncQueueItem[])
    await new TargetSyncEngine(db).sync()
    expect(remote.upsertRows.mock.calls[0][1].map((row: { id: string; ref_item_id: string | null }) => [row.id, row.ref_item_id])).toEqual([['i1', null], ['r1', 'i1']])

    remote.selectRows.mockImplementation(async (table: string) => table === 'service_items'
      ? [{ id: 'r1', service_id: 'svc-1', type: 'reprise', song_id: null, title: 'Reprise: a', ref_item_id: 'i1', position: 1, updated_at: now }]
      : [])
    await new TargetSyncEngine(db).sync()
    expect(await db.serviceItems.get('r1')).toMatchObject({ type: 'reprise', refItemId: 'i1' })
  })

  it('drops an orphan reprise (target deleted elsewhere) so it does not poison the batch', async () => {
    await db.serviceItems.bulkPut([item('i2', 0), { ...item('r1', 1), type: 'reprise' as const, songId: undefined, title: 'Reprise: a', refItemId: 'gone' }] as never)
    await db.targetSyncQueue.bulkAdd([
      { entity: 'serviceItems', entityId: 'r1', operation: 'upsert', payload: { ...item('r1', 1), type: 'reprise', songId: undefined, title: 'Reprise: a', refItemId: 'gone' }, updatedAt: now, attempts: 0 },
      { entity: 'serviceItems', entityId: 'i2', operation: 'upsert', payload: item('i2', 0), updatedAt: now, attempts: 0 },
    ] as unknown as TargetSyncQueueItem[])
    await new TargetSyncEngine(db).sync()
    expect(remote.upsertRows.mock.calls[0][1].map((row: { id: string }) => row.id)).toEqual(['i2'])
    expect(await db.serviceItems.get('r1')).toBeUndefined()
    expect(await db.targetSyncQueue.count()).toBe(0)
  })

  it('does not retry a rejected item key (403, 409, 400)', async () => {
    for (const status of [403, 409, 400]) {
      await db.targetSyncQueue.clear()
      remote.upsertRows.mockRejectedValue(new ApiError(status, 'service item key must have the same mode as the song original key'))
      await db.targetSyncQueue.add({ entity: 'serviceItems', entityId: 'i1', operation: 'upsert', payload: { ...item('i1', 0), key: 'Am' }, updatedAt: now, attempts: 0 } as TargetSyncQueueItem)
      await new TargetSyncEngine(db).sync()
      expect((await db.targetSyncQueue.toArray())[0]).toMatchObject({ status: 'failed' })
    }
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

describe('TargetSyncEngine scheduling (VS-03)', () => {
  const position = { id: 'p1', serviceId: 'svc-1', musicalFunction: 'vocals', quantity: 2, notes: 'coro', createdAt: now, updatedAt: now }
  const availability = { id: 'm1', userId: 'u', organizationId: 'org-1', date: '2026-10-11', status: 'tentative', note: 'talvez', createdAt: now, updatedAt: now }

  beforeEach(async () => {
    vi.resetAllMocks()
    remote.selectRows.mockResolvedValue([])
    remote.upsertRows.mockResolvedValue({ count: 1 })
    await Promise.all([db.targetSyncQueue.clear(), db.servicePositions.clear(), db.memberAvailability.clear(), db.assignments.clear()])
  })

  it('pushes positions and availability (LWW) and never pushes assignments', async () => {
    await db.targetSyncQueue.bulkAdd([
      { entity: 'servicePositions', entityId: 'p1', operation: 'upsert', payload: position, updatedAt: now, attempts: 0 },
      { entity: 'memberAvailability', entityId: 'm1', operation: 'upsert', payload: availability, updatedAt: now, attempts: 0 },
      { entity: 'assignments', entityId: 'a1', operation: 'upsert', payload: { id: 'a1' }, updatedAt: now, attempts: 0 },
      { entity: 'assignments', entityId: 'a2', operation: 'delete', updatedAt: now, attempts: 0 },
    ] as unknown as TargetSyncQueueItem[])
    await new TargetSyncEngine(db).sync()

    expect(remote.upsertRows.mock.calls.map(([table]) => table)).toEqual(['service_positions', 'member_availability'])
    expect(remote.upsertRows.mock.calls[0][1][0]).toMatchObject({ service_id: 'svc-1', musical_function: 'vocals', quantity: 2, notes: 'coro' })
    expect(remote.upsertRows.mock.calls[1][1][0]).toMatchObject({ user_id: 'u', organization_id: 'org-1', date: '2026-10-11', status: 'tentative', note: 'talvez' })
    expect(remote.deleteRows).not.toHaveBeenCalled()
    expect(await db.targetSyncQueue.count()).toBe(0)
  })

  it('pull overwrites assignments without LWW and maps positions and availability', async () => {
    await db.assignments.put({ id: 'a1', serviceId: 'svc-1', positionId: 'p1', userId: 'u', musicalFunction: 'vocals', status: 'invited', createdAt: now, updatedAt: '2030-01-01T00:00:00Z' })
    remote.selectRows.mockImplementation(async (table: string) => {
      if (table === 'assignments') return [{ id: 'a1', service_id: 'svc-1', position_id: 'p1', user_id: 'u', musical_function: 'vocals', status: 'confirmed', responded_at: now, replaced_assignment_id: null, invite_sent_at: now, created_at: now, updated_at: now }]
      if (table === 'service_positions') return [{ id: 'p1', service_id: 'svc-1', musical_function: 'vocals', quantity: 2, notes: null, created_at: now, updated_at: now }]
      if (table === 'member_availability') return [{ id: 'm1', user_id: 'u', organization_id: 'org-1', date: '2026-10-11T00:00:00.000Z', status: 'unavailable', note: null, created_at: now, updated_at: now }]
      return []
    })
    await new TargetSyncEngine(db).sync()
    expect(await db.assignments.get('a1')).toMatchObject({ status: 'confirmed', respondedAt: now, inviteSentAt: now })
    expect(await db.servicePositions.get('p1')).toMatchObject({ quantity: 2, notes: undefined })
    expect(await db.memberAvailability.get('m1')).toMatchObject({ date: '2026-10-11', status: 'unavailable' })
  })

  it('on 409 (unique by content from another device) drops the queue item and the orphan record', async () => {
    const { ApiError } = await import('../platform/http')
    await db.servicePositions.put(position)
    await db.memberAvailability.put(availability as never)
    await db.targetSyncQueue.bulkAdd([
      { entity: 'servicePositions', entityId: 'p1', operation: 'upsert', payload: position, updatedAt: now, attempts: 0 },
      { entity: 'memberAvailability', entityId: 'm1', operation: 'upsert', payload: availability, updatedAt: now, attempts: 0 },
    ] as unknown as TargetSyncQueueItem[])
    remote.upsertRows.mockRejectedValue(new ApiError(409, 'conflito'))
    await new TargetSyncEngine(db).sync()
    expect(await db.targetSyncQueue.count()).toBe(0)
    expect(await db.servicePositions.get('p1')).toBeUndefined()
    expect(await db.memberAvailability.get('m1')).toBeUndefined()
  })

  it('keeps retrying on 409 for other entities and on non-409 errors', async () => {
    const { ApiError } = await import('../platform/http')
    await db.targetSyncQueue.bulkAdd([
      { entity: 'servicePositions', entityId: 'p1', operation: 'upsert', payload: position, updatedAt: now, attempts: 0 },
      { entity: 'teams', entityId: 't1', operation: 'upsert', payload: { id: 't1', organizationId: 'o', name: 'T', createdAt: now, updatedAt: now }, updatedAt: now, attempts: 0 },
    ] as unknown as TargetSyncQueueItem[])
    remote.upsertRows.mockRejectedValueOnce(new ApiError(409, 'conflito')).mockRejectedValueOnce(new ApiError(500, 'erro'))
    await new TargetSyncEngine(db).sync()
    expect((await db.targetSyncQueue.toArray()).map((i) => [i.entity, i.attempts])).toEqual([['servicePositions', 1], ['teams', 1]])
  })
})

describe('TargetSyncEngine reliability (FIX-01 B)', () => {
  const item = (id: string, repertoireId: string, position: number) => ({ id, repertoireId, songId: `song-${id}`, position, updatedAt: now })
  const queueItems = (engine: TargetSyncEngine, ...items: ReturnType<typeof item>[]) =>
    db.targetSyncQueue.bulkAdd(items.map((payload) => ({ entity: 'repertoireItems', entityId: payload.id, operation: 'upsert', payload, updatedAt: now, attempts: 0 }) as TargetSyncQueueItem)).then(() => engine)

  beforeEach(async () => {
    vi.resetAllMocks()
    remote.selectRows.mockResolvedValue([])
    remote.upsertRows.mockResolvedValue({ count: 1 })
    await Promise.all([db.targetSyncQueue.clear(), db.repertoireItems.clear()])
  })

  it('sends the items of one repertoire in a single request', async () => {
    const engine = await queueItems(new TargetSyncEngine(db), item('a', 'rep-1', 1), item('b', 'rep-1', 0), item('c', 'rep-2', 0))
    await engine.sync()

    const calls = remote.upsertRows.mock.calls.filter(([table]) => table === 'repertoire_items')
    expect(calls).toHaveLength(2)
    expect(calls[0][1]).toHaveLength(2)
    expect(await db.targetSyncQueue.count()).toBe(0)
  })

  it('stops retrying a permanent 403, counts it and keeps retrying network errors', async () => {
    remote.upsertRows.mockRejectedValue(new ApiError(403, 'forbidden'))
    const engine = await queueItems(new TargetSyncEngine(db), item('a', 'rep-1', 0))
    await engine.sync()
    expect(await engine.getStatus()).toEqual({ pending: 0, failed: [{ id: expect.any(Number), entity: 'repertoireItems', reason: 'forbidden' }] })

    remote.upsertRows.mockClear()
    await engine.sync()
    expect(remote.upsertRows).not.toHaveBeenCalled()

    await db.targetSyncQueue.clear()
    remote.upsertRows.mockRejectedValue(new ApiError(503, 'unavailable'))
    await queueItems(engine, item('b', 'rep-1', 0))
    await engine.sync()
    expect(await engine.getStatus()).toEqual({ pending: 1, failed: [] })
    expect((await db.targetSyncQueue.toArray())[0]).toMatchObject({ attempts: 1 })
  })

  it('treats 429 as transient', async () => {
    remote.upsertRows.mockRejectedValue(new ApiError(429, 'slow down'))
    const engine = await queueItems(new TargetSyncEngine(db), item('a', 'rep-1', 0))
    await engine.sync()
    expect((await engine.getStatus()).failed).toEqual([])
  })

  it('discards rejected changes locally and leaves the rest of the queue alone', async () => {
    await db.repertoireItems.bulkAdd([item('a', 'rep-1', 0), item('b', 'rep-1', 1)])
    await db.targetSyncQueue.bulkAdd([
      { entity: 'repertoireItems', entityId: 'a', operation: 'upsert', payload: item('a', 'rep-1', 0), updatedAt: now, attempts: 1, status: 'failed', lastError: 'forbidden' },
      { entity: 'repertoireItems', entityId: 'b', operation: 'upsert', payload: item('b', 'rep-1', 1), updatedAt: now, attempts: 0 },
    ] as TargetSyncQueueItem[])
    const engine = new TargetSyncEngine(db)

    await engine.discardFailed()

    expect(await db.repertoireItems.get('a')).toBeUndefined()
    expect(await db.repertoireItems.get('b')).toBeDefined()
    expect((await engine.getStatus()).failed).toEqual([])
  })
})

describe('TargetSyncEngine personal repertoires (FIX-01 C)', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    remote.selectRows.mockResolvedValue([])
    remote.upsertRows.mockResolvedValue({ count: 1 })
    await Promise.all([db.targetSyncQueue.clear(), db.repertoires.clear()])
  })

  it('pushes a personal repertoire with a null organization and pulls it back without one', async () => {
    const value = { id: 'p1', name: 'Meu', createdByUserId: 'u1', version: 1, createdAt: now, updatedAt: now }
    await db.targetSyncQueue.add({ entity: 'repertoires', entityId: 'p1', operation: 'upsert', payload: value, updatedAt: now, attempts: 0 } as TargetSyncQueueItem)
    remote.selectRows.mockImplementation(async (table: string) => table === 'repertoires'
      ? [{ id: 'p2', organization_id: null, name: 'Outro aparelho', created_by_user_id: 'u1', version: 1, created_at: now, updated_at: now }]
      : [])

    await new TargetSyncEngine(db).sync()

    expect(remote.upsertRows).toHaveBeenCalledWith('repertoires', [expect.objectContaining({ id: 'p1', organization_id: null, created_by_user_id: 'u1' })])
    const pulled = await db.repertoires.get('p2')
    expect(pulled?.name).toBe('Outro aparelho')
    expect(pulled?.organizationId).toBeUndefined()
  })
})

describe('TargetSyncEngine service preparations (B6 / RN-15…18)', () => {
  const prep = { id: 's1:u1', serviceId: 's1', userId: 'u1', preparedAt: now, updatedAt: now }
  beforeEach(async () => {
    vi.resetAllMocks()
    remote.selectRows.mockResolvedValue([])
    remote.upsertRows.mockResolvedValue({ count: 1 })
    remote.deleteRows.mockResolvedValue({ count: 1 })
    await Promise.all([db.targetSyncQueue.clear(), db.servicePreparations.clear()])
  })

  it('pushes a mark and an unmark with the composite key', async () => {
    const engine = new TargetSyncEngine(db)
    await db.targetSyncQueue.add({ entity: 'servicePreparations', entityId: prep.id, operation: 'upsert', payload: prep, updatedAt: now, attempts: 0 })
    await engine.sync()
    expect(remote.upsertRows).toHaveBeenCalledWith('service_preparations', [{ service_id: 's1', user_id: 'u1', prepared_at: now, updated_at: now }])
    await db.targetSyncQueue.add({ entity: 'servicePreparations', entityId: prep.id, operation: 'delete', updatedAt: now, attempts: 0 })
    await engine.sync()
    expect(remote.deleteRows).toHaveBeenCalledWith('service_preparations', { service_id: 's1', user_id: 'u1' })
    expect(await db.targetSyncQueue.count()).toBe(0)
  })

  it('does not retry a rejected mark (403/409)', async () => {
    for (const status of [403, 409]) {
      await db.targetSyncQueue.clear()
      remote.upsertRows.mockClear().mockRejectedValue(new ApiError(status, 'recusado'))
      const engine = new TargetSyncEngine(db)
      await db.targetSyncQueue.add({ entity: 'servicePreparations', entityId: prep.id, operation: 'upsert', payload: prep, updatedAt: now, attempts: 0 })
      await engine.sync()
      remote.upsertRows.mockClear()
      await engine.sync()
      expect(remote.upsertRows).not.toHaveBeenCalled()
      expect((await engine.getStatus()).failed).toHaveLength(1)
    }
  })

  it('pulls what the server returns and drops local rows that vanished remotely', async () => {
    await db.servicePreparations.put({ ...prep, id: 's1:u2', userId: 'u2' })
    remote.selectRows.mockImplementation(async (table: string) => table === 'service_preparations'
      ? [{ service_id: 's1', user_id: 'u1', prepared_at: now, updated_at: now }] : [])
    await new TargetSyncEngine(db).sync()
    expect((await db.servicePreparations.toArray()).map((p) => p.id)).toEqual(['s1:u1'])
  })
  it('pull keeps a local row that is still queued and atomic put/delete enqueue together', async () => {
    const engine = new TargetSyncEngine(db)
    await db.servicePreparations.put(prep)
    await db.targetSyncQueue.add({ entity: 'servicePreparations', entityId: prep.id, operation: 'upsert', payload: prep, updatedAt: now, attempts: 0 })
    remote.upsertRows.mockRejectedValue(new ApiError(503, 'off'))
    await engine.sync()
    expect((await db.servicePreparations.toArray()).map((p) => p.id)).toEqual(['s1:u1'])
    await db.targetSyncQueue.clear()
    await engine.queueDeleteAtomic('servicePreparations', prep.id, [db.servicePreparations], async () => { await db.servicePreparations.delete(prep.id) })
    expect(await db.servicePreparations.count()).toBe(0)
    expect((await db.targetSyncQueue.toArray())[0]).toMatchObject({ operation: 'delete', entityId: prep.id })
  })
})

describe('TargetSyncEngine rehearsals (RN-19…21)', () => {
  const reh = { id: 'r1', organizationId: 'o1', serviceId: 's1', startsAt: now, location: 'Sala', createdAt: now, updatedAt: now }
  const song = { rehearsalId: 'r1', serviceItemId: 'i1' }
  beforeEach(async () => {
    vi.resetAllMocks()
    remote.selectRows.mockResolvedValue([])
    remote.upsertRows.mockResolvedValue({ count: 1 })
    remote.deleteRows.mockResolvedValue({ count: 1 })
    await Promise.all([db.targetSyncQueue.clear(), db.rehearsals.clear(), db.rehearsalSongs.clear()])
  })

  it('pushes upserts and deletes (ensaio, then foco with composite key)', async () => {
    const engine = new TargetSyncEngine(db)
    await db.targetSyncQueue.bulkAdd([
      { entity: 'rehearsals', entityId: 'r1', operation: 'upsert', payload: reh, updatedAt: now, attempts: 0 },
      { entity: 'rehearsalSongs', entityId: 'r1:i1', operation: 'upsert', payload: song, updatedAt: now, attempts: 0 },
      { entity: 'rehearsalSongs', entityId: 'r1:i1', operation: 'delete', updatedAt: now, attempts: 0 },
    ])
    await engine.sync()
    expect(remote.upsertRows).toHaveBeenCalledWith('rehearsals', [{ id: 'r1', organization_id: 'o1', service_id: 's1', starts_at: now, location: 'Sala', notes: null, created_at: now, updated_at: now }])
    expect(remote.deleteRows).toHaveBeenCalledWith('rehearsal_songs', { rehearsal_id: 'r1', service_item_id: 'i1' })
    expect(await db.targetSyncQueue.count()).toBe(0)
  })

  it('does not retry 403/409', async () => {
    remote.upsertRows.mockRejectedValue(new ApiError(403, 'recusado'))
    const engine = new TargetSyncEngine(db)
    await db.targetSyncQueue.add({ entity: 'rehearsals', entityId: 'r1', operation: 'upsert', payload: reh, updatedAt: now, attempts: 0 })
    await engine.sync()
    remote.upsertRows.mockClear()
    await engine.sync()
    expect(remote.upsertRows).not.toHaveBeenCalled()
    expect((await engine.getStatus()).failed).toHaveLength(1)
  })

  it('pulls both tables, drops what vanished remotely but keeps what is queued', async () => {
    await db.rehearsals.bulkPut([{ ...reh, id: 'gone' }, { ...reh, id: 'queued' }])
    await db.rehearsalSongs.put({ rehearsalId: 'gone', serviceItemId: 'x' })
    await db.targetSyncQueue.add({ entity: 'rehearsals', entityId: 'queued', operation: 'upsert', payload: { ...reh, id: 'queued' }, updatedAt: now, attempts: 0, status: 'failed' })
    remote.selectRows.mockImplementation(async (table: string) => table === 'rehearsals'
      ? [{ id: 'r1', organization_id: 'o1', service_id: 's1', starts_at: now, location: null, notes: null, created_at: now, updated_at: now }]
      : table === 'rehearsal_songs' ? [{ rehearsal_id: 'r1', service_item_id: 'i1' }] : [])
    await new TargetSyncEngine(db).sync()
    expect((await db.rehearsals.toArray()).map((r) => r.id).sort()).toEqual(['queued', 'r1'])
    expect(await db.rehearsalSongs.toArray()).toEqual([song])
  })

  it('saves ensaio and foco atomically in the queue (also deletes)', async () => {
    await db.rehearsalSongs.put({ rehearsalId: 'r1', serviceItemId: 'old' })
    await new TargetSyncEngine(db).queueUpserts('rehearsals', [reh], [db.rehearsals, db.rehearsalSongs], async () => {
      await db.rehearsals.put(reh)
    }, { deleteSongIds: ['r1:old'], upsertSongs: [song] })
    const q = (await db.targetSyncQueue.toArray()).map((x) => `${x.entity}:${x.entityId}:${x.operation}`)
    expect(q).toEqual(['rehearsals:r1:upsert', 'rehearsalSongs:r1:old:delete', 'rehearsalSongs:r1:i1:upsert'])
  })

  it('does not pull over a pending rehearsalSongs row and clears queued songs when the ensaio is removed', async () => {
    await db.targetSyncQueue.add({ entity: 'rehearsalSongs', entityId: 'r1:i1', operation: 'delete', updatedAt: now, attempts: 0, status: 'failed' })
    remote.selectRows.mockImplementation(async (t: string) => t === 'rehearsal_songs' ? [{ rehearsal_id: 'r1', service_item_id: 'i1' }] : [])
    const engine = new TargetSyncEngine(db)
    await engine.sync()
    expect(await db.rehearsalSongs.count()).toBe(0)
    await db.targetSyncQueue.add({ entity: 'rehearsalSongs', entityId: 'r2:i1', operation: 'upsert', payload: { rehearsalId: 'r2', serviceItemId: 'i1' }, updatedAt: now, attempts: 0, status: 'failed' })
    await engine.queueDeleteAtomic('rehearsals', 'r2', [db.rehearsals, db.rehearsalSongs], async () => undefined)
    expect((await db.targetSyncQueue.toArray()).filter((x) => x.entityId.startsWith('r2:'))).toEqual([])
  })

  it('discardFailed removes the composite-key row', async () => {
    await db.rehearsalSongs.put(song)
    await db.targetSyncQueue.add({ entity: 'rehearsalSongs', entityId: 'r1:i1', operation: 'upsert', payload: song, updatedAt: now, attempts: 1, status: 'failed' })
    await new TargetSyncEngine(db).discardFailed()
    expect(await db.rehearsalSongs.count()).toBe(0)
  })

  it('discardFailed of a rehearsal also drops its focus rows and queued songs', async () => {
    await db.rehearsalSongs.put(song)
    await db.targetSyncQueue.add({ entity: 'rehearsals', entityId: 'r1', operation: 'upsert', payload: { id: 'r1', organizationId: 'o', serviceId: 's', startsAt: now, createdAt: now, updatedAt: now }, updatedAt: now, attempts: 1, status: 'failed' })
    await db.targetSyncQueue.add({ entity: 'rehearsalSongs', entityId: 'r1:i1', operation: 'upsert', payload: song, updatedAt: now, attempts: 0 })
    await new TargetSyncEngine(db).discardFailed()
    expect(await db.rehearsalSongs.count()).toBe(0)
    expect((await db.targetSyncQueue.toArray()).filter((x) => x.entityId.startsWith('r1'))).toEqual([])
  })
})

describe('TargetSyncEngine materials (RN-22…25)', () => {
  const mat = { id: 'm1', organizationId: 'o1', serviceId: 's1', kind: 'link' as const, title: 'Cifra', url: 'https://x.com/a', createdAt: now, updatedAt: now }
  const row = { id: 'm1', organization_id: 'o1', service_id: 's1', rehearsal_id: null, song_id: null, kind: 'link', title: 'Cifra', url: 'https://x.com/a', notes: null, created_by: null, created_at: now, updated_at: now }
  beforeEach(async () => {
    vi.resetAllMocks()
    remote.selectRows.mockResolvedValue([])
    remote.upsertRows.mockResolvedValue({ count: 1 })
    remote.deleteRows.mockResolvedValue({ count: 1 })
    await Promise.all([db.targetSyncQueue.clear(), db.materials.clear()])
  })

  it('pushes upsert and delete', async () => {
    await db.targetSyncQueue.bulkAdd([
      { entity: 'materials', entityId: 'm1', operation: 'upsert', payload: mat, updatedAt: now, attempts: 0 },
      { entity: 'materials', entityId: 'm2', operation: 'delete', updatedAt: now, attempts: 0 },
    ])
    await new TargetSyncEngine(db).sync()
    expect(remote.upsertRows).toHaveBeenCalledWith('materials', [row])
    expect(remote.deleteRows).toHaveBeenCalledWith('materials', { id: 'm2' })
    expect(await db.targetSyncQueue.count()).toBe(0)
  })

  it('does not retry 403', async () => {
    remote.upsertRows.mockRejectedValue(new ApiError(403, 'recusado'))
    const engine = new TargetSyncEngine(db)
    await db.targetSyncQueue.add({ entity: 'materials', entityId: 'm1', operation: 'upsert', payload: mat, updatedAt: now, attempts: 0 })
    await engine.sync()
    remote.upsertRows.mockClear()
    await engine.sync()
    expect(remote.upsertRows).not.toHaveBeenCalled()
    expect((await engine.getStatus()).failed).toHaveLength(1)
  })

  it('409 (check de URL) goes to failed and keeps the local copy', async () => {
    remote.upsertRows.mockRejectedValue(new ApiError(409, 'url inválida'))
    await db.materials.put(mat)
    await db.targetSyncQueue.add({ entity: 'materials', entityId: 'm1', operation: 'upsert', payload: mat, updatedAt: now, attempts: 0 })
    const engine = new TargetSyncEngine(db)
    await engine.sync()
    expect(await db.materials.get('m1')).toBeDefined()
    expect((await engine.getStatus()).failed).toHaveLength(1)
  })

  it('pull adds remote, drops vanished, keeps queued', async () => {
    await db.materials.bulkPut([{ ...mat, id: 'gone' }, { ...mat, id: 'queued' }])
    await db.targetSyncQueue.add({ entity: 'materials', entityId: 'queued', operation: 'upsert', payload: { ...mat, id: 'queued' }, updatedAt: now, attempts: 0, status: 'failed' })
    remote.selectRows.mockImplementation(async (table: string) => table === 'materials' ? [row] : [])
    await new TargetSyncEngine(db).sync()
    expect((await db.materials.toArray()).map((m) => m.id).sort()).toEqual(['m1', 'queued'])
  })
})

describe('TargetSyncEngine delete consistency (issue #116)', () => {
  const item = (id: string, position: number, refItemId?: string) => ({ id, serviceId: 'svc-1', type: refItemId ? 'reprise' : 'song', songId: 's', position, refItemId, updatedAt: now })
  const row = (id: string, position: number, ref: string | null = null) => ({ id, service_id: 'svc-1', type: ref ? 'reprise' : 'song', song_id: 's', title: null, notes: null, duration_minutes: null, position, repertoire_id: null, key: null, ref_item_id: ref, updated_at: now })

  beforeEach(async () => {
    vi.resetAllMocks()
    remote.selectRows.mockResolvedValue([])
    remote.upsertRows.mockResolvedValue({ count: 1 })
    remote.deleteRows.mockResolvedValue({ count: 1 })
    await Promise.all([db.targetSyncQueue.clear(), db.serviceItems.clear(), db.rehearsalSongs.clear(), db.servicePositions.clear()])
  })

  it('does not resurrect a row with a pending delete on pull', async () => {
    remote.deleteRows.mockRejectedValue(new Error('offline'))
    remote.selectRows.mockImplementation(async (table: string) => table === 'service_items' ? [row('a', 0)] : [])
    const engine = new TargetSyncEngine(db)
    await db.serviceItems.put(item('a', 0) as never)
    await engine.queueDeleteAtomic('serviceItems', 'a', [db.serviceItems], async () => { await db.serviceItems.delete('a') })
    await engine.stop(); engine.start(); await engine.sync()
    expect(await db.serviceItems.get('a')).toBeUndefined()
  })

  it('deletes dependents first, atomically, so a pull in between cannot bring them back', async () => {
    const engine = new TargetSyncEngine(db)
    await db.serviceItems.bulkPut([item('t', 0), item('r1', 1, 't'), item('r2', 2, 't')] as never)
    const server = new Set(['t', 'r1', 'r2'])
    remote.deleteRows.mockImplementation(async (_t: string, f: { id: string }) => { server.delete(f.id); return { count: 1 } })
    remote.selectRows.mockImplementation(async (table: string) => table === 'service_items' ? [...server].map((id) => row(id, 0)) : [])
    await engine.queueDeleteAtomic('serviceItems', ['r1', 'r2', 't'], [db.serviceItems], async () => { await db.serviceItems.bulkDelete(['r1', 'r2', 't']) })
    await engine.stop(); engine.start(); await engine.sync()
    expect(remote.deleteRows.mock.calls.map(([, f]) => f.id)).toEqual(['r1', 'r2', 't'])
    expect(await db.serviceItems.count()).toBe(0)
  })

  it('removes rows (and their rehearsal songs) deleted on another device after a full pull', async () => {
    await db.serviceItems.bulkPut([item('t', 0), item('r1', 1, 't')] as never)
    await db.rehearsalSongs.put({ rehearsalId: 'rh', serviceItemId: 'r1' })
    remote.selectRows.mockImplementation(async (table: string) => table === 'service_items' ? [] : [])
    await new TargetSyncEngine(db).sync()
    expect(await db.serviceItems.count()).toBe(0)
    expect(await db.rehearsalSongs.count()).toBe(0)
  })

  it('keeps everything when the pull fails, or when the entity has pending queue items', async () => {
    await db.serviceItems.bulkPut([item('t', 0), item('n', 1)] as never)
    remote.selectRows.mockRejectedValue(new Error('offline'))
    await new TargetSyncEngine(db).sync()
    expect(await db.serviceItems.count()).toBe(2)

    remote.selectRows.mockResolvedValue([])
    remote.upsertRows.mockRejectedValue(new Error('offline'))
    await db.targetSyncQueue.add({ entity: 'serviceItems', entityId: 'n', operation: 'upsert', payload: item('n', 1) as never, updatedAt: now, attempts: 0 })
    await new TargetSyncEngine(db).sync()
    expect(await db.serviceItems.count()).toBe(2)
  })

  it('does not remove rows created while the GET was in flight (even with a skewed clock)', async () => {
    remote.selectRows.mockImplementation(async (table: string) => {
      if (table === 'service_positions') await db.servicePositions.put({ id: 'new', serviceId: 'svc-1', musicalFunction: 'vocals', quantity: 1, createdAt: now, updatedAt: '1999-01-01T00:00:00Z' })
      return []
    })
    await new TargetSyncEngine(db).sync()
    expect(await db.servicePositions.count()).toBe(1)
  })

  const position = (id: string) => ({ id, serviceId: 'svc-1', musicalFunction: 'vocals', quantity: 1, createdAt: now, updatedAt: now })

  it('lets the server win when a delete was refused (failed): the pull restores the row', async () => {
    remote.selectRows.mockImplementation(async (table: string) => table === 'service_items' ? [row('a', 0)] : [])
    await db.targetSyncQueue.add({ entity: 'serviceItems', entityId: 'a', operation: 'delete', updatedAt: now, attempts: 1, status: 'failed' })
    await new TargetSyncEngine(db).sync()
    expect(await db.serviceItems.get('a')).toBeDefined()
  })

  it('does not let a failed delete block the mirror', async () => {
    await db.servicePositions.put(position('gone') as never)
    await db.targetSyncQueue.add({ entity: 'servicePositions', entityId: 'other', operation: 'delete', updatedAt: now, attempts: 1, status: 'failed' })
    await new TargetSyncEngine(db).sync()
    expect(await db.servicePositions.count()).toBe(0)
  })

  it('does not sweep non-mirrored entities', async () => {
    await db.organizations.put({ id: 'org-x', name: 'x', createdAt: now, updatedAt: now })
    await new TargetSyncEngine(db).sync()
    expect(await db.organizations.get('org-x')).toBeDefined()
    await db.organizations.clear()
  })

  describe('mirror of services and repertoires (#127)', () => {
    const svc = (id: string) => ({ id, organizationId: 'o', teamId: null, name: id, startsAt: now, status: 'draft', createdByUserId: 'u', createdAt: now, updatedAt: now })
    const rep = (id: string) => ({ id, name: id, createdByUserId: 'u', version: 1, createdAt: now, updatedAt: now })
    beforeEach(async () => {
      await Promise.all([db.services.clear(), db.repertoires.clear(), db.serviceItems.clear(), db.repertoireItems.clear(), db.rehearsals.clear(), db.rehearsalSongs.clear(), db.materials.clear(), db.servicePositions.clear(), db.servicePreparations.clear(), db.assignments.clear(), db.stageSessions.clear(), db.stageSessionStates.clear(), db.targetSyncQueue.clear()])
    })

    it('removes a service deleted elsewhere with its children, keeps the ones still on the server', async () => {
      await db.services.bulkPut([svc('gone'), svc('kept')] as never)
      await db.serviceItems.bulkPut([item('i1', 0), { ...item('i2', 1), serviceId: 'kept' }] as never)
      await db.rehearsals.put({ id: 'rh', organizationId: 'o', serviceId: 'gone', startsAt: now, createdAt: now, updatedAt: now })
      await db.rehearsalSongs.put({ rehearsalId: 'rh', serviceItemId: 'i1' })
      await db.materials.put({ id: 'm', organizationId: 'o', rehearsalId: 'rh', kind: 'link', title: 't', url: 'u', createdAt: now, updatedAt: now } as never)
      await db.targetSyncQueue.add({ entity: 'servicePositions', entityId: 'p', operation: 'upsert', payload: position('p') as never, updatedAt: now, attempts: 0 })
      await db.servicePositions.put({ ...position('p'), serviceId: 'gone' } as never)
      remote.selectRows.mockImplementation(async (table: string) => table === 'services' ? [{ id: 'kept', organization_id: 'o', team_id: null, name: 'kept', starts_at: now, status: 'draft', created_by_user_id: 'u', created_at: now, updated_at: now }] : [])
      await new TargetSyncEngine(db).sync()
      expect((await db.services.toArray()).map((s) => s.id)).toEqual(['kept'])
      expect(await db.rehearsals.count()).toBe(0)
      expect(await db.rehearsalSongs.count()).toBe(0)
      expect(await db.materials.count()).toBe(0)
      expect(await db.servicePositions.count()).toBe(0)
    })

    it('keeps a locally created service/repertoire that is still queued', async () => {
      await db.services.put(svc('new') as never)
      await db.repertoires.put(rep('newrep') as never)
      remote.upsertRows.mockRejectedValue(new Error('offline'))
      for (const [entity, payload] of [['services', svc('new')], ['repertoires', rep('newrep')]] as const) {
        await db.targetSyncQueue.add({ entity, entityId: payload.id, operation: 'upsert', payload: payload as never, updatedAt: now, attempts: 0 })
      }
      await new TargetSyncEngine(db).sync()
      expect(await db.services.count()).toBe(1)
      expect(await db.repertoires.count()).toBe(1)
    })

    it('removes a repertoire deleted elsewhere with its items', async () => {
      await db.repertoires.put(rep('r') as never)
      await db.repertoireItems.put({ id: 'ri', repertoireId: 'r', songId: 's', position: 0, updatedAt: now })
      await new TargetSyncEngine(db).sync()
      expect(await db.repertoires.count()).toBe(0)
      expect(await db.repertoireItems.count()).toBe(0)
    })

    it('does not mirror when the pull fails', async () => {
      await db.services.put(svc('a') as never)
      await db.repertoires.put(rep('b') as never)
      remote.selectRows.mockRejectedValue(new Error('offline'))
      await new TargetSyncEngine(db).sync()
      expect(await db.services.count()).toBe(1)
      expect(await db.repertoires.count()).toBe(1)
    })

    it('does not remove a service written (putLocal) while the GET was in flight', async () => {
      remote.selectRows.mockImplementation(async (table: string) => {
        if (table === 'services') await db.services.put({ ...svc('late'), updatedAt: '1999-01-01T00:00:00Z' } as never)
        return []
      })
      await new TargetSyncEngine(db).sync()
      expect(await db.services.count()).toBe(1)
    })

    it('cascades a remotely deleted service to every child and to the children queue items', async () => {
      await db.services.put(svc('gone') as never)
      await db.serviceItems.put({ ...item('i1', 0), serviceId: 'gone' } as never)
      await db.servicePositions.put({ ...position('p1'), serviceId: 'gone' } as never)
      await db.servicePreparations.put({ id: 'gone:u', serviceId: 'gone', userId: 'u', preparedAt: now, updatedAt: now })
      await db.assignments.put({ id: 'a1', serviceId: 'gone', updatedAt: now } as never)
      await db.stageSessions.put({ id: 'ss', serviceId: 'gone', status: 'active', createdAt: now, updatedAt: now } as never)
      await db.stageSessionStates.put({ stageSessionId: 'ss', updatedAt: now } as never)
      await db.rehearsals.put({ id: 'rh', organizationId: 'o', serviceId: 'gone', startsAt: now, createdAt: now, updatedAt: now })
      await db.rehearsalSongs.put({ rehearsalId: 'rh', serviceItemId: 'i1' })
      await db.materials.bulkPut([
        { id: 'm1', organizationId: 'o', serviceId: 'gone', kind: 'link', title: 't', url: 'u', createdAt: now, updatedAt: now },
        { id: 'm2', organizationId: 'o', rehearsalId: 'rh', kind: 'link', title: 't', url: 'u', createdAt: now, updatedAt: now },
      ] as never)
      // Os filhos têm push pendente que o servidor recusa: a fila deles não pode sobreviver nem bloquear.
      remote.upsertRows.mockRejectedValue(new ApiError(403, 'x'))
      await db.targetSyncQueue.bulkAdd([
        { entity: 'serviceItems', entityId: 'i1', operation: 'upsert', payload: { ...item('i1', 0), serviceId: 'gone' } as never, updatedAt: now, attempts: 1, status: 'failed' },
        { entity: 'rehearsalSongs', entityId: 'rh:i1', operation: 'upsert', payload: { rehearsalId: 'rh', serviceItemId: 'i1' } as never, updatedAt: now, attempts: 1, status: 'failed' },
        { entity: 'materials', entityId: 'm1', operation: 'upsert', payload: {} as never, updatedAt: now, attempts: 1, status: 'failed' },
        { entity: 'servicePositions', entityId: 'p1', operation: 'upsert', payload: {} as never, updatedAt: now, attempts: 1, status: 'failed' },
      ] as TargetSyncQueueItem[])
      await new TargetSyncEngine(db).sync()
      for (const t of [db.services, db.serviceItems, db.servicePositions, db.servicePreparations, db.assignments, db.stageSessions, db.stageSessionStates, db.rehearsals, db.rehearsalSongs, db.materials, db.targetSyncQueue]) {
        expect([t.name, await t.count()]).toEqual([t.name, 0])
      }
    })

    it('cascades a remotely deleted repertoire to its items and their queue items', async () => {
      await db.repertoires.put(rep('r') as never)
      await db.repertoireItems.put({ id: 'ri', repertoireId: 'r', songId: 's', position: 0, updatedAt: now })
      await db.targetSyncQueue.add({ entity: 'repertoireItems', entityId: 'ri', operation: 'upsert', payload: { id: 'ri', repertoireId: 'r', songId: 's', position: 0, updatedAt: now } as never, updatedAt: now, attempts: 1, status: 'failed' })
      await new TargetSyncEngine(db).sync()
      expect(await db.repertoireItems.count()).toBe(0)
      expect(await db.targetSyncQueue.count()).toBe(0)
    })

    it('writes nothing after stop() when the pull was in flight (sign out)', async () => {
      let release: (rows: unknown[]) => void = () => undefined
      remote.selectRows.mockImplementation((table: string) => table === 'services'
        ? new Promise((resolve) => { release = resolve })
        : Promise.resolve([]))
      const engine = new TargetSyncEngine(db)
      const running = engine.sync()
      await vi.waitFor(() => expect(remote.selectRows).toHaveBeenCalledWith('services'))
      const stopping = engine.stop()
      release([{ id: 'srv', organization_id: 'o', team_id: null, name: 'x', starts_at: now, status: 'draft', created_by_user_id: 'u', created_at: now, updated_at: now }])
      await Promise.all([running, stopping])
      expect(await db.services.count()).toBe(0)
    })
  })

  describe('epoch (late responses after stop + clear + start)', () => {
    const svcRow = { id: 'srv', organization_id: 'o', team_id: null, name: 'x', starts_at: now, status: 'draft', created_by_user_id: 'u', created_at: now, updated_at: now }
    const repRow = { id: 'rep', organization_id: 'o', team_id: null, name: 'r', created_at: now, updated_at: now }
    const itemRow = { id: 'it', service_id: 'srv', type: 'song', position: 0, created_at: now, updated_at: now }

    const repertoireValue = (id: string) => ({ id, name: id, createdByUserId: 'u', version: 1, createdAt: now, updatedAt: now })

    it.each([
      ['services', svcRow, () => db.services.count()],
      ['repertoires', repRow, () => db.repertoires.count()],
      ['service_items', itemRow, () => db.serviceItems.count()],
    ])('drops a late %s pull so the next user starts clean', async (table, row, count) => {
      let release: (rows: unknown[]) => void = () => undefined
      remote.selectRows.mockImplementation((name: string) => name === table
        ? new Promise((resolve) => { release = resolve })
        : Promise.resolve([]))
      const engine = new TargetSyncEngine(db)
      const running = engine.sync()
      await vi.waitFor(() => expect(remote.selectRows).toHaveBeenCalledWith(table))
      const stopping = engine.stop()
      await db.services.clear()
      engine.start()
      release([row])
      await Promise.all([running, stopping])
      expect(await count()).toBe(0)
    })

    it('a late organization select does not call create_organization after stop + start', async () => {
      const { rpc } = await import('../platform/rpc')
      let release: (rows: unknown[]) => void = () => undefined
      remote.selectRows.mockImplementation((name: string) => name === 'organizations' ? new Promise((resolve) => { release = resolve }) : Promise.resolve([]))
      const engine = new TargetSyncEngine(db)
      await db.targetSyncQueue.add({ entity: 'organizations', entityId: 'o', operation: 'upsert', payload: { id: 'o', name: 'Org', createdAt: now, updatedAt: now } as never, updatedAt: now, attempts: 0 })
      const running = engine.sync()
      await vi.waitFor(() => expect(remote.selectRows).toHaveBeenCalledWith('organizations', { id: 'o' }))
      const stopping = engine.stop()
      await db.targetSyncQueue.clear()
      engine.start()
      release([])
      await Promise.all([running, stopping])
      expect(rpc).not.toHaveBeenCalled()
    })

    it('start() while running does not release a parallel run', async () => {
      remote.selectRows.mockReturnValue(new Promise(() => undefined))
      const engine = new TargetSyncEngine(db)
      void engine.sync()
      await vi.waitFor(() => expect(remote.selectRows).toHaveBeenCalledTimes(1))
      engine.start()
      await engine.sync()
      expect(remote.selectRows).toHaveBeenCalledTimes(1)
    })

    it('a hung first upsert answered after stop + clear + start sends the second queued item zero times', async () => {
      let release: (v: unknown) => void = () => undefined
      remote.selectRows.mockResolvedValue([])
      remote.upsertRows.mockImplementationOnce(() => new Promise((resolve) => { release = resolve }))
      const engine = new TargetSyncEngine(db)
      await db.targetSyncQueue.bulkAdd([
        { entity: 'repertoires', entityId: 'a', operation: 'upsert', payload: repertoireValue('a') as never, updatedAt: now, attempts: 0 },
        { entity: 'repertoires', entityId: 'b', operation: 'upsert', payload: repertoireValue('b') as never, updatedAt: now, attempts: 0 },
      ])
      const old = engine.sync()
      await vi.waitFor(() => expect(remote.upsertRows).toHaveBeenCalledTimes(1))
      const stopping = engine.stop()
      await db.targetSyncQueue.clear()
      engine.start()
      release(undefined)
      await Promise.all([old, stopping])
      expect(remote.upsertRows).toHaveBeenCalledTimes(1)
    })

    it('runs a new sync while the old one is hung', async () => {
      let release: (v: unknown) => void = () => undefined
      remote.upsertRows.mockImplementationOnce(() => new Promise((resolve) => { release = resolve }))
      const engine = new TargetSyncEngine(db)
      await db.targetSyncQueue.add({ entity: 'repertoires', entityId: 'a', operation: 'upsert', payload: repertoireValue('a') as never, updatedAt: now, attempts: 0 })
      const old = engine.sync()
      await vi.waitFor(() => expect(remote.upsertRows).toHaveBeenCalledTimes(1))
      void engine.stop()
      await db.targetSyncQueue.clear()
      engine.start()
      await db.targetSyncQueue.add({ entity: 'repertoires', entityId: 'b', operation: 'upsert', payload: repertoireValue('b') as never, updatedAt: now, attempts: 0 })
      remote.upsertRows.mockResolvedValue(undefined)
      await engine.sync()
      expect(remote.upsertRows).toHaveBeenCalledTimes(2)
      release(undefined)
      await old
    })
  })

  it('a failed pull of one entity does not wipe it nor the others', async () => {
    await db.serviceItems.put(item('a', 0) as never)
    await db.servicePositions.put(position('gone') as never)
    remote.selectRows.mockImplementation(async (table: string) => table === 'service_items' ? Promise.reject(new Error('boom')) : [])
    await new TargetSyncEngine(db).sync()
    expect(await db.serviceItems.count()).toBe(1)
    expect(await db.servicePositions.count()).toBe(0)
  })

  it('mirror also drops queued rehearsal-song upserts of removed items', async () => {
    await db.serviceItems.put(item('t', 0) as never)
    await db.targetSyncQueue.add({ entity: 'rehearsalSongs', entityId: 'rh:t', operation: 'upsert', payload: { rehearsalId: 'rh', serviceItemId: 't' } as never, updatedAt: now, attempts: 0, status: 'failed' })
    await new TargetSyncEngine(db).sync()
    expect(await db.serviceItems.count()).toBe(0)
    expect((await db.targetSyncQueue.toArray()).filter((q) => q.operation === 'upsert')).toEqual([])
  })

  it('pulls mirrored entities with no filter (full pull invariant)', async () => {
    await new TargetSyncEngine(db).sync()
    for (const t of ['services', 'repertoires', 'service_items', 'repertoire_items', 'service_positions', 'member_availability']) {
      const calls = remote.selectRows.mock.calls.filter(([name]) => name === t)
      expect(calls.length).toBeGreaterThan(0)
      for (const call of calls) expect(call[1]).toBeUndefined()
    }
  })
})

describe('TargetSyncEngine push order (parent before child)', () => {
  const add = (entity: string, id: string, extra: Record<string, unknown> = {}) =>
    ({ entity, entityId: id, operation: 'upsert', payload: { id, updatedAt: now, ...extra }, updatedAt: now, attempts: 0 }) as unknown as TargetSyncQueueItem

  beforeEach(async () => {
    vi.resetAllMocks()
    remote.selectRows.mockResolvedValue([])
    remote.upsertRows.mockResolvedValue({ count: 1 })
    await db.targetSyncQueue.clear()
  })

  it('pushes the parent first even when it was re-queued after its children', async () => {
    // Fila na ordem do bug: filhos primeiro, pai re-enfileirado (id maior).
    await db.targetSyncQueue.bulkAdd([
      add('serviceItems', 'i1', { serviceId: 's1' }), add('serviceItems', 'i2', { serviceId: 's1' }),
      add('servicePositions', 'p1', { serviceId: 's1' }), add('materials', 'm1', { serviceId: 's1' }),
      add('rehearsalSongs', 'r1:i1', { rehearsalId: 'r1', serviceItemId: 'i1' }), add('rehearsals', 'r1', { serviceId: 's1' }),
      add('services', 's1'),
    ])
    await new TargetSyncEngine(db).sync()
    const order = remote.upsertRows.mock.calls.map((c) => c[0])
    expect(order[0]).toBe('services')
    expect(order.indexOf('service_items')).toBeGreaterThan(order.indexOf('services'))
    expect(order.indexOf('rehearsals')).toBeLessThan(order.indexOf('rehearsal_songs'))
    expect(order.indexOf('service_items')).toBeLessThan(order.indexOf('rehearsal_songs'))
    expect(order.indexOf('service_positions')).toBeGreaterThan(order.indexOf('services'))
    expect(order.indexOf('materials')).toBeGreaterThan(order.indexOf('services'))
  })

  const del = (entity: string, id: string) => ({ entity, entityId: id, operation: 'delete', updatedAt: now, attempts: 0 }) as unknown as TargetSyncQueueItem
  const calls = () => [...remote.upsertRows.mock.calls.map((c) => `up:${c[0]}`), ...remote.deleteRows.mock.calls.map((c) => `del:${c[0]}`)]

  it('does not send higher-rank upserts when a parent upsert is retryable in the round; children are not failed', async () => {
    remote.upsertRows.mockImplementation(async (table: string) => {
      if (table === 'services') throw new ApiError(500, 'boom')
      return { count: 1 }
    })
    await db.targetSyncQueue.bulkAdd([add('serviceItems', 'i1', { serviceId: 's1' }), add('rehearsals', 'r1', { serviceId: 's1' }), add('materials', 'm1'), add('services', 's1')])
    await new TargetSyncEngine(db).sync()
    expect(remote.upsertRows.mock.calls.map((c) => c[0])).toEqual(['services'])
    const items = await db.targetSyncQueue.toArray()
    expect(items.map((i) => [i.entity, i.status, i.attempts])).toEqual([['serviceItems', undefined, 0], ['rehearsals', undefined, 0], ['materials', undefined, 0], ['services', undefined, 1]])
  })

  it('sends children after a parent refused for good, and they fail naturally', async () => {
    remote.upsertRows.mockImplementation(async (table: string) => {
      if (table === 'services') throw new ApiError(403, 'negado')
      if (table === 'service_items') throw new ApiError(403, 'negado')
      return { count: 1 }
    })
    await db.targetSyncQueue.bulkAdd([add('serviceItems', 'i1', { serviceId: 's1' }), add('services', 's1')])
    await new TargetSyncEngine(db).sync()
    expect((await db.targetSyncQueue.toArray()).map((i) => i.status)).toEqual(['failed', 'failed'])
  })

  it('keeps deletes in their original position: team removed after member upsert', async () => {
    await db.targetSyncQueue.bulkAdd([add('teamMemberships', 'tm1', { teamId: 't1' }), del('teams', 't1')])
    await new TargetSyncEngine(db).sync()
    expect(calls()).toEqual(['up:team_memberships', 'del:teams'])
    expect(remote.upsertRows.mock.invocationCallOrder[0]).toBeLessThan(remote.deleteRows.mock.invocationCallOrder[0])
  })

  it('keeps delete-before-recreate and child-before-parent deletes', async () => {
    await db.targetSyncQueue.bulkAdd([del('memberAvailability', 'a1'), add('memberAvailability', 'a2'), add('teams', 't2'), del('serviceItems', 'i1'), del('services', 's1')])
    await new TargetSyncEngine(db).sync()
    const all = [...remote.upsertRows.mock.invocationCallOrder.map((o, i) => [o, `up:${remote.upsertRows.mock.calls[i][0]}`]), ...remote.deleteRows.mock.invocationCallOrder.map((o, i) => [o, `del:${remote.deleteRows.mock.calls[i][0]}`])] as [number, string][]
    expect(all.sort((a, b) => a[0] - b[0]).map((x) => x[1])).toEqual(['del:member_availability', 'up:teams', 'up:member_availability', 'del:service_items', 'del:services'])
  })

  const order = () => [
    ...remote.upsertRows.mock.invocationCallOrder.map((o, i) => [o, `up:${remote.upsertRows.mock.calls[i][0]}`]),
    ...remote.deleteRows.mock.invocationCallOrder.map((o, i) => [o, `del:${remote.deleteRows.mock.calls[i][0]}`]),
  ].sort((a, b) => (a[0] as number) - (b[0] as number)).map((e) => e[1])

  it('treats a delete as a barrier: upsert after the delete stays after it', async () => {
    await db.targetSyncQueue.bulkAdd([add('materials', 'm1'), del('memberAvailability', 'a1'), add('memberAvailability', 'a2')])
    await new TargetSyncEngine(db).sync()
    expect(order()).toEqual(['up:materials', 'del:member_availability', 'up:member_availability'])
  })

  it('treats a delete as a barrier: upsert before the delete is not pushed after it', async () => {
    await db.targetSyncQueue.bulkAdd([add('teamMemberships', 'tm1', { teamId: 't1' }), del('teams', 't1'), add('organizations', 'o1')])
    await new TargetSyncEngine(db).sync()
    expect(order().slice(0, 2)).toEqual(['up:team_memberships', 'del:teams'])
  })

  it('reorders by rank inside a run without deletes', async () => {
    await db.targetSyncQueue.bulkAdd([add('serviceItems', 'i1', { serviceId: 's1' }), add('services', 's1')])
    await new TargetSyncEngine(db).sync()
    expect(order()).toEqual(['up:services', 'up:service_items'])
  })

  it('a batch in 5xx blocks rank 5', async () => {
    remote.upsertRows.mockImplementation(async (table: string) => {
      if (table === 'service_items') throw new ApiError(500, 'boom')
      return { count: 1 }
    })
    await db.targetSyncQueue.bulkAdd([add('serviceItems', 'i1', { serviceId: 's1' }), add('materials', 'm1')])
    await new TargetSyncEngine(db).sync()
    expect(remote.upsertRows.mock.calls.map((c) => c[0])).toEqual(['service_items'])
  })

  it('same-rank entities do not block each other (services 5xx, repertoire still sent)', async () => {
    remote.upsertRows.mockImplementation(async (table: string) => {
      if (table === 'services') throw new ApiError(500, 'boom')
      return { count: 1 }
    })
    await db.targetSyncQueue.bulkAdd([add('services', 's1'), add('repertoires', 'rp1')])
    await new TargetSyncEngine(db).sync()
    expect(remote.upsertRows.mock.calls.map((c) => c[0])).toEqual(['services', 'repertoires'])
  })
})
