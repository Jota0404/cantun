// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { Sheet } from './Sheet'

// jsdom não implementa showModal/close.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function close() { this.removeAttribute('open') }
})

describe('Sheet', () => {
  it('opens as a modal dialog named by its title', () => {
    render(<Sheet open title="Adicionar item" onClose={vi.fn()}><p>Conteúdo</p></Sheet>)
    expect(screen.getByRole('dialog', { name: 'Adicionar item' })).toHaveTextContent('Conteúdo')
  })

  it('renders nothing visible when closed', () => {
    render(<Sheet open={false} title="Adicionar item" onClose={vi.fn()}><p>Conteúdo</p></Sheet>)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('calls onClose from the Fechar button', async () => {
    const onClose = vi.fn()
    render(<Sheet open title="Adicionar item" onClose={onClose}><p>x</p></Sheet>)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Fechar' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose on the native cancel (Esc)', () => {
    const onClose = vi.fn()
    render(<Sheet open title="Adicionar item" onClose={onClose}><p>x</p></Sheet>)
    screen.getByRole('dialog').dispatchEvent(new Event('cancel', { cancelable: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
