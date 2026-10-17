// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { PendingLocalChangesError } from '../../auth/localSession'
import { axeViolations } from '../../test/axe'
import { MorePage } from './MorePage'

const signOut = vi.hoisted(() => vi.fn())
vi.mock('../../auth/authContext', () => ({ useAuth: () => ({ signOut }) }))

describe('MorePage', () => {
  it('offers Repertórios, Configurações and Sair, and hides Ensaios and Histórico', async () => {
    const { container } = render(<MemoryRouter><MorePage /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Repertórios' })).toHaveAttribute('href', '/repertoires')
    expect(screen.getByRole('heading', { name: 'Configurações' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument()
    expect(screen.queryByText(/Ensaios|Histórico/)).not.toBeInTheDocument()
    expect(await axeViolations(container)).toEqual([])
  })

  it('signs out, asking before discarding unsynced changes', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    signOut.mockRejectedValueOnce(new PendingLocalChangesError(2)).mockResolvedValue(undefined)
    render(<MemoryRouter><MorePage /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: 'Sair' }))
    expect(confirm).toHaveBeenCalled()
    expect(signOut).toHaveBeenLastCalledWith({ discardPendingChanges: true })
  })

  it('shows an error when signing out after confirming fails', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    signOut.mockRejectedValueOnce(new PendingLocalChangesError(2)).mockRejectedValueOnce(new Error('Sem conexão'))
    render(<MemoryRouter><MorePage /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: 'Sair' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão')
  })
})
