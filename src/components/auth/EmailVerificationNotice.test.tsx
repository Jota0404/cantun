// @vitest-environment jsdom

import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AuthContextValue } from '../../auth/authContext'
import { EmailVerificationNotice } from './EmailVerificationNotice'

let user: AuthContextValue['user'] = null
const resendVerification = vi.fn()
vi.mock('../../auth/authContext', () => ({ useAuth: () => ({ user, resendVerification }) }))

describe('EmailVerificationNotice', () => {
  it('explains why verification matters when the e-mail is not verified', () => {
    user = { id: 'u1', email: 'ana@example.com', emailVerified: false, displayName: 'Ana' }
    render(<EmailVerificationNotice />)

    expect(screen.getByRole('note')).toHaveTextContent(/E-mail não verificado.*ana@example.com.*aceitar convites/)
  })

  it('renders nothing for verified or anonymous users', () => {
    user = { id: 'u1', email: 'ana@example.com', emailVerified: true, displayName: 'Ana' }
    const { rerender } = render(<EmailVerificationNotice />)
    expect(screen.queryByRole('note')).not.toBeInTheDocument()

    user = null
    rerender(<EmailVerificationNotice />)
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('resends the e-mail and disables the button for 60 s', async () => {
    vi.useFakeTimers()
    resendVerification.mockResolvedValue(undefined)
    user = { id: 'u1', email: 'ana@example.com', emailVerified: false, displayName: 'Ana' }
    render(<EmailVerificationNotice />)
    const button = screen.getByRole('button', { name: 'Reenviar e-mail' })

    await act(async () => { fireEvent.click(button) })

    expect(resendVerification).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).toHaveTextContent('Se for possível, enviamos um novo link.')
    expect(button).toBeDisabled()
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(button).toBeEnabled()
    vi.useRealTimers()
  })
})
