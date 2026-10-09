// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AuthContextValue } from '../../auth/authContext'
import { EmailVerificationNotice } from './EmailVerificationNotice'

let user: AuthContextValue['user'] = null
vi.mock('../../auth/authContext', () => ({ useAuth: () => ({ user }) }))

describe('EmailVerificationNotice', () => {
  it('explains why verification matters when the e-mail is not verified', () => {
    user = { id: 'u1', email: 'ana@example.com', emailVerified: false }
    render(<EmailVerificationNotice />)

    expect(screen.getByRole('note')).toHaveTextContent(/E-mail não verificado.*ana@example.com.*aceitar convites/)
  })

  it('renders nothing for verified or anonymous users', () => {
    user = { id: 'u1', email: 'ana@example.com', emailVerified: true }
    const { rerender } = render(<EmailVerificationNotice />)
    expect(screen.queryByRole('note')).not.toBeInTheDocument()

    user = null
    rerender(<EmailVerificationNotice />)
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })
})
