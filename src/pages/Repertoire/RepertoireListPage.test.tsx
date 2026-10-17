// @vitest-environment jsdom

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { RepertoireListPage } from './RepertoireListPage'

const listeners = vi.hoisted(() => [] as Array<() => void>)
vi.mock('../../auth/authContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('../../application/sync/remoteData', () => ({ onRemoteDataApplied: (listener: () => void) => { listeners.push(listener); return () => undefined } }))
const createRepertoire = vi.hoisted(() => vi.fn(async () => ({ id: 'p9' })))
vi.mock('../../application/repertoires/repertoireService', () => ({
  createRepertoire,
  listPersonalRepertoires: async () => [{ repertoire: { id: 'p1', name: 'Meu domingo', updatedAt: '2026-10-02T00:00:00Z' }, songTitles: ['Oceano', 'Aliança', 'Santo'], moreCount: 2 }],
  listRepertoireGroups: async () => [{ organization: { id: 'o1', name: 'Igreja' }, repertoires: [{ id: 'r1', name: 'Culto', version: 3, updatedAt: '2026-10-01T00:00:00Z' }] }],
}))

describe('RepertoireListPage', () => {
  it('keeps the typed name and the form mounted when live data arrives', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><RepertoireListPage /></MemoryRouter>)
    const input = await screen.findByLabelText('Novo repertório')
    await user.type(input, 'Meu novo repertório')

    await act(async () => { listeners.forEach((listener) => listener()) })

    expect(screen.queryByText('Carregando repertórios…')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Novo repertório')).toBe(input)
    expect(input).toHaveValue('Meu novo repertório')
    expect(screen.getByText('Culto')).toBeInTheDocument()
    expect(screen.queryByText(/ª versão/)).not.toBeInTheDocument()
  })

  it('creates a personal repertoire (no Ministério) and lists mine with a song summary', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><RepertoireListPage /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Meus repertórios' })).toBeInTheDocument()
    expect(screen.getByText('Meu domingo')).toBeInTheDocument()
    expect(screen.getByText('Oceano, Aliança, Santo +2')).toBeInTheDocument()
    expect(screen.queryByLabelText('Ministério')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Novo repertório'), 'Ensaio')
    await user.click(screen.getByRole('button', { name: 'Criar repertório' }))
    expect(createRepertoire).toHaveBeenCalledWith({ name: 'Ensaio', createdByUserId: 'u1', version: 1 })
  })
})
