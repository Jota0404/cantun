import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Setlist } from '../../domain/repertoires/setlist'
import { SalmodiaDatabase } from '../database'
import { SetlistRepository } from './setlistRepository'

const db = new SalmodiaDatabase()
const repository = new SetlistRepository(db)

function buildSetlist(overrides: Partial<Setlist> = {}): Setlist {
  return {
    id: 'setlist-1',
    name: 'Culto de domingo',
    createdAt: '2026-08-23T10:00:00.000Z',
    updatedAt: '2026-08-23T10:00:00.000Z',
    ...overrides,
  }
}

describe('SetlistRepository', () => {
  beforeEach(async () => {
    await db.setlists.clear()
  })

  it('creates and retrieves a setlist', async () => {
    const setlist = buildSetlist()
    await repository.create(setlist)
    expect(await repository.getById(setlist.id)).toEqual(setlist)
  })

  it('removes a setlist', async () => {
    const setlist = buildSetlist()
    await repository.create(setlist)

    await repository.remove(setlist.id)

    expect(await repository.getById(setlist.id)).toBeUndefined()
  })

  it('lists setlists by latest update first', async () => {
    await repository.create(buildSetlist({ id: 'old', updatedAt: '2026-08-22T10:00:00.000Z' }))
    await repository.create(buildSetlist({ id: 'new', updatedAt: '2026-08-23T10:00:00.000Z' }))
    expect((await repository.list()).map((item) => item.id)).toEqual(['new', 'old'])
  })
})
