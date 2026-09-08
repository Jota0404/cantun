// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BandStagePage } from './BandStagePage'

const connect = vi.fn()
const disconnect = vi.fn()
const trackPresence = vi.fn()
const refresh = vi.fn()

vi.mock('../../auth/authContext', () => ({
  useAuth: () => ({
    user: { id: 'musician-1' },
    loading: false,
    configured: true,
    session: null,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  }),
}))

vi.mock('../../application/stage/bandStageService', () => ({
  BandStageService: class {
    connect = connect
    disconnect = disconnect
    trackPresence = trackPresence
    refresh = refresh
    play = vi.fn()
    pause = vi.fn()
    next = vi.fn()
    previous = vi.fn()
    goto = vi.fn()
    setKey = vi.fn()
    getSnapshot = vi.fn()
    endSession = vi.fn()
  },
}))

vi.mock('../../application/stage/getBandStageSessionSetlist', () => ({
  getBandStageSessionSetlist: vi.fn(async () => [
    {
      songId: 'song-1',
      title: 'Primeira',
      artist: 'Artista',
      originalKey: 'C',
      currentKey: 'C',
      lyrics: '[C]Primeira música',
      notes: 'Observação',
    },
    {
      songId: 'song-2',
      title: 'Segunda',
      artist: 'Artista',
      originalKey: 'G',
      currentKey: 'G',
      lyrics: '[G]Segunda música',
    },
  ]),
}))

const snapshot = {
  session: {
    id: 'session-1',
    bandId: 'band-1',
    setlistId: 'setlist-1',
    mdUserId: 'md-1',
    status: 'live',
    createdAt: '2026-09-08T00:00:00.000Z',
    startedAt: '2026-09-08T00:01:00.000Z',
    updatedAt: '2026-09-08T00:02:00.000Z',
  },
  state: {
    sessionId: 'session-1',
    revision: 7,
    currentIndex: 1,
    currentSongId: 'song-2',
    currentKey: 'G',
    isRunning: true,
    updatedAt: '2026-09-08T00:02:00.000Z',
  },
}

beforeEach(() => {
  connect.mockReset().mockImplementation(async (_sessionId: string, callbacks: { onStatus?: (value: string) => void }) => {
    callbacks.onStatus?.('SUBSCRIBED')
    return snapshot
  })
  disconnect.mockReset().mockResolvedValue(undefined)
  trackPresence.mockReset().mockResolvedValue(undefined)
  refresh.mockReset().mockResolvedValue(snapshot)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('BandStagePage musician projection', () => {
  it('renders the shared current song and exposes no stage commands to a non-MD user', async () => {
    render(
      <MemoryRouter initialEntries={['/stage/session/session-1']}>
        <Routes>
          <Route path="/stage/session/:sessionId" element={<BandStagePage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Segunda' })).toBeInTheDocument()
    expect(screen.getByText('Somente visualização')).toBeInTheDocument()
    expect(screen.getByText('O MD está conduzindo a música')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sincronizar' })).toBeInTheDocument()

    expect(screen.queryByRole('button', { name: 'Próxima →' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '← Anterior' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Play' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pausar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Aplicar tom' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Encerrar sessão' })).not.toBeInTheDocument()
  })
})
