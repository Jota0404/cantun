// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { Tabs } from './Tabs'

const ITEMS = [
  { value: 'a', label: 'Ordem', content: <p>Painel A</p> },
  { value: 'b', label: 'Equipe', content: <p>Painel B</p> },
  { value: 'c', label: 'Ensaio', content: <p>Painel C</p> },
]

function Harness() {
  const [value, setValue] = useState('a')
  return <Tabs label="Seções" items={ITEMS} value={value} onChange={setValue} />
}

describe('Tabs', () => {
  it('shows only the active panel, named by its tab', () => {
    render(<Harness />)
    expect(screen.getByRole('tab', { name: 'Ordem' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel', { name: 'Ordem' })).toHaveTextContent('Painel A')
    expect(screen.queryByText('Painel B')).not.toBeInTheDocument()
  })

  it('moves focus and selection with arrows, Home and End', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    screen.getByRole('tab', { name: 'Ordem' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Equipe' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'Equipe' })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Ensaio' })).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Ordem' })).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Ensaio' })).toHaveFocus()
    await user.keyboard('{Home}')
    expect(screen.getByRole('tab', { name: 'Ordem' })).toHaveFocus()
  })

  it('activates by click', async () => {
    render(<Harness />)
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Equipe' }))
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Painel B')
  })
})
