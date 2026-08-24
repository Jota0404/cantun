// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import type { Song } from '../../domain/songs/song'
import { SongDetail } from './SongDetail'

function song(overrides: Partial<Song> = {}): Song {
  return {
    id: 'song-1',
    title: 'Grandioso És Tu',
    artist: 'Harpa Cristã',
    originalKey: 'D',
    currentKey: 'E',
    lyrics: '[E]Grandioso és [B]Tu',
    notes: 'Introdução suave',
    bpm: 90,
    isFavorite: false,
    createdAt: '2026-08-20T10:00:00.000Z',
    updatedAt: '2026-08-22T10:00:00.000Z',
    ...overrides,
  }
}

describe('SongDetail', () => {
  it('renders the song title and artist', () => {
    render(<SongDetail song={song()} />)

    expect(
      screen.getByRole('heading', { name: 'Grandioso És Tu' }),
    ).toBeInTheDocument()

    expect(screen.getByText('Harpa Cristã')).toBeInTheDocument()
  })

  it('renders the current key and original key', () => {
    render(<SongDetail song={song()} />)

    expect(screen.getByText('Tom atual: E')).toBeInTheDocument()
    expect(screen.getByText('Tom original: D')).toBeInTheDocument()
  })

  it('renders the bpm when available', () => {
    render(<SongDetail song={song({ bpm: 90 })} />)

    expect(screen.getByText('BPM: 90')).toBeInTheDocument()
  })

  it('renders the lyrics', () => {
    render(<SongDetail song={song()} />)

    expect(screen.getByText('[E]Grandioso és [B]Tu')).toBeInTheDocument()
  })

  it('renders notes when available', () => {
    render(<SongDetail song={song()} />)

    expect(screen.getByText('Introdução suave')).toBeInTheDocument()
  })

  it('shows the favorite indicator for favorite songs', () => {
    render(
      <SongDetail
        song={song({
          isFavorite: true,
        })}
      />,
    )

    expect(screen.getByLabelText('Música favorita')).toBeInTheDocument()
  })

  it('offers an edit action when provided', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()

    render(<SongDetail song={song()} onEdit={onEdit} />)

    await user.click(screen.getByRole('button', { name: 'Editar' }))

    expect(onEdit).toHaveBeenCalledTimes(1)
  })
})
