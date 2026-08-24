// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { Song } from '../../domain/songs/song'
import { SongDetailPage } from './SongDetailPage'

const getSongByIdMock = vi.fn()

vi.mock('../../application/songs/getSongById', () => ({
  getSongById: (...args: unknown[]) => getSongByIdMock(...args),
}))

function song(): Song {
  return {
    id: 'song-1',
    title: 'Grandioso És Tu',
    artist: 'Harpa Cristã',
    originalKey: 'D',
    currentKey: 'E',
    lyrics: '[E]Grandioso és [B]Tu',
    bpm: 90,
    isFavorite: false,
    createdAt: '2026-08-20T10:00:00.000Z',
    updatedAt: '2026-08-22T10:00:00.000Z',
  }
}

describe('SongDetailPage', () => {
  function renderPage(path: string) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/songs/:songId" element={<SongDetailPage />} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('renders the song detail when the song exists', async () => {
    getSongByIdMock.mockResolvedValue(song())

    renderPage('/songs/song-1')

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Grandioso És Tu' }),
      ).toBeInTheDocument()
    })

    expect(getSongByIdMock).toHaveBeenCalledWith('song-1')
  })

  it('renders a not found message when the song does not exist', async () => {
    getSongByIdMock.mockResolvedValue(undefined)

    renderPage('/songs/missing-song')

    await waitFor(() => {
      expect(
        screen.getByText('Música não encontrada.'),
      ).toBeInTheDocument()
    })
  })

  it('shows a loading message before the song is loaded', () => {
    getSongByIdMock.mockReturnValue(new Promise(() => undefined))

    renderPage('/songs/song-1')

    expect(screen.getByText('Carregando música...')).toBeInTheDocument()
  })
})
