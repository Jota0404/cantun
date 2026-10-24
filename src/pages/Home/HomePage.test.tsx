// @vitest-environment jsdom

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HomePage } from './HomePage'

const home = vi.hoisted(() => ({ fail: false, summary: { hasOrganization: true, pendingConfirmations: [], managedGaps: [] } as Record<string, unknown> }))
vi.mock('../../application/sync/remoteData', () => ({ onRemoteDataApplied: () => () => undefined }))
vi.mock('../../application/home/getHomeSummary', () => ({ getHomeSummary: async () => { if (home.fail) throw new Error('x'); return home.summary } }))
const respond = vi.hoisted(() => ({ confirm: vi.fn(), decline: vi.fn() }))
vi.mock('../../application/services/scheduleService', () => ({ confirmAssignment: respond.confirm, declineAssignment: respond.decline }))
const net = vi.hoisted(() => ({ online: true }))
vi.mock('../../components/schedule/useOnline', () => ({ useOnline: () => net.online }))
vi.mock('../../components/home/ActivityPanel', () => ({ ActivityPanel: () => <section aria-label="Atividade" /> }))

function CurrentLocation() {
  return <p>{useLocation().pathname}</p>
}

const service = { id: 'sv1', name: 'Culto de domingo', startsAt: '2026-10-11T22:00:00.000Z', status: 'ready', location: 'Templo central' }
const mine = { assignment: { id: 'a1', musicalFunction: 'acoustic-guitar', status: 'invited' }, service, songTitles: [] }
const empty = { hasOrganization: true, pendingConfirmations: [], managedGaps: [] }

describe('HomePage', () => {
  beforeEach(() => { home.summary = empty; home.fail = false; net.online = true; respond.confirm.mockReset(); respond.decline.mockReset() })

  it('has no marketing hero nor quick-access grid', async () => {
    render(<MemoryRouter><HomePage /></MemoryRouter>)
    expect(await screen.findByText('Nada pendente por aqui.')).toBeInTheDocument()
    expect(screen.queryByText('Abrir biblioteca')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Comece por aqui' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver Serviços' })).toHaveAttribute('href', '/servicos')
    expect(screen.getByRole('region', { name: 'Atividade' })).toBeInTheDocument()
  })

  it('without organization offers a primary action to Bandas', async () => {
    home.summary = { hasOrganization: false, pendingConfirmations: [], managedGaps: [] }
    const user = userEvent.setup()
    render(<MemoryRouter initialEntries={['/']}><Routes><Route path="/" element={<HomePage />} /><Route path="*" element={<CurrentLocation />} /></Routes></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Comece pelo seu Ministério' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Atividade' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Criar meu Ministério/ }))
    expect(screen.getByText('/bandas')).toBeInTheDocument()
  })

  it('shows the live stage with text label and opens it', async () => {
    home.summary = { ...empty, liveStage: { stageSessionId: 'st1', service } }
    const user = userEvent.setup()
    render(<MemoryRouter initialEntries={['/']}><Routes><Route path="/" element={<HomePage />} /><Route path="*" element={<CurrentLocation />} /></Routes></MemoryRouter>)
    const live = await screen.findByRole('region', { name: 'Palco ao vivo' })
    expect(within(live).getByText(/AO VIVO/)).toBeInTheDocument()
    await user.click(within(live).getByRole('button', { name: 'Abrir Palco' }))
    expect(screen.getByText('/stage/service-session/st1')).toBeInTheDocument()
  })

  it('answers a pending invite with the schedule use case and reloads the summary', async () => {
    home.summary = { ...empty, pendingConfirmations: [mine] }
    respond.confirm.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<MemoryRouter><HomePage /></MemoryRouter>)
    const pending = await screen.findByRole('region', { name: 'Convites pendentes' })
    expect(within(pending).getByText('Violão')).toBeInTheDocument()
    home.summary = empty
    await user.click(within(pending).getByRole('button', { name: /Confirmar/ }))
    expect(respond.confirm).toHaveBeenCalledWith('a1')
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Convites pendentes' })).not.toBeInTheDocument())
  })

  it('declines a pending invite and shows a failure', async () => {
    home.summary = { ...empty, pendingConfirmations: [mine] }
    respond.decline.mockResolvedValue({ success: false, errors: ['Não foi possível.'] })
    const user = userEvent.setup()
    render(<MemoryRouter><HomePage /></MemoryRouter>)
    await user.click(await screen.findByRole('button', { name: /Recusar/ }))
    expect(respond.decline).toHaveBeenCalledWith('a1')
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível.')
  })

  it('shows the next service with Preparar and Ver serviço', async () => {
    home.summary = { ...empty, nextService: { ...mine, assignment: { ...mine.assignment, status: 'confirmed' } } }
    const user = userEvent.setup()
    render(<MemoryRouter initialEntries={['/']}><Routes><Route path="/" element={<HomePage />} /><Route path="*" element={<CurrentLocation />} /></Routes></MemoryRouter>)
    const next = await screen.findByRole('region', { name: 'Próximo serviço' })
    expect(within(next).getByRole('link', { name: 'Culto de domingo' })).toHaveAttribute('href', '/services/sv1')
    expect(within(next).getByText('Templo central')).toBeInTheDocument()
    expect(within(next).getByText('Confirmado')).toBeInTheDocument()
    expect(within(next).getByText('Serviço: Pronto')).toBeInTheDocument()
    expect(within(next).getByRole('button', { name: 'Ver serviço' })).toBeInTheDocument()
    await user.click(within(next).getByRole('button', { name: 'Preparar' }))
    expect(screen.getByText('/services/sv1/prepare')).toBeInTheDocument()
  })

  it.each([
    [1, 1, 'Falta 1 pessoa em 1 vaga', '1 vaga em 1 serviço'],
    [3, 2, 'Faltam 3 pessoas em 2 vagas', '3 vagas em 1 serviço'],
  ])('uses real singular/plural for open positions (%i people, %i slots)', async (missingTotal, openCount, line, summaryLine) => {
    home.summary = { ...empty, managedGaps: [{ service, openCount, missingTotal }] }
    render(<MemoryRouter><HomePage /></MemoryRouter>)
    const section = await screen.findByRole('region', { name: 'Vagas abertas' })
    expect(within(section).getByRole('link', { name: 'Culto de domingo' })).toHaveAttribute('href', '/services/sv1')
    expect(within(section).getByText(line)).toBeInTheDocument()
    expect(within(section).getByText(summaryLine)).toBeInTheDocument()
  })

  it('shows an alert when loading fails', async () => {
    home.fail = true
    render(<MemoryRouter><HomePage /></MemoryRouter>)
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar.')
  })

  it('orders the cards: live stage, pending invites, next service, open positions', async () => {
    home.summary = { ...empty, liveStage: { stageSessionId: 'st1', service }, pendingConfirmations: [mine], nextService: mine, managedGaps: [{ service, openCount: 1, missingTotal: 1 }] }
    render(<MemoryRouter><HomePage /></MemoryRouter>)
    const names = ['Palco ao vivo', 'Convites pendentes', 'Próximo serviço', 'Vagas abertas']
    const regions = await Promise.all(names.map((name) => screen.findByRole('region', { name })))
    regions.slice(1).forEach((region, index) => {
      expect(regions[index].compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })
  })

  it('disables answering invites offline and says why', async () => {
    net.online = false
    home.summary = { ...empty, pendingConfirmations: [mine] }
    render(<MemoryRouter><HomePage /></MemoryRouter>)
    expect(await screen.findByRole('button', { name: /Confirmar/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Recusar/ })).toBeDisabled()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
