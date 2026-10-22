import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { SongHistoryPanel } from './SongHistoryPanel'
import { getSongHistory } from '../../application/services/executionHistoryService'

vi.mock('../../application/services/executionHistoryService', () => ({ getSongHistory: vi.fn() }))

describe('SongHistoryPanel', () => {
  it('mostra frequência, tons e últimos serviços com link', async () => {
    vi.mocked(getSongHistory).mockResolvedValue({ success: true, history: {
      lastPlayedAt: '2026-10-04T13:00:00Z', playsLast12Months: 3, keys: [{ key: 'G', count: 2 }, { key: 'A', count: 1 }],
      recent: [{ serviceId: 's1', serviceName: 'Culto de domingo', startsAt: '2026-10-04T13:00:00Z', completedAt: '2026-10-04T15:00:00Z', key: 'G' }],
    } })
    render(<MemoryRouter><SongHistoryPanel songId="a" /></MemoryRouter>)
    expect(await screen.findByText('Tocada 3 vezes nos últimos 12 meses')).toBeInTheDocument()
    expect(screen.getByText('G: 2')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Culto de domingo' })).toHaveAttribute('href', '/services/s1')
  })

  it('sem registro e offline', async () => {
    vi.mocked(getSongHistory).mockResolvedValueOnce({ success: true, history: { lastPlayedAt: null, playsLast12Months: 0, keys: [], recent: [] } })
    const { unmount } = render(<MemoryRouter><SongHistoryPanel songId="a" /></MemoryRouter>)
    expect(await screen.findByText('Ainda não tocada em um serviço')).toBeInTheDocument()
    unmount()
    vi.mocked(getSongHistory).mockResolvedValueOnce({ success: false, errors: ['Disponível com conexão.'] })
    render(<MemoryRouter><SongHistoryPanel songId="b" /></MemoryRouter>)
    expect(await screen.findByText('Disponível com conexão.')).toBeInTheDocument()
  })
})
