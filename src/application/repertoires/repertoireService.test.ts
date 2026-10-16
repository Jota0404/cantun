import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../platform/http', () => ({ isPlatformConfigured: false }))
vi.mock('../../platform/auth', () => ({ getCurrentUser: () => null }))

import { db } from '../../db/database'
import { addSongToRepertoire, createRepertoire, getRepertoireDetail, listRepertoireGroups } from './repertoireService'

const now = '2026-10-01T00:00:00.000Z'
const song = (id: string, title: string) => ({ id, title, originalKey: 'G' as const, currentKey: 'G' as const, lyrics: '', isFavorite: false, createdAt: now, updatedAt: now })

describe('repertoire use cases (RN-A7)', () => {
  beforeEach(async () => {
    await Promise.all([db.organizations.clear(), db.repertoires.clear(), db.repertoireItems.clear(), db.songs.clear(), db.organizationSongs.clear()])
    await db.organizations.bulkPut([{ id: 'o1', name: 'Igreja A', createdAt: now, updatedAt: now }, { id: 'o2', name: 'Igreja B', createdAt: now, updatedAt: now }])
    await db.songs.bulkPut([song('s1', 'Oceano'), song('s2', 'Aliança')])
  })

  it('adds an existing song, rejects unknown, repeated and other-organization songs with a reason', async () => {
    const repertoire = await createRepertoire({ organizationId: 'o1', name: 'Domingo', createdByUserId: 'u', version: 1 })
    const first = await addSongToRepertoire(repertoire.id, 's1')
    expect(first).toMatchObject({ songId: 's1', position: 0 })

    await expect(addSongToRepertoire(repertoire.id, 'nope')).rejects.toThrow('não está disponível neste aparelho')
    await expect(addSongToRepertoire(repertoire.id, 's1')).rejects.toThrow('"Oceano" já está neste repertório.')
    await expect(addSongToRepertoire('missing', 's1')).rejects.toThrow('Repertório não encontrado.')

    await db.organizationSongs.put({ id: 'l1', organizationId: 'o2', songId: 's2', createdAt: now, updatedAt: now })
    await expect(addSongToRepertoire(repertoire.id, 's2')).rejects.toThrow('"Aliança" pertence a outro Ministério')
    await db.organizationSongs.put({ id: 'l2', organizationId: 'o1', songId: 's2', createdAt: now, updatedAt: now })
    await expect(addSongToRepertoire(repertoire.id, 's2')).resolves.toMatchObject({ position: 1 })
  })

  it('reads groups and detail offline', async () => {
    const repertoire = await createRepertoire({ organizationId: 'o1', name: 'Domingo', createdByUserId: 'u', version: 1 })
    await addSongToRepertoire(repertoire.id, 's1')
    const groups = await listRepertoireGroups()
    expect(groups.map((g) => [g.organization.id, g.repertoires.length]).sort()).toEqual([['o1', 1], ['o2', 0]])
    const detail = await getRepertoireDetail(repertoire.id)
    expect(detail?.items.map((item) => item.song?.title)).toEqual(['Oceano'])
    expect(await getRepertoireDetail('missing')).toBeUndefined()
  })
})
