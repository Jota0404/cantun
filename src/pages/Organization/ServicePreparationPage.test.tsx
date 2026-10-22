// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ServicePreparationPage } from './ServicePreparationPage'

const rd = vi.hoisted(() => ({ cb: undefined as undefined | (() => void) }))
vi.mock('../../application/sync/remoteData', () => ({ onRemoteDataApplied: (f: () => void) => { rd.cb = f; return () => undefined } }))
const m = vi.hoisted(() => ({ get: vi.fn(), impl: undefined as undefined | (() => Promise<unknown>) }))
vi.mock('../../application/services/memberPreparationView', () => ({ getMemberPreparationView: (id: string) => (m.impl ? m.impl() : m.get(id)) }))

const sp = vi.hoisted(() => ({ set: vi.fn(), sum: vi.fn() }))
vi.mock('../../application/services/servicePreparationService', () => ({ setPreparation: sp.set, getPreparationSummary: sp.sum }))
const team = { success: true, summary: { canSeeTeam: true, preparedCount: 1, totalCount: 2, people: [{ userId: 'a', name: 'Ana', prepared: true }, { userId: 'b', name: 'Beto', prepared: false }] } }

const view = (over = {}) => ({
  success: true,
  view: {
    serviceId: 's1', serviceName: 'Culto de domingo', startsAt: '2026-11-01T10:00:00.000Z', myFunction: 'Violão',
    items: [
      { id: 'i1', type: 'song', songId: 'sg1', title: 'Grande é o Senhor', artist: 'Ana', effectiveKey: 'D', bpm: 72, notes: 'Entrada suave' },
      { id: 'i2', type: 'reprise', title: 'Refrão final', refPosition: 2 },
    ],
    prepared: false, serviceNotes: 'Chegar às 9h', rehearsals: [], materials: [], ...over,
  },
})
const renderPage = () => render(<MemoryRouter initialEntries={['/services/s1/prepare']}><Routes><Route path="/services/:serviceId/prepare" element={<ServicePreparationPage />} /></Routes></MemoryRouter>)

describe('ServicePreparationPage', () => {
  beforeEach(() => { m.get.mockReset(); m.impl = undefined; sp.set.mockReset(); sp.sum.mockReset(); sp.sum.mockResolvedValue({ success: true, summary: { canSeeTeam: false, preparedCount: 0, totalCount: 0, people: [] } }) })
  afterEach(cleanup)

  it('mostra função, tom, BPM, observações e reprise', async () => {
    m.get.mockResolvedValue(view())
    renderPage()
    expect(await screen.findByText('Sua função: Violão')).toBeTruthy()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText(/Tom: D · 72 BPM/)).toBeTruthy()
    expect(screen.getByText('Observações: Entrada suave')).toBeTruthy()
    expect(screen.getByText(/Reprise/)).toBeTruthy()
    expect(screen.getByText('Chegar às 9h')).toBeTruthy()
    expect(screen.queryByText('Ensaios')).toBeNull()
    expect(screen.getByRole('link', { name: 'Grande é o Senhor' }).getAttribute('href')).toBe('/songs/sg1')
    expect(screen.getByText(/volta da posição 2/)).toBeTruthy()
  })

  it('mostra o ensaio com músicas em foco', async () => {
    m.get.mockResolvedValue(view({ rehearsals: [{ id: 'r1', serviceId: 's1', startsAt: '2026-10-30T20:00:00.000Z', location: 'Sala 2', notes: 'Trazer capo', songs: [{ serviceItemId: 'i1', title: 'Grande é o Senhor', position: 1 }] }] }))
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Ensaio' })).toBeTruthy()
    expect(screen.getByText(/Sala 2/)).toBeTruthy()
    expect(screen.getByText('Trazer capo')).toBeTruthy()
    expect(screen.getByText('Músicas em foco: Grande é o Senhor')).toBeTruthy()
  })

  it('sem escala', async () => {
    m.get.mockResolvedValue(view({ myFunction: null }))
    renderPage()
    expect(await screen.findByText('Sem escala neste serviço')).toBeTruthy()
  })

  it('erro e acesso negado', async () => {
    m.get.mockResolvedValue({ success: false, errors: ['Você não tem acesso a este serviço.'] })
    renderPage()
    expect((await screen.findByRole('alert')).textContent).toContain('não tem acesso')
  })

  it('falha inesperada', async () => {
    m.impl = () => Promise.reject(new Error('x'))
    renderPage()
    expect((await screen.findByRole('alert')).textContent).toBe('Não foi possível carregar a preparação.')
  })

  it('marca e desmarca preparado', async () => {
    m.get.mockResolvedValue(view())
    sp.set.mockResolvedValue({ success: true })
    renderPage()
    const btn = await screen.findByRole('button', { name: 'Preparado' })
    expect(btn.getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText('Ainda não marcado')).toBeTruthy()
    fireEvent.click(btn)
    await waitFor(() => expect(btn.getAttribute('aria-pressed')).toBe('true'))
    expect(sp.set).toHaveBeenLastCalledWith('s1', true)
    expect(screen.getByText('Você já marcou como preparado')).toBeTruthy()
    fireEvent.click(btn)
    await waitFor(() => expect(btn.getAttribute('aria-pressed')).toBe('false'))
    expect(sp.set).toHaveBeenLastCalledWith('s1', false)
  })

  it('mostra erro ao marcar e mantém o botão', async () => {
    m.get.mockResolvedValue(view())
    sp.set.mockResolvedValue({ success: false, errors: ['Serviço encerrado.'] })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Preparado' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Serviço encerrado.')
    expect(screen.getByRole('button', { name: 'Preparado' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('Líder vê contagem e lista; membro comum não', async () => {
    m.get.mockResolvedValue(view())
    sp.sum.mockResolvedValue(team)
    renderPage()
    expect(await screen.findByText('1 de 2 preparados')).toBeTruthy()
    expect(screen.getByText('Ana · preparado')).toBeTruthy()
    expect(screen.getByText('Beto · ainda não')).toBeTruthy()
    cleanup()
    sp.sum.mockResolvedValue({ success: true, summary: { ...team.summary, canSeeTeam: false } })
    renderPage()
    await screen.findByRole('button', { name: 'Preparado' })
    expect(screen.queryByText(/Preparação da equipe/)).toBeNull()
    expect(screen.queryByText('Beto · ainda não')).toBeNull()
  })

  it('recarrega após pull remoto', async () => {
    m.get.mockResolvedValue(view())
    renderPage()
    await screen.findByText('Ainda não marcado')
    m.get.mockResolvedValue(view({ prepared: true }))
    rd.cb?.()
    expect(await screen.findByText('Você já marcou como preparado')).toBeTruthy()
  })
})
