// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Song } from '../../domain/songs/song'
import { SongDetailPage } from './SongDetailPage'

const getSongByIdMock = vi.fn()
const deleteSongMock = vi.fn()
const updateSongMock = vi.fn()
const transposeSongMock = vi.fn()

vi.mock('../../application/songs/getSongById', () => ({
  getSongById: (...args: unknown[]) => getSongByIdMock(...args),
}))

vi.mock('../../application/songs/deleteSong', () => ({
  deleteSong: (...args: unknown[]) => deleteSongMock(...args),
}))

vi.mock('../../application/songs/updateSong', () => ({
  updateSong: (...args: unknown[]) => updateSongMock(...args),
}))

vi.mock('../../application/songs/transposeSong', () => ({
  transposeSong: (...args: unknown[]) => transposeSongMock(...args),
}))

function song(overrides: Partial<Song> = {}): Song {
  return {
    id: 'song-1',
    title: 'Grandioso És Tu',
    artist: 'Harpa Cristã',
    originalKey: 'D',
    currentKey: 'E',
    lyrics: '[D]Grandioso és [A]Tu',
    bpm: 90,
    isFavorite: false,
    createdAt: '2026-08-20T10:00:00.000Z',
    updatedAt: '2026-08-22T10:00:00.000Z',
    ...overrides,
  }
}

describe('SongDetailPage', () => {
  beforeEach(() => {
    getSongByIdMock.mockReset()
    deleteSongMock.mockReset()
    updateSongMock.mockReset()
    transposeSongMock.mockReset()
    vi.restoreAllMocks()
  })

  function renderPage(path: string) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/songs/:songId" element={<SongDetailPage />} />
        </Routes>
      </MemoryRouter>,
    )
  }

  async function openDeleteModal(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: 'Excluir' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
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

  it('transposes the song and updates the displayed key and lyrics', async () => {
    const user = userEvent.setup()
    const currentSong = song()
    const transposedSong = { ...currentSong, currentKey: 'F' }
    getSongByIdMock.mockResolvedValue(currentSong)
    transposeSongMock.mockResolvedValue({ success: true, song: transposedSong })
    renderPage('/songs/song-1')
    await user.click(await screen.findByRole('button', { name: 'Próximo tom' }))
    await waitFor(() => expect(transposeSongMock).toHaveBeenCalledWith({ id: 'song-1', semitones: 1 }))
    expect(screen.getByText('Tom atual: F')).toBeInTheDocument()
    expect(screen.getByText('[F]Grandioso és [C]Tu')).toBeInTheDocument()
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

  it('does not delete the song when deletion is cancelled', async () => {
    const user = userEvent.setup()
    getSongByIdMock.mockResolvedValue(song())

    renderPage('/songs/song-1')

    await openDeleteModal(user)
    expect(screen.getByRole('dialog')).toHaveTextContent('Excluir música?')
    expect(screen.getByRole('dialog')).toHaveTextContent('A música “Grandioso És Tu” será excluída.')

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(deleteSongMock).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Grandioso És Tu' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('deletes the song and returns to the library after confirmation', async () => {
    const user = userEvent.setup()
    getSongByIdMock.mockResolvedValue(song())
    deleteSongMock.mockResolvedValue({ success: true })

    render(
      <MemoryRouter initialEntries={['/songs/song-1']}>
        <Routes>
          <Route path="/songs/:songId" element={<SongDetailPage />} />
          <Route path="/songs" element={<p>Biblioteca atualizada</p>} />
        </Routes>
      </MemoryRouter>,
    )

    await openDeleteModal(user)
    await user.click(screen.getByRole('button', { name: 'Excluir música' }))

    await waitFor(() => {
      expect(deleteSongMock).toHaveBeenCalledWith('song-1')
    })
    expect(screen.getByText('Biblioteca atualizada')).toBeInTheDocument()
  })

  it('shows an error when deletion fails', async () => {
    const user = userEvent.setup()
    getSongByIdMock.mockResolvedValue(song())
    deleteSongMock.mockResolvedValue({
      success: false,
      error: { field: 'id', message: 'Música não encontrada.' },
    })

    renderPage('/songs/song-1')

    await openDeleteModal(user)
    await user.click(screen.getByRole('button', { name: 'Excluir música' }))

    expect(
      await screen.findByRole('alert'),
    ).toHaveTextContent('Música não encontrada.')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('closes the deletion modal with Escape without deleting', async () => {
    const user = userEvent.setup()
    getSongByIdMock.mockResolvedValue(song())

    renderPage('/songs/song-1')

    await openDeleteModal(user)
    await user.keyboard('{Escape}')

    expect(deleteSongMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('marks a song as favorite and updates the detail', async () => {
    const user = userEvent.setup()
    const currentSong = song()
    const favoriteSong = { ...currentSong, isFavorite: true }
    getSongByIdMock.mockResolvedValue(currentSong)
    updateSongMock.mockResolvedValue({ success: true, song: favoriteSong })

    renderPage('/songs/song-1')

    await user.click(await screen.findByRole('button', { name: 'Adicionar aos favoritos' }))

    await waitFor(() => {
      expect(updateSongMock).toHaveBeenCalledWith({ ...currentSong, isFavorite: true })
    })
    expect(screen.getByRole('button', { name: 'Remover dos favoritos' })).toBeInTheDocument()
  })

  it('removes a song from favorites', async () => {
    const user = userEvent.setup()
    const currentSong = song({ isFavorite: true })
    const nonFavoriteSong = { ...currentSong, isFavorite: false }
    getSongByIdMock.mockResolvedValue(currentSong)
    updateSongMock.mockResolvedValue({ success: true, song: nonFavoriteSong })

    renderPage('/songs/song-1')

    await user.click(await screen.findByRole('button', { name: 'Remover dos favoritos' }))

    await waitFor(() => {
      expect(updateSongMock).toHaveBeenCalledWith({ ...currentSong, isFavorite: false })
    })
    expect(screen.getByRole('button', { name: 'Adicionar aos favoritos' })).toBeInTheDocument()
  })

  it('keeps the favorite state and shows an error when persistence fails', async () => {
    const user = userEvent.setup()
    getSongByIdMock.mockResolvedValue(song())
    updateSongMock.mockRejectedValue(new Error('IndexedDB unavailable'))

    renderPage('/songs/song-1')

    await user.click(await screen.findByRole('button', { name: 'Adicionar aos favoritos' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível atualizar os favoritos. Tente novamente.',
    )
    expect(screen.getByRole('button', { name: 'Adicionar aos favoritos' })).toBeInTheDocument()
  })
})
