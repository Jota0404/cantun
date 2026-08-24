// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { SongLibraryPage } from './SongLibraryPage'
import type { SongRepository } from '../../db/repositories/songRepository'

describe('SongLibraryPage', () => {
  it('does not show songs that have been removed from the repository', async () => {
    const repository = {
      list: vi.fn().mockResolvedValue([
        {
          id: 'song-2',
          title: 'Santo, Santo, Santo',
          originalKey: 'C',
          currentKey: 'C',
          lyrics: '[C]Santo',
          bpm: 80,
          isFavorite: false,
          createdAt: '2026-08-20T10:00:00.000Z',
          updatedAt: '2026-08-22T10:00:00.000Z',
        },
      ]),
    } as unknown as SongRepository

    render(
      <MemoryRouter>
        <SongLibraryPage repository={repository} />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Santo, Santo, Santo' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Grandioso És Tu' })).not.toBeInTheDocument()
  })
})
