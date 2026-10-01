// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { HomePage } from './HomePage'

function CurrentLocation() {
  return <p>{useLocation().pathname}</p>
}

describe('HomePage', () => {
  it('shows the main entry points of CANTUM', () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Tudo pronto para a próxima música.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrir biblioteca' })).toHaveAttribute('href', '/songs')
    expect(screen.getByRole('link', { name: /Suas músicas/ })).toHaveAttribute('href', '/songs')
    expect(screen.getByRole('link', { name: /Organize seus repertórios/ })).toHaveAttribute('href', '/repertoires')
    expect(screen.getByRole('link', { name: /Nova música/ })).toHaveAttribute('href', '/songs/new')
    expect(screen.getByRole('link', { name: /Importar cifra/ })).toHaveAttribute('href', '/songs/import')
  })

  it('navigates to the selected entry point', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="*" element={<CurrentLocation />} />
        </Routes>
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('link', { name: 'Abrir biblioteca' }))

    expect(screen.getByText('/songs')).toBeInTheDocument()
  })
})
