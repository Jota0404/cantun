// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Badge } from './Badge'

describe('Badge', () => {
  it('always shows the state as text', () => {
    render(<Badge tone="success">Confirmado</Badge>)
    expect(screen.getByText('Confirmado')).toBeInTheDocument()
  })

  it('attention and danger carry a shape besides color, hidden from assistive tech', () => {
    const { rerender } = render(<Badge tone="attention">Vaga aberta</Badge>)
    expect(screen.getByText('▲')).toHaveAttribute('aria-hidden', 'true')
    rerender(<Badge tone="danger">Recusou</Badge>)
    expect(screen.getByText('✕')).toHaveAttribute('aria-hidden', 'true')
  })
})
