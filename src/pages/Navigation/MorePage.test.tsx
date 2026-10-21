// @vitest-environment jsdom

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PendingLocalChangesError } from '../../auth/localSession'
import { ApiError } from '../../platform/http'
import { axeViolations } from '../../test/axe'
import { MorePage } from './MorePage'

const exportMyData = vi.hoisted(() => vi.fn())
vi.mock('../../application/privacy/exportMyData', () => ({ exportMyData }))
const signOut = vi.hoisted(() => vi.fn())
const deleteAccount = vi.hoisted(() => vi.fn())
const reauth = vi.hoisted(() => vi.fn())
vi.mock('../../auth/authContext', () => ({ useAuth: () => ({ signOut, deleteAccount, reauth }) }))

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

  describe('Excluir minha conta', () => {
    function renderMore() {
      return render(
        <MemoryRouter initialEntries={['/more']}>
          <Routes><Route path="/more" element={<MorePage />} /><Route path="/auth" element={<p>Tela de entrada</p>} /></Routes>
        </MemoryRouter>,
      )
    }
    async function openAndConfirm(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByRole('button', { name: 'Excluir minha conta' }))
      await user.type(screen.getByLabelText(/Digite EXCLUIR/), 'EXCLUIR')
      await user.type(screen.getByLabelText('Senha'), 'password1')
      await user.click(screen.getByRole('button', { name: 'Excluir definitivamente' }))
    }

    beforeEach(() => { reauth.mockReset().mockResolvedValue(undefined) })

    it('focuses the password field and needs word and password to enable', async () => {
      const user = userEvent.setup()
      renderMore()
      await user.click(screen.getByRole('button', { name: 'Excluir minha conta' }))
      const field = screen.getByLabelText('Senha')
      expect(field).toHaveAttribute('type', 'password')
      expect(field).toHaveAttribute('autocomplete', 'current-password')
      expect(field).toHaveFocus()
      await user.type(screen.getByLabelText(/Digite EXCLUIR/), 'EXCLUIR')
      expect(screen.getByRole('button', { name: 'Excluir definitivamente' })).toBeDisabled()
    })

    it('shows "Senha incorreta." and deletes nothing when the password is wrong', async () => {
      const user = userEvent.setup()
      deleteAccount.mockClear()
      reauth.mockRejectedValueOnce(new ApiError(401, 'senha incorreta'))
      renderMore()
      await openAndConfirm(user)
      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('Senha incorreta.')
      expect(alert).toHaveFocus()
      expect(deleteAccount).not.toHaveBeenCalled()
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('shows a network error without deleting', async () => {
      const user = userEvent.setup()
      deleteAccount.mockClear()
      reauth.mockRejectedValueOnce(new Error('Failed to fetch'))
      renderMore()
      await openAndConfirm(user)
      expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível confirmar sua senha')
      expect(deleteAccount).not.toHaveBeenCalled()
    })

    it('reopens the password step when the reauth window expired', async () => {
      const user = userEvent.setup()
      deleteAccount.mockResolvedValueOnce({ success: false, errors: ['Confirme sua senha para excluir a conta.'], reauthRequired: true })
      renderMore()
      await openAndConfirm(user)
      expect(await screen.findByRole('alert')).toHaveTextContent('Confirme sua senha para excluir a conta.')
      expect(screen.getByLabelText('Senha')).toHaveValue('')
      expect(screen.queryByText('Tela de entrada')).not.toBeInTheDocument()
    })

    it('requires the typed word before enabling the confirmation', async () => {
      const user = userEvent.setup()
      deleteAccount.mockClear()
      const { baseElement } = renderMore()
      await user.click(screen.getByRole('button', { name: 'Excluir minha conta' }))
      expect(screen.getByRole('dialog')).toHaveTextContent('Ex-membro')
      expect(screen.getByRole('button', { name: 'Excluir definitivamente' })).toBeDisabled()
      expect(await axeViolations(baseElement)).toEqual([])
      await user.type(screen.getByLabelText(/Digite EXCLUIR/), 'EXCLUIR')
      await user.type(screen.getByLabelText('Senha'), 'password1')
      expect(screen.getByRole('button', { name: 'Excluir definitivamente' })).toBeEnabled()
      expect(deleteAccount).not.toHaveBeenCalled()
    })

    it('blocks offline with a clear alert', async () => {
      const user = userEvent.setup()
      deleteAccount.mockClear()
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
      renderMore()
      await user.click(screen.getByRole('button', { name: 'Excluir minha conta' }))
      expect(screen.getByRole('alert')).toHaveTextContent('Sem conexão')
      await user.type(screen.getByLabelText(/Digite EXCLUIR/), 'EXCLUIR')
      await user.type(screen.getByLabelText('Senha'), 'password1')
      await user.click(screen.getByRole('button', { name: 'Excluir definitivamente' }))
      expect(reauth).not.toHaveBeenCalled()
      expect(deleteAccount).not.toHaveBeenCalled()
      vi.restoreAllMocks()
    })

    it('locks the dialog while deleting, so a double click sends one request', async () => {
      const user = userEvent.setup()
      let finish: (value: { success: false; errors: string[] }) => void = () => undefined
      deleteAccount.mockReset().mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
      renderMore()
      await openAndConfirm(user)
      const busyButton = screen.getByRole('button', { name: 'Excluindo…' })
      expect(busyButton).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
      await user.keyboard('{Escape}')
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(deleteAccount).toHaveBeenCalledTimes(1)
      finish({ success: false, errors: ['x'] })
      expect(await screen.findByRole('alert')).toHaveTextContent('x')
    })

    it('reacts to going offline while the dialog is open', async () => {
      const user = userEvent.setup()
      renderMore()
      await user.click(screen.getByRole('button', { name: 'Excluir minha conta' }))
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
      act(() => { window.dispatchEvent(new Event('offline')) })
      expect(screen.getByRole('alert')).toHaveTextContent('Sem conexão')
      vi.restoreAllMocks()
    })

    it('shows the sole-owner error and stays on the page', async () => {
      const user = userEvent.setup()
      deleteAccount.mockResolvedValueOnce({ success: false, errors: ['Transfira a propriedade antes de excluir a conta.'] })
      renderMore()
      await openAndConfirm(user)
      expect(await screen.findByRole('alert')).toHaveTextContent('Transfira a propriedade')
      expect(screen.queryByText('Tela de entrada')).not.toBeInTheDocument()
    })

    it('goes to /auth with the notice on success', async () => {
      const user = userEvent.setup()
      deleteAccount.mockResolvedValueOnce({ success: true })
      renderMore()
      await openAndConfirm(user)
      expect(await screen.findByText('Tela de entrada')).toBeInTheDocument()
    })
  })
})
