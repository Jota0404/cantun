import { describe, expect, it, vi } from 'vitest'
import type { SetlistRepository } from '../../db/repositories/setlistRepository'
import { createSetlist } from './createSetlist'

function repositoryMock(): SetlistRepository {
  return { create: vi.fn(), getById: vi.fn(), list: vi.fn(), update: vi.fn(), remove: vi.fn() } as unknown as SetlistRepository
}

describe('createSetlist', () => {
  it('creates a named setlist with generated id and timestamps', async () => {
    const repository = repositoryMock()
    const result = await createSetlist('  Culto de domingo  ', repository)
    expect(result.success).toBe(true)
    expect(repository.create).toHaveBeenCalledOnce()
    expect(result).toMatchObject({ success: true, setlist: { name: 'Culto de domingo' } })
  })

  it('rejects an empty name', async () => {
    const repository = repositoryMock()
    const result = await createSetlist('   ', repository)
    expect(result.success).toBe(false)
    expect(repository.create).not.toHaveBeenCalled()
  })
})
