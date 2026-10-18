// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { axeViolations } from '../../test/axe'
import { ConsentGate } from './ConsentGate'

const acceptConsent = vi.fn()
vi.mock('../../auth/authContext', () => ({ useAuth: () => ({ acceptConsent, signOut: vi.fn() }) }))

describe('ConsentGate', () => {
  it('só aceita depois de marcar o checkbox e mostra falha do servidor', async () => {
    const user = userEvent.setup()
    acceptConsent.mockResolvedValueOnce({ success: false, errors: ['Sem conexão'] })
    const { container } = render(<MemoryRouter><ConsentGate /></MemoryRouter>)
    expect(await axeViolations(container)).toEqual([])
    const submit = screen.getByRole('button', { name: 'Aceitar e continuar' })
    expect(submit).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: 'Li e aceito a Política de Privacidade e os Termos de Uso' }))
    await user.click(submit)
    expect(acceptConsent).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão')
  })

  it('sucesso do re-aceite não mostra erro', async () => {
    const user = userEvent.setup()
    acceptConsent.mockClear()
    acceptConsent.mockResolvedValueOnce({ success: true })
    render(<MemoryRouter><ConsentGate /></MemoryRouter>)
    await user.click(screen.getByRole('checkbox', { name: 'Li e aceito a Política de Privacidade e os Termos de Uso' }))
    await user.click(screen.getByRole('button', { name: 'Aceitar e continuar' }))
    expect(acceptConsent).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
