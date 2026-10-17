import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../platform/http', () => ({ isPlatformConfigured: false }))
vi.mock('../../platform/auth', () => ({ getCurrentUser: () => null }))

import { db } from '../../db/database'
import { addSongToRepertoire, createRepertoire, getRepertoireDetail, importPersonalRepertoire, listPersonalRepertoires, listRepertoireGroups } from './repertoireService'

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

describe('personal repertoire (RN-C1, RN-C2)', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    await Promise.all([db.organizations.clear(), db.repertoires.clear(), db.repertoireItems.clear(), db.songs.clear()])
    await db.songs.bulkPut([song('s1', 'Oceano'), song('s2', 'Aliança'), song('s3', 'Santo'), song('s4', 'Reina'), orgSong('c1', 'Do Ministério', 'o1')])
  })

  it('creates offline, takes only own-library songs and lists summaries with up to 3 titles and "+N"', async () => {
    const mine = await createRepertoire({ name: 'Domingo', createdByUserId: 'u1', version: 1 })
    const other = await createRepertoire({ name: 'De outro', createdByUserId: 'u2', version: 1 })
    await createRepertoire({ organizationId: 'o1', name: 'Do Ministério', createdByUserId: 'u1', version: 1 })
    for (const id of ['s1', 's2', 's3', 's4']) await addSongToRepertoire(mine.id, id)
    await expect(addSongToRepertoire(mine.id, 's1')).rejects.toThrow('"Oceano" já está neste repertório.')
    await expect(addSongToRepertoire(mine.id, 'c1')).rejects.toThrow('"Do Ministério" é do Ministério')
    expect(rpc).not.toHaveBeenCalled()

    const list = await listPersonalRepertoires('u1')
    expect(list.map((entry) => entry.repertoire.id)).toEqual([mine.id])
    expect(list[0]).toMatchObject({ songTitles: ['Oceano', 'Aliança', 'Santo'], moreCount: 1 })
    expect((await listPersonalRepertoires('u2')).map((entry) => entry.repertoire.id)).toEqual([other.id])
  })

  it('imports through the RPC, stores the copy, songs and ordered items locally and keeps the personal one', async () => {
    const mine = await createRepertoire({ name: 'Domingo', createdByUserId: 'u1', version: 1 })
    await addSongToRepertoire(mine.id, 's1'); await addSongToRepertoire(mine.id, 's2')
    rpc.mockResolvedValueOnce({
      repertoire: { id: 'r-new', organization_id: 'o1', name: 'Domingo', created_by_user_id: 'u1', version: 1, created_at: now, updated_at: now },
      items: [{ id: 'i1', repertoire_id: 'r-new', song_id: 'c-s1', position: 0, updated_at: now }, { id: 'i2', repertoire_id: 'r-new', song_id: 'c-s2', position: 1, updated_at: now }],
      songs: [copyRow('c-s1', 's1', 'o1', 'Oceano'), copyRow('c-s2', 's2', 'o1', 'Aliança')],
      copied: 1, reused: 1,
    })

    const result = await importPersonalRepertoire(mine.id, 'o1')

    expect(result).toMatchObject({ success: true, copied: 1, reused: 1, repertoire: { id: 'r-new', organizationId: 'o1' } })
    expect(rpc).toHaveBeenCalledWith('import_personal_repertoire', expect.objectContaining({ p_repertoire_id: mine.id, p_organization_id: 'o1' }))
    const detail = await getRepertoireDetail('r-new')
    expect(detail?.items.map((item) => item.song?.title)).toEqual(['Oceano', 'Aliança'])
    expect(detail?.items[0].song).toMatchObject({ organizationId: 'o1', sourceSongId: 's1' })
    expect((await getRepertoireDetail(mine.id))?.items).toHaveLength(2)
    expect(await db.targetSyncQueue.filter((entry) => entry.entityId === 'r-new').count()).toBe(0)
  })

  it('refuses without network, for a repertoire that is not personal, and reports server errors', async () => {
    const mine = await createRepertoire({ name: 'Domingo', createdByUserId: 'u1', version: 1 })
    const org = await createRepertoire({ organizationId: 'o1', name: 'Org', createdByUserId: 'u1', version: 1 })
    expect(await importPersonalRepertoire(org.id, 'o1')).toEqual({ success: false, errors: ['Repertório pessoal não encontrado.'] })

    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    expect(await importPersonalRepertoire(mine.id, 'o1')).toEqual({ success: false, errors: ['Sem conexão: tente de novo quando estiver online.'] })
    expect(rpc).not.toHaveBeenCalled()
    online.mockReturnValue(true)

    rpc.mockRejectedValueOnce(new Error('Só quem administra o Ministério ou lidera uma banda importa repertórios.'))
    expect(await importPersonalRepertoire(mine.id, 'o1')).toEqual({ success: false, errors: ['Só quem administra o Ministério ou lidera uma banda importa repertórios.'] })
    online.mockRestore()
  })
})
