import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('../../platform/rpc', () => ({ rpc }))
vi.mock('../../platform/auth', () => ({ getCurrentUser: () => null }))
vi.mock('../../platform/http', () => ({ isPlatformConfigured: false }))

import { db } from '../../db/database'
import { copySongToOrganization } from './copySongToOrganization'
import { listOrganizationSongs } from './listOrganizationSongs'
import { searchSongs } from './searchSongs'

const now = '2026-10-01T00:00:00.000Z'
const base = { originalKey: 'G' as const, currentKey: 'G' as const, lyrics: '', isFavorite: false, createdAt: now, updatedAt: now }

describe('copySongToOrganization (RN-A3, RN-A13)', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    await db.songs.clear()
    await db.songs.bulkPut([{ id: 'mine', title: 'Oceano', ...base }, { id: 'copy', title: 'Santo', organizationId: 'o1', sourceSongId: 'x', ...base }])
  })

  it('creates the copy through the RPC with a client id and stores it locally without queueing', async () => {
    rpc.mockResolvedValueOnce({ id: 'new', title: 'Oceano', original_key: 'G', current_key: 'G', lyrics: '', organization_id: 'o1', source_song_id: 'mine', is_favorite: false, created_at: now, updated_at: now })
    const result = await copySongToOrganization('mine', 'o1')
    expect(result).toMatchObject({ success: true, created: true, song: { id: 'new', organizationId: 'o1', sourceSongId: 'mine' } })
    expect((await db.songs.get('mine'))?.organizationId).toBeUndefined()
    expect((await listOrganizationSongs('o1')).map((song) => song.id).sort()).toEqual(['copy', 'new'])
    expect(await db.syncQueue.count()).toBe(0)
  })

  it('is idempotent locally, reuses an organization song and refuses other scopes', async () => {
    expect(await copySongToOrganization('copy', 'o1')).toMatchObject({ success: true, created: false })
    expect(await copySongToOrganization('copy', 'o2')).toEqual({ success: false, errors: ['"Santo" pertence a outro Ministério.'] })
    expect(await copySongToOrganization('missing', 'o1')).toMatchObject({ success: false })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('shows the connection message offline and the server message on refusal', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValueOnce(false)
    expect(await copySongToOrganization('mine', 'o1')).toEqual({ success: false, errors: ['Sem conexão: tente de novo quando estiver online.'] })
    rpc.mockRejectedValueOnce(new Error('Você não tem permissão para esta ação.'))
    expect(await copySongToOrganization('mine', 'o1')).toEqual({ success: false, errors: ['Você não tem permissão para esta ação.'] })
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('searches the personal library by default and the organization songs with a scope', async () => {
    expect((await searchSongs('')).map((song) => song.id)).toEqual(['mine'])
    expect((await searchSongs('', undefined, { organizationId: 'o1' })).map((song) => song.id)).toEqual(['copy'])
  })
})
