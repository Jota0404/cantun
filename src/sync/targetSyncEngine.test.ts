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
    remote.upsertRows.mockRejectedValueOnce(new ApiError(500, 'erro')).mockRejectedValueOnce(new ApiError(409, 'conflito'))
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

  it('does not remove rows created after the pull started', async () => {
    await db.servicePositions.put({ id: 'new', serviceId: 'svc-1', musicalFunction: 'vocals', quantity: 1, createdAt: '2999-01-01T00:00:00Z', updatedAt: '2999-01-01T00:00:00Z' })
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
    await db.services.put({ id: 'svc-x', updatedAt: now } as never)
    await new TargetSyncEngine(db).sync()
    expect(await db.services.get('svc-x')).toBeDefined()
    await db.services.clear()
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
    for (const t of ['service_items', 'repertoire_items', 'service_positions', 'member_availability']) {
      const calls = remote.selectRows.mock.calls.filter(([name]) => name === t)
      expect(calls.length).toBeGreaterThan(0)
      for (const call of calls) expect(call[1]).toBeUndefined()
    }
  })
})
