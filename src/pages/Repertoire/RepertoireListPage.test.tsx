// @vitest-environment jsdom

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { RepertoireListPage } from './RepertoireListPage'

const listeners = vi.hoisted(() => [] as Array<() => void>)
vi.mock('../../auth/authContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('../../application/sync/remoteData', () => ({ onRemoteDataApplied: (listener: () => void) => { listeners.push(listener); return () => undefined } }))
vi.mock('../../application/repertoires/repertoireService', () => ({ createRepertoire: vi.fn() }))
vi.mock('../../db/repositories/organizationRepository', () => ({ organizationRepository: { list: async () => [{ id: 'o1', name: 'Igreja' }] } }))
vi.mock('../../db/repositories/repertoireRepository', () => ({ repertoireRepository: { listByOrganizationId: async () => [{ id: 'r1', name: 'Culto', version: 3, updatedAt: '2026-10-01T00:00:00Z' }] } }))

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
})
