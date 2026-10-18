// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { axeViolations } from '../../test/axe'
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
    await user.click(screen.getByRole('checkbox', { name: 'Li e aceito a Política de Privacidade e os Termos de Uso' }))
    await user.click(screen.getByRole('button', { name: 'Criar conta' }))
    expect(signUp).toHaveBeenCalledWith('ana@example.com', 'senha-segura', 'Ana')
  })

  it('exige o aceite de Política e Termos para criar a conta, com links para os textos', async () => {
    const user = userEvent.setup()
    signUp.mockClear()
    const { container } = render(<MemoryRouter><AuthPage /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: 'Ainda não tenho uma conta' }))
    const consent = screen.getByRole('checkbox', { name: 'Li e aceito a Política de Privacidade e os Termos de Uso' })
    expect(consent).toBeRequired()
    expect(consent).not.toBeChecked()
    expect(screen.getAllByRole('link', { name: 'Política de Privacidade' })[0]).toHaveAttribute('href', '/privacidade')
    expect(screen.getAllByRole('link', { name: 'Termos de Uso' })[0]).toHaveAttribute('href', '/termos')
    await user.type(screen.getByLabelText('Nome'), 'Ana')
    await user.type(screen.getByLabelText('E-mail'), 'ana@example.com')
    await user.type(screen.getByLabelText('Senha'), 'senha-segura')
    await user.click(screen.getByRole('button', { name: 'Criar conta' }))
    expect(signUp).not.toHaveBeenCalled()
    expect(await axeViolations(container)).toEqual([])
  })
})
