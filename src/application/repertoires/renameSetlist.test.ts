import { describe, expect, it, vi } from 'vitest'
import type { SetlistRepository } from '../../db/repositories/setlistRepository'
import { renameSetlist } from './renameSetlist'

function repositoryMock() {
  return {
    getById: vi.fn().mockResolvedValue({
      id: 'setlist-1',
      name: 'Culto',
      createdAt: '2026-08-24T10:00:00.000Z',
      updatedAt: '2026-08-24T10:00:00.000Z',
    }),
    create: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  } as unknown as SetlistRepository
}

describe('renameSetlist', () => {
  it('renames an existing setlist and updates updatedAt', async () => {
    const repository = repositoryMock()

    const result = await renameSetlist('setlist-1', '  Culto de domingo  ', repository)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.setlist.name).toBe('Culto de domingo')
      expect(result.setlist.createdAt).toBe('2026-08-24T10:00:00.000Z')
      expect(result.setlist.updatedAt).not.toBe('2026-08-24T10:00:00.000Z')
      expect(repository.update).toHaveBeenCalledWith(result.setlist)
    }
  })

  it('rejects an empty name without updating', async () => {
    const repository = repositoryMock()

    const result = await renameSetlist('setlist-1', '   ', repository)

    expect(result).toEqual({
      success: false,
      errors: [{ field: 'name', message: 'Nome do repertório é obrigatório.' }],
    })
    expect(repository.getById).not.toHaveBeenCalled()
    expect(repository.update).not.toHaveBeenCalled()
  })

  it('returns not found when the setlist does not exist', async () => {
    const repository = repositoryMock()
    vi.mocked(repository.getById).mockResolvedValue(undefined)

    const result = await renameSetlist('missing', 'Novo nome', repository)

    expect(result).toEqual({
      success: false,
      errors: [],
      message: 'Repertório não encontrado.',
    })
    expect(repository.update).not.toHaveBeenCalled()
  })
})
