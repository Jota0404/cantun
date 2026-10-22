import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { db } from '../../db/database'
import { ApiError, translateServerMessage } from '../../platform/http'
import { getServiceExecution, getSongHistory, listRepertoiresWithSong } from './executionHistoryService'

const raw = {
  service_id: 's1', organization_id: 'o1', completed_at: 'c', completed_by_user_id: 'u1', stage_started_at: null, stage_ended_at: null,
  songs: [{ position: 1, song_id: null, title: 'A', artist: null, key: 'G' }],
  members: [{ user_id: 'u1', musical_function: 'vocal' }, { user_id: null, musical_function: 'bass' }],
}
const names = async () => ({ u1: 'Ana' })

describe('executionHistoryService', () => {
  it('maps execution and names', async () => {
    const r = await getServiceExecution('s1', { call: vi.fn().mockResolvedValue(raw), displayNames: names })
    expect(r).toMatchObject({ success: true, execution: { members: [{ name: 'Ana' }, { name: 'Ex-membro', userId: null }], songs: [{ songId: null, key: 'G' }] } })
  })
  it('returns null execution', async () => {
    expect(await getServiceExecution('s1', { call: vi.fn().mockResolvedValue(null), displayNames: names })).toEqual({ success: true, execution: null })
  })
  it('offline fails in pt-BR', async () => {
    expect(await getServiceExecution('s1', { call: vi.fn().mockRejectedValue(new ApiError(0, 'Sem conexão')), displayNames: names })).toEqual({ success: false, errors: ['Disponível com conexão.'] })
  })
  it('maps song history', async () => {
    const call = vi.fn().mockResolvedValue({ last_played_at: 'd', plays_last_12_months: 2, keys: [{ key: 'G', count: 2 }], recent: [{ service_id: 's', service_name: 'N', starts_at: 'a', completed_at: 'b', key: null }] })
    expect(await getSongHistory('x', call)).toEqual({ success: true, history: { lastPlayedAt: 'd', playsLast12Months: 2, keys: [{ key: 'G', count: 2 }], recent: [{ serviceId: 's', serviceName: 'N', startsAt: 'a', completedAt: 'b', key: null }] } })
    expect(await getSongHistory('x', vi.fn().mockRejectedValue(new ApiError(0, 'Sem conexão')))).toMatchObject({ success: false })
    expect(await getSongHistory('x', vi.fn().mockRejectedValue(new ApiError(400, 'Falhou')))).toEqual({ success: false, errors: ['Falhou'] })
  })
  it('lists repertoires with song by name', async () => {
    const r = (id: string, name: string, organizationId: string) => ({ id, name, organizationId, createdByUserId: 'u', version: 1, createdAt: '', updatedAt: '' })
    await db.repertoires.bulkPut([r('r1', 'Zé', 'o'), r('r2', 'Ana', 'o'), r('r3', 'Outro', 'o'), r('r4', 'Fora', 'x')])
    await db.repertoireItems.bulkPut(['r1', 'r2', 'r4'].map((repertoireId) => ({ id: repertoireId, repertoireId, songId: 's', position: 1, updatedAt: '' })))
    expect(await listRepertoiresWithSong('s', 'o')).toEqual([{ id: 'r2', name: 'Ana' }, { id: 'r1', name: 'Zé' }])
  })
  it('translates open stage error', () => {
    expect(translateServerMessage('stage session still open')).toBe('Encerre o Palco antes de concluir.')
  })
})
