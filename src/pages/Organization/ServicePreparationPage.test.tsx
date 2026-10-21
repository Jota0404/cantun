// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ServicePreparationPage } from './ServicePreparationPage'

const m = vi.hoisted(() => ({ get: vi.fn(), impl: undefined as undefined | (() => Promise<unknown>) }))
vi.mock('../../application/services/memberPreparationView', () => ({ getMemberPreparationView: (id: string) => (m.impl ? m.impl() : m.get(id)) }))

const view = (over = {}) => ({
  success: true,
  view: {
    serviceId: 's1', serviceName: 'Culto de domingo', startsAt: '2026-11-01T10:00:00.000Z', myFunction: 'Violão',
    items: [
      { id: 'i1', type: 'song', songId: 'sg1', title: 'Grande é o Senhor', artist: 'Ana', effectiveKey: 'D', bpm: 72, notes: 'Entrada suave' },
      { id: 'i2', type: 'reprise', title: 'Refrão final', refPosition: 2 },
    ],
    serviceNotes: 'Chegar às 9h', rehearsals: [], materials: [], ...over,
  },
})
const renderPage = () => render(<MemoryRouter initialEntries={['/services/s1/prepare']}><Routes><Route path="/services/:serviceId/prepare" element={<ServicePreparationPage />} /></Routes></MemoryRouter>)

describe('ServicePreparationPage', () => {
  beforeEach(() => { m.get.mockReset(); m.impl = undefined })
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
})
