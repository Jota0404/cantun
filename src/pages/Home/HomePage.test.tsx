// @vitest-environment jsdom

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { HomePage } from './HomePage'

const home = vi.hoisted(() => ({ fail: false, summary: { hasOrganization: true, pendingConfirmations: [], managedGaps: [] } as Record<string, unknown> }))
vi.mock('../../application/sync/remoteData', () => ({ onRemoteDataApplied: () => () => undefined }))
vi.mock('../../application/home/getHomeSummary', () => ({ getHomeSummary: async () => { if (home.fail) throw new Error('x'); return home.summary } }))

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
    home.summary = { hasOrganization: true, pendingConfirmations: [], managedGaps: [{ service: { id: 'sv1', name: 'Culto de domingo', startsAt: '2026-10-11T22:00:00.000Z' }, openCount: 2, missingTotal: 3 }] }
    render(<MemoryRouter><HomePage /></MemoryRouter>)
    const section = await screen.findByRole('region', { name: 'Escalas com vagas abertas' })
    expect(within(section).getByRole('link', { name: 'Culto de domingo' })).toHaveAttribute('href', '/services/sv1')
    expect(within(section).getByText('Faltam 3 pessoa(s) em 2 vaga(s)')).toBeInTheDocument()
    home.summary = { hasOrganization: true, pendingConfirmations: [], managedGaps: [] }
  })

  it('shows onboarding without organization', async () => {
    home.summary = { hasOrganization: false, pendingConfirmations: [], managedGaps: [] }
    render(<MemoryRouter><HomePage /></MemoryRouter>)
    expect(await screen.findByRole('link', { name: 'Ir para organizações' })).toHaveAttribute('href', '/organizations')
  })

  it('shows next service, pending confirmations and live stage', async () => {
    const service = { id: 'sv1', name: 'Culto de domingo', startsAt: '2026-10-11T22:00:00.000Z', status: 'ready', location: 'Templo central' }
    const mine = { assignment: { id: 'a1', musicalFunction: 'Violão', status: 'invited' }, service, songTitles: [] }
    home.summary = { hasOrganization: true, nextService: mine, pendingConfirmations: [mine], managedGaps: [], liveStage: { stageSessionId: 'st1', service } }
    render(<MemoryRouter><HomePage /></MemoryRouter>)
    const next = await screen.findByRole('region', { name: 'Próximo serviço' })
    expect(within(next).getByText('Violão')).toBeInTheDocument()
    expect(within(next).getByText('Templo central')).toBeInTheDocument()
    expect(within(next).getByText('Convidado, aguardando resposta')).toBeInTheDocument()
    expect(within(next).getByText('Serviço: Pronto')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Confirmações pendentes' })).getByText(/Aguardando sua resposta/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Abrir Modo Palco/ })).toHaveAttribute('href', '/stage/service-session/st1')
    home.summary = { hasOrganization: true, pendingConfirmations: [], managedGaps: [] }
  })

  it('shows an alert when loading fails', async () => {
    home.fail = true
    render(<MemoryRouter><HomePage /></MemoryRouter>)
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar.')
    home.fail = false
  })
})
