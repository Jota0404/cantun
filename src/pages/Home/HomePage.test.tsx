// @vitest-environment jsdom

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { HomePage } from './HomePage'

const gaps = vi.hoisted(() => ({ list: [] as unknown[] }))
vi.mock('../../application/sync/remoteData', () => ({ onRemoteDataApplied: () => () => undefined }))
vi.mock('../../application/services/scheduleService', () => ({ listManagedServiceGaps: async () => gaps.list }))

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

  it('shows open positions of upcoming services I manage, with a link', async () => {
    gaps.list = [{ service: { id: 'sv1', name: 'Culto de domingo', startsAt: '2026-10-11T22:00:00.000Z' }, openCount: 2, missingTotal: 3 }]
    render(<MemoryRouter><HomePage /></MemoryRouter>)
    const section = await screen.findByRole('region', { name: 'Escalas com vagas abertas' })
    expect(within(section).getByRole('link', { name: 'Culto de domingo' })).toHaveAttribute('href', '/services/sv1')
    expect(within(section).getByText('Faltam 3 pessoa(s) em 2 vaga(s)')).toBeInTheDocument()
    gaps.list = []
  })
})
