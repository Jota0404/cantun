// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { Song } from '../../domain/songs/song'
import { EditSongPage } from './EditSongPage'

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
    notes: 'Introdução suave',
    isFavorite: false,
    createdAt: '2026-08-20T10:00:00.000Z',
    updatedAt: '2026-08-22T10:00:00.000Z',
  }
}

function renderPage(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/songs/:songId/edit" element={<EditSongPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('EditSongPage', () => {
  it('loads the song from the route and populates the form', async () => {
    getSongByIdMock.mockResolvedValue(song())

    renderPage('/songs/song-1/edit')

    expect(screen.getByText('Carregando música...')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByLabelText('Título')).toHaveValue('Grandioso És Tu')
    })

    expect(getSongByIdMock).toHaveBeenCalledWith('song-1')
    expect(screen.getByLabelText('Artista')).toHaveValue('Harpa Cristã')
    expect(screen.getByLabelText('Observações')).toHaveValue('Introdução suave')
  })

  it('shows a not found state when the song does not exist', async () => {
    getSongByIdMock.mockResolvedValue(undefined)

    renderPage('/songs/missing/edit')

    expect(await screen.findByText('Música não encontrada.')).toBeInTheDocument()
  })
})
