// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axeViolations } from '../../test/axe'
import { RepertoireDetailPage } from './RepertoireDetailPage'

const m = vi.hoisted(() => ({
  items: [{ id: 'i1', repertoireId: 'r1', songId: 's1', position: 0 }] as unknown[],
  addSongToRepertoire: vi.fn(async () => ({})), renameRepertoire: vi.fn(async () => ({})),
}))
const songs = Array.from({ length: 12 }, (_, index) => ({ id: `s${index + 1}`, title: `Música ${index + 1}`, artist: index === 7 ? 'Hillsong' : undefined }))
vi.mock('../../application/sync/remoteData', () => ({ onRemoteDataApplied: () => () => undefined }))
vi.mock('../../application/songs/listSongs', () => ({ listSongs: async () => songs }))
vi.mock('../../db/repositories/repertoireRepository', () => ({ repertoireRepository: { getById: async () => ({ id: 'r1', organizationId: 'o1', name: 'Culto', version: 1 }) } }))
vi.mock('../../db/repositories/repertoireItemRepository', () => ({ repertoireItemRepository: { listByRepertoireId: async () => m.items } }))
vi.mock('../../application/repertoires/repertoireService', () => ({
  addSongToRepertoire: m.addSongToRepertoire, renameRepertoire: m.renameRepertoire,
  deleteRepertoire: vi.fn(), duplicateRepertoire: vi.fn(), removeSongFromRepertoire: vi.fn(), reorderRepertoire: vi.fn(),
}))

function setup() {
  return render(<MemoryRouter initialEntries={['/repertoires/r1']}><Routes><Route path="/repertoires/:repertoireId" element={<RepertoireDetailPage />} /></Routes></MemoryRouter>)
}

describe('RepertoireDetailPage', () => {
  beforeEach(() => { m.addSongToRepertoire.mockClear(); m.renameRepertoire.mockClear() })

  it('adds a song by searching, with no ID and no window.prompt', async () => {
    const user = userEvent.setup()
    const prompt = vi.spyOn(window, 'prompt')
    const { container } = setup()
    await user.click(await screen.findByRole('button', { name: 'Adicionar música' }))
    expect(screen.queryByRole('button', { name: 'Adicionar Música 1' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Adicionar Música/ }).length).toBeGreaterThan(5)
    await user.type(screen.getByLabelText('Buscar música para adicionar'), 'hillsong')
    await user.click(screen.getByRole('button', { name: 'Adicionar Música 8' }))
    expect(m.addSongToRepertoire).toHaveBeenCalledWith('r1', 's8')
    expect(prompt).not.toHaveBeenCalled()
    expect(await axeViolations(container)).toEqual([])
  })

  it('renames through an inline form', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(await screen.findByRole('button', { name: 'Renomear' }))
    const input = screen.getByLabelText('Novo nome do repertório')
    await user.clear(input)
    await user.type(input, 'Culto de domingo')
    await user.click(screen.getByRole('button', { name: 'Salvar nome' }))
    expect(m.renameRepertoire).toHaveBeenCalledWith('r1', 'Culto de domingo')
  })
})
