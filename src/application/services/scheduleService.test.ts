import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.hoisted(() => vi.fn())
const apiRequest = vi.hoisted(() => vi.fn())
const members = vi.hoisted(() => vi.fn())
vi.mock('../../platform/rpc', () => ({ rpc }))
vi.mock('../../platform/auth', () => ({ getCurrentUser: () => ({ id: 'me', email: 'm@example.com', emailVerified: true, displayName: 'Eu' }) }))
vi.mock('../../platform/http', async (importOriginal) => ({ ...await importOriginal<typeof import('../../platform/http')>(), apiRequest }))
const access = vi.hoisted(() => vi.fn())
vi.mock('../teams/teamMemberService', () => ({ listTeamMembers: members, getMyAccessContext: access }))
const queued = vi.hoisted(() => ({ upsert: vi.fn(), remove: vi.fn() }))
vi.mock('../../sync/syncService', () => ({ queueTargetUpsert: queued.upsert, queueTargetDeleteAtomic: async (_e: string, _i: unknown, _t: unknown, write: () => Promise<void>) => { queued.remove(); await write() } }))

import { db } from '../../db/database'
import { ApiError } from '../../platform/http'
import type { Service } from '../../domain/services/service'
import {
  assignMember, cancelAssignment, listManagedServiceGaps, clearMyAvailability, confirmAssignment, createPosition, getServiceGaps, listMyUpcomingAssignments,
  removePosition, replaceAssignment, resendAssignmentInvite, setMyAvailability, suggestForPosition, updatePosition,
} from './scheduleService'

const now = '2026-10-01T00:00:00.000Z'
const future = '2099-01-01T12:00:00.000Z'
const service: Service = { id: 's1', organizationId: 'o1', teamId: 't1', name: 'Culto', startsAt: future, status: 'ready', createdByUserId: 'u', createdAt: now, updatedAt: now }
const row = (overrides: Record<string, unknown> = {}) => ({ id: 'a1', service_id: 's1', position_id: 'p1', user_id: 'me', musical_function: 'vocals', status: 'invited', created_at: now, updated_at: now, ...overrides })

describe('schedule use cases', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    await Promise.all([db.services.clear(), db.servicePositions.clear(), db.assignments.clear(), db.memberAvailability.clear(), db.targetSyncQueue.clear(), db.serviceItems.clear()])
    await db.services.put(service)
  })

  it('creates, edits and removes positions with the RN-09 guards, queueing LWW upserts', async () => {
    const created = await createPosition({ serviceId: 's1', musicalFunction: 'vocals', quantity: 2 }, '00000000-0000-4000-8000-000000000001')
    expect(created).toMatchObject({ success: true, position: { quantity: 2 } })
    expect(queued.upsert).toHaveBeenCalledWith('servicePositions', expect.objectContaining({ quantity: 2 }))
    expect(await createPosition({ serviceId: 's1', musicalFunction: 'vocals', quantity: 1 })).toMatchObject({ success: false })
    expect(await createPosition({ serviceId: 's1', musicalFunction: 'kazoo', quantity: 1 })).toEqual({ success: false, errors: ['Função musical inválida.'] })

    await db.assignments.bulkPut([
      { id: 'a1', serviceId: 's1', positionId: '00000000-0000-4000-8000-000000000001', userId: 'u1', musicalFunction: 'vocals', status: 'confirmed', createdAt: now, updatedAt: now },
      { id: 'a2', serviceId: 's1', positionId: '00000000-0000-4000-8000-000000000001', userId: 'u2', musicalFunction: 'vocals', status: 'invited', createdAt: now, updatedAt: now },
    ])
    const id = '00000000-0000-4000-8000-000000000001'
    expect(await updatePosition(id, { quantity: 1 })).toEqual({ success: false, errors: ['A quantidade não pode ficar abaixo das pessoas já escaladas.'] })
    expect(await updatePosition(id, { musicalFunction: 'bass' })).toEqual({ success: false, errors: ['A função não muda enquanto houver pessoas escaladas.'] })
    expect(await updatePosition(id, { quantity: 3, notes: ' coro ' })).toMatchObject({ success: true, position: { quantity: 3, notes: 'coro' } })
    expect(await removePosition(id)).toEqual({ success: false, errors: ['Cancele as pessoas escaladas antes de excluir a vaga.'] })
    await db.assignments.clear()
    await db.assignments.bulkPut([
      { id: 'd1', serviceId: 's1', positionId: id, userId: 'u1', musicalFunction: 'vocals', status: 'declined', createdAt: now, updatedAt: now },
      { id: 'd2', serviceId: 's1', positionId: id, userId: 'u2', musicalFunction: 'vocals', status: 'cancelled', createdAt: now, updatedAt: now },
    ])
    expect(await removePosition(id)).toEqual({ success: true })
    expect(await db.assignments.count()).toBe(0)
  })

  it('blocks position changes on final services', async () => {
    await db.services.put({ ...service, status: 'cancelled' })
    expect(await createPosition({ serviceId: 's1', musicalFunction: 'vocals', quantity: 1 })).toEqual({ success: false, errors: ['Serviço encerrado não aceita mudanças na escala.'] })
  })

  it('assignment RPCs store the returned row locally, never queue, and replace cancels the old one', async () => {
    rpc.mockResolvedValueOnce(row())
    expect(await assignMember('p1', 'me')).toMatchObject({ success: true, assignment: { status: 'invited', positionId: 'p1' } })
    expect(rpc).toHaveBeenLastCalledWith('assign_member', { p_position_id: 'p1', p_user_id: 'me' })

    rpc.mockResolvedValueOnce(row({ status: 'confirmed', responded_at: now }))
    expect(await confirmAssignment('a1')).toMatchObject({ success: true, assignment: { status: 'confirmed', respondedAt: now } })
    expect(rpc).toHaveBeenLastCalledWith('respond_to_assignment', { p_assignment_id: 'a1', p_response: 'confirm' })

    rpc.mockResolvedValueOnce(row({ id: 'a2', user_id: 'u2', replaced_assignment_id: 'a1' }))
    await replaceAssignment('a1', 'u2')
    expect(rpc).toHaveBeenLastCalledWith('replace_assignment', { p_assignment_id: 'a1', p_new_user_id: 'u2' })
    expect((await db.assignments.get('a1'))?.status).toBe('cancelled')
    expect(await db.assignments.get('a2')).toMatchObject({ status: 'invited', replacedAssignmentId: 'a1' })
    expect(queued.upsert).not.toHaveBeenCalled()
  })

  it('keeps local state and returns the message when the server refuses or is offline', async () => {
    await db.assignments.put({ id: 'a1', serviceId: 's1', positionId: 'p1', userId: 'me', musicalFunction: 'vocals', status: 'invited', createdAt: now, updatedAt: now })
    rpc.mockRejectedValueOnce(new ApiError(0, 'Sem conexão: tente de novo quando estiver online.'))
    expect(await cancelAssignment('a1')).toEqual({ success: false, errors: ['Sem conexão: tente de novo quando estiver online.'] })
    expect((await db.assignments.get('a1'))?.status).toBe('invited')
  })

  it('resend maps 429 to a pt-BR cooldown message', async () => {
    apiRequest.mockResolvedValueOnce(undefined)
    expect(await resendAssignmentInvite('a1')).toEqual({ success: true })
    expect(apiRequest).toHaveBeenCalledWith('POST', '/schedule/assignments/a1/resend-invite')
    apiRequest.mockRejectedValueOnce(new ApiError(429, 'limite'))
    expect(await resendAssignmentInvite('a1')).toEqual({ success: false, errors: ['Aguarde um minuto para reenviar o convite.'] })
  })

  it('sets the own availability once per day (same id) and clears it', async () => {
    const first = await setMyAvailability({ organizationId: 'o1', date: '2026-10-11', status: 'tentative', note: ' talvez ' })
    const second = await setMyAvailability({ organizationId: 'o1', date: '2026-10-11', status: 'unavailable' })
    expect(first.success && second.success && first.availability.id === second.availability.id).toBe(true)
    expect(await db.memberAvailability.count()).toBe(1)
    expect(await setMyAvailability({ organizationId: 'o1', date: 'x', status: 'available' })).toMatchObject({ success: false })
    await clearMyAvailability('o1', '2026-10-11')
    expect(await db.memberAvailability.count()).toBe(0)
  })

  it('lists my upcoming assignments with song titles, skipping past and final services', async () => {
    await db.services.bulkPut([{ ...service, id: 'past', startsAt: '2020-01-01T00:00:00Z' }, { ...service, id: 'done', status: 'completed' }])
    await db.songs.put({ id: 'song1', title: 'Grande é o Senhor', originalKey: 'G', currentKey: 'G', lyrics: '', isFavorite: false, createdAt: now, updatedAt: now })
    await db.serviceItems.put({ id: 'it1', serviceId: 's1', type: 'song', songId: 'song1', position: 0, updatedAt: now })
    const base = { userId: 'me', musicalFunction: 'vocals', positionId: 'p1', createdAt: now, updatedAt: now }
    await db.assignments.bulkPut([
      { ...base, id: 'x1', serviceId: 's1', status: 'confirmed' }, { ...base, id: 'x2', serviceId: 'past', status: 'confirmed' },
      { ...base, id: 'x3', serviceId: 'done', status: 'invited' }, { ...base, id: 'x4', serviceId: 's1', status: 'declined' },
      { ...base, id: 'x5', serviceId: 's1', userId: 'other', status: 'confirmed' },
    ])
    const list = await listMyUpcomingAssignments()
    expect(list.map((i) => i.assignment.id)).toEqual(['x1'])
    expect(list[0].songTitles).toEqual(['Grande é o Senhor'])
  })

  it('computes gaps and suggestions from local data (RN-06, RN-12)', async () => {
    await db.servicePositions.put({ id: 'p1', serviceId: 's1', musicalFunction: 'vocals', quantity: 2, createdAt: now, updatedAt: now })
    await db.assignments.put({ id: 'a1', serviceId: 's1', positionId: 'p1', userId: 'ana', musicalFunction: 'vocals', status: 'confirmed', createdAt: now, updatedAt: now })
    expect(await getServiceGaps('s1')).toMatchObject({ openCount: 1, missingTotal: 1 })

    members.mockResolvedValueOnce([
      { userId: 'ana', displayName: 'Ana', displayStatus: 'active', musicalFunctions: ['vocals'] },
      { userId: 'bia', displayName: 'Bia', displayStatus: 'active', musicalFunctions: ['vocals'] },
      { userId: 'caio', displayName: 'Caio', displayStatus: 'inactive', musicalFunctions: ['vocals'] },
      { userId: 'davi', displayName: 'Davi', displayStatus: 'active', musicalFunctions: ['keys'] },
    ])
    await db.memberAvailability.put({ id: 'm1', userId: 'bia', organizationId: 'o1', date: '2099-01-01', status: 'unavailable', createdAt: now, updatedAt: now })
    const result = await suggestForPosition('p1')
    expect(result.map((s) => [s.displayName, s.warnings])).toEqual([['Davi', []], ['Bia', ['unavailable']]])
  })
  it('lists future open gaps only for teams I manage, nearest first', async () => {
    const position = { quantity: 1, createdAt: now, updatedAt: now }
    await db.organizations.put({ id: 'o1', name: 'Igreja', createdAt: now, updatedAt: now })
    await db.services.bulkPut([
      { ...service, id: 'far', startsAt: '2099-03-01T12:00:00Z' },
      { ...service, id: 'near', startsAt: '2099-02-01T12:00:00Z' },
      { ...service, id: 'full', startsAt: '2099-02-02T12:00:00Z' },
      { ...service, id: 'past', startsAt: '2020-01-01T12:00:00Z' },
      { ...service, id: 'done', startsAt: '2099-02-03T12:00:00Z', status: 'completed' },
      { ...service, id: 'other-team', teamId: 't2', startsAt: '2099-02-04T12:00:00Z' },
    ])
    await db.servicePositions.bulkPut(['far', 'near', 'full', 'past', 'done', 'other-team'].map((id) => ({ ...position, id: `p-${id}`, serviceId: id, musicalFunction: 'vocals' })))
    await db.assignments.put({ id: 'ok', serviceId: 'full', positionId: 'p-full', userId: 'u', musicalFunction: 'vocals', status: 'confirmed', createdAt: now, updatedAt: now })
    access.mockImplementation(async ({ teamId }: { teamId: string }) => ({ organizationRole: 'member', teamRole: teamId === 't1' ? 'leader' : 'member', teamStatus: 'active' }))

    const result = await listManagedServiceGaps()
    expect(result.map((item) => [item.service.id, item.openCount, item.missingTotal])).toEqual([['near', 1, 1], ['far', 1, 1]])
  })
})
