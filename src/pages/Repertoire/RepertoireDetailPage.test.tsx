// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axeViolations } from '../../test/axe'
import { RepertoireDetailPage } from './RepertoireDetailPage'

const m = vi.hoisted(() => ({
  items: [{ id: 'i1', repertoireId: 'r1', songId: 's1', position: 0 }] as unknown[],
  repertoire: { id: 'r1', organizationId: 'o1' as string | undefined, name: 'Culto', version: 1 },
  addSongToRepertoire: vi.fn(async () => ({})), renameRepertoire: vi.fn(async () => ({})),
}))
const songs = Array.from({ length: 12 }, (_, index) => ({ id: `s${index + 1}`, title: `Música ${index + 1}`, artist: index === 7 ? 'Hillsong' : undefined }))
vi.mock('../../application/sync/remoteData', () => ({ onRemoteDataApplied: () => () => undefined }))
vi.mock('../../application/songs/listSongs', () => ({ listSongs: async () => songs }))
vi.mock('../../application/songs/listOrganizationSongs', () => ({ listOrganizationSongs: async () => [{ id: 'm1', title: 'Cópia do Ministério' }] }))
vi.mock('../../application/repertoires/repertoireService', () => ({
  getRepertoireDetail: async () => ({ repertoire: m.repertoire, items: m.items }),
  addSongToRepertoire: m.addSongToRepertoire, renameRepertoire: m.renameRepertoire,
  deleteRepertoire: vi.fn(), duplicateRepertoire: vi.fn(), removeSongFromRepertoire: vi.fn(), reorderRepertoire: vi.fn(),
}))

function setup() {
  return render(<MemoryRouter initialEntries={['/repertoires/r1']}><Routes><Route path="/repertoires/:repertoireId" element={<RepertoireDetailPage />} /></Routes></MemoryRouter>)
}

describe('RepertoireDetailPage', () => {
  beforeEach(() => { m.addSongToRepertoire.mockClear(); m.renameRepertoire.mockClear(); m.repertoire.organizationId = 'o1' })

  it('shows the Ministério and personal sections; personal needs a connection and explains the copy', async () => {
    const user = userEvent.setup()
    const prompt = vi.spyOn(window, 'prompt')
    const { container } = setup()
    await user.click(await screen.findByRole('button', { name: 'Adicionar música' }))
    expect(screen.getByRole('heading', { name: 'Do Ministério' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Adicionar Cópia do Ministério' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Adicionar Música 8' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Mostrar minha biblioteca' }))
    expect(screen.getByText(/editar a cópia não muda a sua biblioteca pessoal/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Buscar música para adicionar'), 'hillsong')
    await user.click(screen.getByRole('button', { name: 'Adicionar Música 8' }))
    expect(m.addSongToRepertoire).toHaveBeenCalledWith('r1', 's8')
    expect(prompt).not.toHaveBeenCalled()
    expect(await axeViolations(container)).toEqual([])
  })

  it('warns about no connection as soon as the personal section opens, and adds nothing', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    setup()
    await user.click(await screen.findByRole('button', { name: 'Adicionar música' }))
    await user.click(screen.getByRole('button', { name: 'Mostrar minha biblioteca' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Sem conexão: tente de novo quando estiver online.')
    expect(screen.queryByRole('button', { name: 'Adicionar Música 8' })).not.toBeInTheDocument()
    expect(m.addSongToRepertoire).not.toHaveBeenCalled()
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

  it('personal repertoire: goes back to the list and picks only from my library, offline', async () => {
    const user = userEvent.setup()
    m.repertoire.organizationId = undefined
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    setup()
    expect(await screen.findByRole('link', { name: '← Repertórios' })).toHaveAttribute('href', '/repertoires')
    await user.click(screen.getByRole('button', { name: 'Adicionar música' }))
    expect(screen.queryByRole('heading', { name: 'Do Ministério' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Adicionar Cópia do Ministério' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Adicionar Música 3' }))
    expect(m.addSongToRepertoire).toHaveBeenCalledWith('r1', 's3')
  })
})
