// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AuthPage } from './AuthPage'

const signUp = vi.fn(async () => undefined)
vi.mock('../../auth/authContext', () => ({ useAuth: () => ({ user: null, loading: false, configured: true, signIn: vi.fn(), signUp }) }))

describe('AuthPage', () => {
  it('requires a display name to sign up and sends it trimmed', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><AuthPage /></MemoryRouter>)
    expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ainda não tenho uma conta' }))
    const name = screen.getByLabelText('Nome')
    expect(name).toBeRequired()
    expect(name).toHaveAttribute('maxlength', '80')

    await user.type(name, '  Ana  ')
    await user.type(screen.getByLabelText('E-mail'), 'ana@example.com')
    await user.type(screen.getByLabelText('Senha'), 'senha-segura')
    await user.click(screen.getByRole('button', { name: 'Criar conta' }))
    expect(signUp).toHaveBeenCalledWith('ana@example.com', 'senha-segura', 'Ana')
  })
})
