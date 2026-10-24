// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './Button'

describe('Button', () => {
  it('defaults to type button and secondary variant', () => {
    render(<Button>Salvar</Button>)
    const button = screen.getByRole('button', { name: 'Salvar' })
    expect(button).toHaveAttribute('type', 'button')
    expect(button).toHaveClass('ui-button--secondary')
  })

  it('forwards native props and variant', async () => {
    const onClick = vi.fn()
    render(<Button variant="danger" onClick={onClick}>Excluir</Button>)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Excluir' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('respects disabled', () => {
    render(<Button disabled>Salvar</Button>)
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled()
  })
})
