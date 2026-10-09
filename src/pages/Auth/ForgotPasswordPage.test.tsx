// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requestPasswordReset } from '../../platform/auth'
import { ForgotPasswordPage } from './ForgotPasswordPage'

vi.mock('../../platform/auth', () => ({ requestPasswordReset: vi.fn() }))

describe('ForgotPasswordPage', () => {
  beforeEach(() => { vi.mocked(requestPasswordReset).mockReset() })

  it('always shows the neutral confirmation after requesting', async () => {
    vi.mocked(requestPasswordReset).mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>)

    await user.type(screen.getByLabelText('E-mail'), 'ana@example.com')
    await user.click(screen.getByRole('button', { name: 'Enviar link' }))

    expect(requestPasswordReset).toHaveBeenCalledWith('ana@example.com')
    expect(await screen.findByRole('status')).toHaveTextContent('Se a conta existir, enviamos um link para redefinir a senha.')
    expect(screen.getByRole('link', { name: 'Voltar para o login' })).toHaveAttribute('href', '/auth')
  })

  it('shows network errors', async () => {
    vi.mocked(requestPasswordReset).mockRejectedValue(new Error('Falha de rede.'))
    const user = userEvent.setup()
    render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>)

    await user.type(screen.getByLabelText('E-mail'), 'ana@example.com')
    await user.click(screen.getByRole('button', { name: 'Enviar link' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Falha de rede.')
  })
})
