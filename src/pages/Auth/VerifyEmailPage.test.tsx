// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VerifyEmailPage } from './VerifyEmailPage'

const verifyEmail = vi.fn()
vi.mock('../../auth/authContext', () => ({ useAuth: () => ({ user: null, verifyEmail }) }))

function renderAt(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes><Route path="/auth/verify-email" element={<VerifyEmailPage />} /></Routes>
    </MemoryRouter>,
  )
}

describe('VerifyEmailPage', () => {
  beforeEach(() => { verifyEmail.mockReset() })

  it('verifies the token once', async () => {
    verifyEmail.mockResolvedValue(undefined)
    renderAt('/auth/verify-email?token=abc')

    expect(await screen.findByText(/E-mail confirmado/)).toBeInTheDocument()
    expect(verifyEmail).toHaveBeenCalledTimes(1)
    expect(verifyEmail).toHaveBeenCalledWith('abc')
    expect(screen.getByRole('link', { name: 'Ir para o login' })).toHaveAttribute('href', '/auth')
  })

  it('shows the server error', async () => {
    verifyEmail.mockRejectedValue(new Error('Link inválido ou expirado.'))
    renderAt('/auth/verify-email?token=old')

    expect(await screen.findByRole('alert')).toHaveTextContent('Link inválido ou expirado.')
  })

  it('rejects a link without token', () => {
    renderAt('/auth/verify-email')

    expect(screen.getByRole('alert')).toHaveTextContent(/token não foi informado/)
    expect(verifyEmail).not.toHaveBeenCalled()
  })
})
