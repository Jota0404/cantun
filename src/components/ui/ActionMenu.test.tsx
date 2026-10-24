// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ActionMenu } from './ActionMenu'

function setup() {
  const onDelete = vi.fn()
  const onEdit = vi.fn()
  render(
    <>
      <ActionMenu label="Mais ações do serviço" items={[{ label: 'Excluir', danger: true, onSelect: onDelete }, { label: 'Editar', onSelect: onEdit }, { label: 'Duplicar', onSelect: vi.fn() }]} />
      <button type="button">fora</button>
    </>,
  )
  return { onDelete, onEdit, user: userEvent.setup() }
}

describe('ActionMenu', () => {
  it('exposes the trigger state and lists danger items last', async () => {
    const { user } = setup()
    const trigger = screen.getByRole('button', { name: 'Mais ações do serviço' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Editar', 'Duplicar', 'Excluir'])
  })

  it('navigates with arrows and selects an item', async () => {
    const { user, onEdit } = setup()
    await user.click(screen.getByRole('button', { name: 'Mais ações do serviço' }))
    expect(screen.getByRole('menuitem', { name: 'Editar' })).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Duplicar' })).toHaveFocus()
    await user.keyboard('{ArrowUp}{Enter}')
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes on Escape returning focus, and on outside click', async () => {
    const { user } = setup()
    const trigger = screen.getByRole('button', { name: 'Mais ações do serviço' })
    await user.click(trigger)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    await user.click(trigger)
    await user.click(screen.getByRole('button', { name: 'fora' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
