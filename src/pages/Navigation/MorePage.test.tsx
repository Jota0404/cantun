// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { PendingLocalChangesError } from '../../auth/localSession'
import { axeViolations } from '../../test/axe'
import { MorePage } from './MorePage'

const exportMyData = vi.hoisted(() => vi.fn())
vi.mock('../../application/privacy/exportMyData', () => ({ exportMyData }))
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

  it('downloads the export as a JSON file and shows errors', async () => {
    const user = userEvent.setup()
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    exportMyData.mockResolvedValueOnce({ success: true, json: '{}', filename: 'dados.json' })
      .mockResolvedValueOnce({ success: false, errors: ['Sem conexão: conecte-se à internet para exportar seus dados.'], offline: true })
    render(<MemoryRouter><MorePage /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: 'Exportar meus dados' }))
    expect(click).toHaveBeenCalled()
    expect(await screen.findByRole('status')).toHaveTextContent('Arquivo gerado')
    await user.click(screen.getByRole('button', { name: 'Exportar meus dados' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão')
  })

  it('disables the button while exporting and shows a fixed message on failure', async () => {
    const user = userEvent.setup()
    let finish: (value: unknown) => void = () => undefined
    exportMyData.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
    render(<MemoryRouter><MorePage /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: 'Exportar meus dados' }))
    expect(screen.getByRole('button', { name: 'Exportando…' })).toBeDisabled()
    finish({ success: false, errors: ['Não foi possível exportar seus dados.'] })
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível exportar seus dados. Tente novamente.')
    expect(screen.getByRole('button', { name: 'Exportar meus dados' })).toBeEnabled()
  })
})
