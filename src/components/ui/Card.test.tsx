// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Card } from './Card'

describe('Card', () => {
  it('renders children and forwards props', () => {
    render(<Card aria-label="Resumo">Conteúdo</Card>)
    expect(screen.getByLabelText('Resumo')).toHaveTextContent('Conteúdo')
  })
})
