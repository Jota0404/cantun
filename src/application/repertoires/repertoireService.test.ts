import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../platform/http', () => ({ isPlatformConfigured: false }))
vi.mock('../../platform/auth', () => ({ getCurrentUser: () => null }))

import { db } from '../../db/database'
import { addSongToRepertoire, createRepertoire, getRepertoireDetail, listRepertoireGroups } from './repertoireService'

const now = '2026-10-01T00:00:00.000Z'
const song = (id: string, title: string) => ({ id, title, originalKey: 'G' as const, currentKey: 'G' as const, lyrics: '', isFavorite: false, createdAt: now, updatedAt: now })

const rpc = vi.hoisted(() => vi.fn())
vi.mock('../../platform/rpc', () => ({ rpc }))

const copyRow = (id: string, source: string, organizationId: string, title: string) => ({ id, title, original_key: 'G', current_key: 'G', lyrics: '', organization_id: organizationId, source_song_id: source, is_favorite: false, created_at: now, updated_at: now })
const orgSong = (id: string, title: string, organizationId: string, sourceSongId?: string) => ({ ...song(id, title), organizationId, sourceSongId })

describe('repertoire use cases (RN-A7, RN-A3)', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    await Promise.all([db.organizations.clear(), db.repertoires.clear(), db.repertoireItems.clear(), db.songs.clear()])
    await db.organizations.bulkPut([{ id: 'o1', name: 'Igreja A', createdAt: now, updatedAt: now }, { id: 'o2', name: 'Igreja B', createdAt: now, updatedAt: now }])
    await db.songs.bulkPut([song('s1', 'Oceano'), song('s2', 'Aliança'), orgSong('c3', 'Santo', 'o1'), orgSong('c4', 'Outro', 'o2')])
  })

  it('adds an organization song directly; rejects unknown, repeated and other-organization songs with a reason', async () => {
    const repertoire = await createRepertoire({ organizationId: 'o1', name: 'Domingo', createdByUserId: 'u', version: 1 })
    expect(await addSongToRepertoire(repertoire.id, 'c3')).toMatchObject({ songId: 'c3', position: 0 })
    expect(rpc).not.toHaveBeenCalled()

    await expect(addSongToRepertoire(repertoire.id, 'nope')).rejects.toThrow('não está disponível neste aparelho')
    await expect(addSongToRepertoire(repertoire.id, 'c3')).rejects.toThrow('"Santo" já está neste repertório.')
    await expect(addSongToRepertoire('missing', 'c3')).rejects.toThrow('Repertório não encontrado.')
    await expect(addSongToRepertoire(repertoire.id, 'c4')).rejects.toThrow('"Outro" pertence a outro Ministério')
  })

  it('copies a personal song to the organization (online) and adds the copy; reuses an existing copy', async () => {
    const repertoire = await createRepertoire({ organizationId: 'o1', name: 'Domingo', createdByUserId: 'u', version: 1 })
    rpc.mockResolvedValueOnce(copyRow('copy-1', 's1', 'o1', 'Oceano'))
    const item = await addSongToRepertoire(repertoire.id, 's1')
    expect(rpc).toHaveBeenCalledWith('copy_song_to_organization', { p_song_id: 's1', p_organization_id: 'o1', p_new_id: expect.any(String) })
    expect(item.songId).toBe('copy-1')
    expect(await db.songs.get('copy-1')).toMatchObject({ organizationId: 'o1', sourceSongId: 's1' })

    // Mesma origem: a cópia já existe no aparelho, sem rede nem RPC.
    const second = await createRepertoire({ organizationId: 'o1', name: 'Quarta', createdByUserId: 'u', version: 1 })
    expect(await addSongToRepertoire(second.id, 's1')).toMatchObject({ songId: 'copy-1' })
    expect(rpc).toHaveBeenCalledTimes(1)
    await expect(addSongToRepertoire(repertoire.id, 's1')).rejects.toThrow('"Oceano" já está neste repertório.')
  })

  it('refuses to copy offline with the connection message and server errors verbatim', async () => {
    const repertoire = await createRepertoire({ organizationId: 'o1', name: 'Domingo', createdByUserId: 'u', version: 1 })
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValueOnce(false)
    await expect(addSongToRepertoire(repertoire.id, 's1')).rejects.toThrow('Sem conexão: tente de novo quando estiver online.')
    rpc.mockRejectedValueOnce(new Error('Você não tem permissão para esta ação.'))
    await expect(addSongToRepertoire(repertoire.id, 's2')).rejects.toThrow('Você não tem permissão para esta ação.')
    expect(await db.repertoireItems.count()).toBe(0)
  })

  it('reads groups and detail offline', async () => {
    const repertoire = await createRepertoire({ organizationId: 'o1', name: 'Domingo', createdByUserId: 'u', version: 1 })
    await addSongToRepertoire(repertoire.id, 'c3')
    const groups = await listRepertoireGroups()
    expect(groups.map((g) => [g.organization.id, g.repertoires.length]).sort()).toEqual([['o1', 1], ['o2', 0]])
    const detail = await getRepertoireDetail(repertoire.id)
    expect(detail?.items.map((item) => item.song?.title)).toEqual(['Santo'])
    expect(await getRepertoireDetail('missing')).toBeUndefined()
  })
})
