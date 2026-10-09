// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { confirmPasswordReset } from '../../platform/auth'
import { ResetPasswordPage } from './ResetPasswordPage'

vi.mock('../../platform/auth', () => ({ confirmPasswordReset: vi.fn() }))

function LoginStub() {
  const state = useLocation().state as { notice?: string } | null
  return <p>Login: {state?.notice}</p>
}

function renderAt(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
        <Route path="/auth" element={<LoginStub />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ResetPasswordPage', () => {
  beforeEach(() => { vi.mocked(confirmPasswordReset).mockReset() })

  it('saves the new password and sends the user to login', async () => {
    vi.mocked(confirmPasswordReset).mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderAt('/auth/reset-password?token=tok')

    await user.type(screen.getByLabelText('Nova senha'), 'senha-nova-123')
    await user.type(screen.getByLabelText('Confirmar nova senha'), 'senha-nova-123')
    await user.click(screen.getByRole('button', { name: 'Salvar nova senha' }))

    expect(confirmPasswordReset).toHaveBeenCalledWith('tok', 'senha-nova-123')
    expect(await screen.findByText(/Login: Senha redefinida/)).toBeInTheDocument()
  })

  it('blocks mismatched passwords', async () => {
    const user = userEvent.setup()
    renderAt('/auth/reset-password?token=tok')

    await user.type(screen.getByLabelText('Nova senha'), 'senha-nova-123')
    await user.type(screen.getByLabelText('Confirmar nova senha'), 'outra-senha-123')
    await user.click(screen.getByRole('button', { name: 'Salvar nova senha' }))

    expect(screen.getByRole('alert')).toHaveTextContent('As senhas não conferem.')
    expect(confirmPasswordReset).not.toHaveBeenCalled()
  })

  it('enforces 8 to 128 characters', () => {
    renderAt('/auth/reset-password?token=tok')

    const input = screen.getByLabelText('Nova senha')
    expect(input).toHaveAttribute('minlength', '8')
    expect(input).toHaveAttribute('maxlength', '128')
  })

  it('shows the server error for an expired token', async () => {
    vi.mocked(confirmPasswordReset).mockRejectedValue(new Error('Link inválido ou expirado.'))
    const user = userEvent.setup()
    renderAt('/auth/reset-password?token=old')

    await user.type(screen.getByLabelText('Nova senha'), 'senha-nova-123')
    await user.type(screen.getByLabelText('Confirmar nova senha'), 'senha-nova-123')
    await user.click(screen.getByRole('button', { name: 'Salvar nova senha' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Link inválido ou expirado.')
    expect(screen.getByRole('link', { name: 'Pedir um novo link' })).toHaveAttribute('href', '/auth/forgot-password')
  })

  it('rejects a link without token', () => {
    renderAt('/auth/reset-password')

    expect(screen.getByRole('alert')).toHaveTextContent(/token não foi informado/)
    expect(screen.queryByLabelText('Nova senha')).not.toBeInTheDocument()
  })
})
