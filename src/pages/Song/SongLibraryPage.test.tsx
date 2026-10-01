// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { SongLibraryPage } from './SongLibraryPage'
import type { SongRepository } from '../../db/repositories/songRepository'
import type { Song } from '../../domain/songs/song'

const songs: Song[] = [
  {
    id: 'song-1',
    title: 'Oceano',
    artist: 'Hillsong United',
    originalKey: 'D',
    currentKey: 'D',
    lyrics: '[D]Oceano',
    bpm: 72,
    isFavorite: false,
    createdAt: '2026-08-20T10:00:00.000Z',
    updatedAt: '2026-08-22T10:00:00.000Z',
  },
  {
    id: 'song-2',
    title: 'Santo, Santo, Santo',
    artist: 'Harpa Cristã',
    originalKey: 'C',
    currentKey: 'C',
    lyrics: '[C]Santo',
    bpm: 80,
    isFavorite: false,
    createdAt: '2026-08-20T10:00:00.000Z',
    updatedAt: '2026-08-22T10:00:00.000Z',
  },
]

function createRepository(result: Song[] = songs) {
  return {
    list: vi.fn().mockResolvedValue(result),
  } as unknown as SongRepository
}

function renderLibrary(repository = createRepository()) {
  return render(
    <MemoryRouter>
      <SongLibraryPage repository={repository} />
    </MemoryRouter>,
  )
}

describe('SongLibraryPage', () => {
  it('does not show songs that have been removed from the repository', async () => {
    const repository = createRepository([songs[1]])

    renderLibrary(repository)

    expect(await screen.findByRole('heading', { name: 'Santo, Santo, Santo' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Grandioso És Tu' })).not.toBeInTheDocument()
  })

  it('shows a search field and all songs initially', async () => {
    renderLibrary()

    expect(await screen.findByRole('searchbox', { name: 'Buscar músicas' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Oceano' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Santo, Santo, Santo' })).toBeInTheDocument()
  })

  it('filters songs by title regardless of letter case and surrounding spaces', async () => {
    const user = userEvent.setup()
    renderLibrary()

    await screen.findByRole('heading', { name: 'Oceano' })
    await user.type(screen.getByRole('searchbox', { name: 'Buscar músicas' }), '  OCEANO  ')

    expect(screen.getByRole('heading', { name: 'Oceano' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Santo, Santo, Santo' })).not.toBeInTheDocument()
  })

  it('filters songs by artist', async () => {
    const user = userEvent.setup()
    renderLibrary()

    await screen.findByRole('heading', { name: 'Oceano' })
    await user.type(screen.getByRole('searchbox', { name: 'Buscar músicas' }), 'hillsong')

    expect(screen.getByRole('heading', { name: 'Oceano' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Santo, Santo, Santo' })).not.toBeInTheDocument()
  })

  it('shows a search-specific empty state and restores the list when cleared', async () => {
    const user = userEvent.setup()
    renderLibrary()
    const search = await screen.findByRole('searchbox', { name: 'Buscar músicas' })

    await user.type(search, 'inexistente')
    expect(screen.getByText('Nenhuma música encontrada para esta busca.')).toBeInTheDocument()
    expect(screen.queryByText('Nenhuma música cadastrada.')).not.toBeInTheDocument()

    await user.clear(search)
    expect(screen.getByRole('heading', { name: 'Oceano' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Santo, Santo, Santo' })).toBeInTheDocument()
  })

  it('opens the selected song after filtering', async () => {
    const user = userEvent.setup()

    function CurrentLocation() {
      return <p>{useLocation().pathname}</p>
    }

    render(
      <MemoryRouter initialEntries={['/songs']}>
        <Routes>
          <Route path="/songs" element={<SongLibraryPage repository={createRepository()} />} />
          <Route path="*" element={<CurrentLocation />} />
        </Routes>
      </MemoryRouter>,
    )

    const search = await screen.findByRole('searchbox', { name: 'Buscar músicas' })
    await user.type(search, 'hillsong')
    await user.click(screen.getByRole('button', { name: 'Abrir música' }))

    expect(screen.getByText('/songs/song-1')).toBeInTheDocument()
  })
})
