// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Song } from '../../domain/songs/song'
import { SongList } from './SongList'

function song(overrides: Partial<Song> = {}): Song {
  return {
    id: 'song-1',
    title: 'Grandioso És Tu',
    originalKey: 'D',
    currentKey: 'E',
    lyrics: '[E]Grandioso és [B]Tu',
    bpm: 90,
    isFavorite: false,
    createdAt: '2026-08-20T10:00:00.000Z',
    updatedAt: '2026-08-22T10:00:00.000Z',
    ...overrides,
  }
}

describe('SongList', () => {
  it('renders an empty state when there are no songs', () => {
    render(<SongList songs={[]} />)

    expect(
      screen.getByText('Nenhuma música cadastrada.'),
    ).toBeInTheDocument()
  })

  it('renders the song title, current key and bpm', () => {
    render(<SongList songs={[song()]} />)

    expect(screen.getByRole('heading', { name: 'Grandioso És Tu' }))
      .toBeInTheDocument()

    expect(screen.getByText('Tom: E (original: D)')).toBeInTheDocument()
    expect(screen.getByText('BPM: 90')).toBeInTheDocument()
  })

  it('shows the favorite indicator for favorite songs', () => {
    render(
      <SongList
        songs={[
          song({
            isFavorite: true,
          }),
        ]}
      />,
    )

    expect(
      screen.getByLabelText('Música favorita'),
    ).toBeInTheDocument()
  })

  it('renders multiple songs', () => {
    render(
      <SongList
        songs={[
          song({
            id: 'song-1',
            title: 'Grandioso És Tu',
          }),
          song({
            id: 'song-2',
            title: 'Santo, Santo, Santo',
            currentKey: 'C',
            originalKey: 'C',
            bpm: 80,
          }),
        ]}
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'Grandioso És Tu' }),
    ).toBeInTheDocument()

    expect(
      screen.getByRole('heading', { name: 'Santo, Santo, Santo' }),
    ).toBeInTheDocument()
  })

  it('notifies the caller when a song is opened', async () => {
    const user = userEvent.setup()
    const onSelectSong = vi.fn()
    const selectedSong = song()

    render(<SongList songs={[selectedSong]} onSelectSong={onSelectSong} />)

    await user.click(screen.getByRole('button', { name: 'Abrir música' }))

    expect(onSelectSong).toHaveBeenCalledWith(selectedSong)
  })
})
