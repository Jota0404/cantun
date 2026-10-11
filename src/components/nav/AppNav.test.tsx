// @vitest-environment jsdom

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { axeViolations } from '../../test/axe'
import { AppNav } from './AppNav'

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AppNav /><Routes><Route path="*" element={<p>conteúdo</p>} /></Routes></MemoryRouter>)
}

describe('AppNav', () => {
  it('shows the five destinations, in order, with text', () => {
    renderAt('/')
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
    expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual(['Início', 'Serviços', 'Músicas', 'Bandas', 'Mais'])
  })

  it.each([
    ['/', 'Início'],
    ['/meus-servicos', 'Serviços'],
    ['/services/abc', 'Serviços'],
    ['/songs/new', 'Músicas'],
    ['/organizations/o1/teams/t1', 'Bandas'],
    ['/repertoires', 'Mais'],
  ])('marks the current destination for %s', (path, label) => {
    renderAt(path)
    const current = screen.getAllByRole('link').filter((link) => link.getAttribute('aria-current') === 'page')
    expect(current.map((link) => link.textContent)).toEqual([label])
  })

  it('navigates by link and moves the current marker', async () => {
    renderAt('/')
    await userEvent.setup().click(screen.getByRole('link', { name: 'Músicas' }))
    expect(screen.getByRole('link', { name: 'Músicas' })).toHaveAttribute('aria-current', 'page')
  })

  it('has no accessibility violations', async () => {
    const { container } = renderAt('/')
    expect(await axeViolations(container)).toEqual([])
  })
})
