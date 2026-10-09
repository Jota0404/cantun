// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EmailVerificationNotice } from './EmailVerificationNotice'

describe('EmailVerificationNotice', () => {
  it('explains why verification matters when the e-mail is not verified', () => {
    render(<EmailVerificationNotice user={{ id: 'u1', email: 'ana@example.com', emailVerified: false }} />)

    expect(screen.getByRole('note')).toHaveTextContent(/E-mail não verificado.*ana@example.com.*aceitar convites/)
  })

  it('renders nothing for verified or anonymous users', () => {
    const { rerender } = render(<EmailVerificationNotice user={{ id: 'u1', email: 'ana@example.com', emailVerified: true }} />)
    expect(screen.queryByRole('note')).not.toBeInTheDocument()

    rerender(<EmailVerificationNotice user={null} />)
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })
})
