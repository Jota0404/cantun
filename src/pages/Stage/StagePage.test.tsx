// @vitest-environment jsdom

import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StagePage } from './StagePage'
import type { Song } from '../../domain/songs/song'
import type { SongRepository } from '../../db/repositories/songRepository'
import type { SetlistSongRepository } from '../../db/repositories/setlistSongRepository'

function song(id: string, title: string): Song {
  return {
    id,
    title,
    originalKey: 'C',
    currentKey: 'C',
    lyrics: `[C]${title}`,
    notes: 'Observação',
    bpm: 90,
    isFavorite: false,
    createdAt: '2026-08-23T00:00:00.000Z',
    updatedAt: '2026-08-23T00:00:00.000Z',
  }
}

function renderStage(
  songs: Song[],
  entries: Array<{
    id: string
    setlistId: string
    songId: string
    position: number
  }>,
) {
  const songRepository = {
    list: vi.fn(async () => songs),
    getById: vi.fn(async (id: string) =>
      songs.find((item) => item.id === id),
    ),
  } as unknown as SongRepository

  const setlistSongRepository = {
    listBySetlistId: vi.fn(async () => entries),
  } as unknown as SetlistSongRepository

  return render(
    <MemoryRouter initialEntries={['/stage/setlist/setlist-1']}>
      <Routes>
        <Route
          path="/stage/setlist/:setlistId"
          element={
            <StagePage
              repository={songRepository}
              setlistSongRepository={setlistSongRepository}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('StagePage', () => {
  let callbacks: Map<number, FrameRequestCallback>
  let nextFrameId: number
  let scrollPosition: number

  function runFrame(id: number, timestamp: number) {
    const callback = callbacks.get(id)

    callbacks.delete(id)

    callback?.(timestamp)
  }

  beforeEach(() => {
    callbacks = new Map()
    nextFrameId = 1
    scrollPosition = 0

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(
      (callback) => {
        const id = nextFrameId++

        callbacks.set(id, callback)

        return id
      },
    )

    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      callbacks.delete(id)
    })

    vi.spyOn(window, 'scrollTo').mockImplementation((options) => {
      const top = (options as ScrollToOptions).top

      if (typeof top === 'number') {
        scrollPosition = top
      }
    })

    vi.spyOn(window, 'scrollBy').mockImplementation((options) => {
      const top = (options as ScrollToOptions).top

      if (typeof top === 'number') {
        scrollPosition += top
      }
    })

    vi.spyOn(window, 'scrollY', 'get').mockImplementation(
      () => scrollPosition,
    )

    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 2000,
    })

    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 1000,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the first repertoire song and navigates to the next song', async () => {
    const user = userEvent.setup()

    renderStage(
      [song('song-1', 'Primeira'), song('song-2', 'Segunda')],
      [
        {
          id: 'entry-1',
          setlistId: 'setlist-1',
          songId: 'song-1',
          position: 1,
        },
        {
          id: 'entry-2',
          setlistId: 'setlist-1',
          songId: 'song-2',
          position: 2,
        },
      ],
    )

    expect(
      await screen.findByText('Primeira', {
        selector: 'strong',
      }),
    ).toBeInTheDocument()

    const next = screen.getByRole('button', {
      name: 'Próxima →',
    })

    await user.click(next)

    expect(
      screen.getByText('Segunda', {
        selector: 'strong',
      }),
    ).toBeInTheDocument()

    expect(
      screen.getByRole('button', {
        name: '← Anterior',
      }),
    ).toBeEnabled()

    expect(
      screen.getByRole('button', {
        name: 'Próxima →',
      }),
    ).toBeDisabled()
  })

  it('changes the displayed font size with the range control', async () => {
    renderStage(
      [song('song-1', 'Primeira')],
      [
        {
          id: 'entry-1',
          setlistId: 'setlist-1',
          songId: 'song-1',
          position: 1,
        },
      ],
    )

    const range = await screen.findByRole('slider', {
      name: 'Tamanho da fonte',
    })

    expect(range).toHaveValue('22')

    fireEvent.change(range, {
      target: { value: '24' },
    })

    expect(range).toHaveValue('24')
  })

  it('starts, pauses, and resumes auto-scroll without creating duplicate frames', async () => {
    const user = userEvent.setup()

    renderStage(
      [song('song-1', 'Primeira')],
      [
        {
          id: 'entry-1',
          setlistId: 'setlist-1',
          songId: 'song-1',
          position: 1,
        },
      ],
    )

    expect(
      await screen.findByText('Auto-scroll: Pausado'),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', {
        name: 'Iniciar',
      }),
    )

    expect(
      screen.getByText('Auto-scroll: Ativo'),
    ).toBeInTheDocument()

    expect(callbacks.size).toBe(1)

    const firstFrame = [...callbacks.keys()][0]

    act(() => {
      runFrame(firstFrame, 1000)
    })

    expect(callbacks.size).toBe(1)

    await user.click(
      screen.getByRole('button', {
        name: 'Pausar',
      }),
    )

    expect(
      screen.getByText('Auto-scroll: Pausado'),
    ).toBeInTheDocument()

    expect(callbacks.size).toBe(0)

    await user.click(
      screen.getByRole('button', {
        name: 'Retomar',
      }),
    )

    expect(callbacks.size).toBe(1)
  })

  it('scrolls according to the selected speed and stops at the end', async () => {
    const user = userEvent.setup()

    renderStage(
      [song('song-1', 'Primeira')],
      [
        {
          id: 'entry-1',
          setlistId: 'setlist-1',
          songId: 'song-1',
          position: 1,
        },
      ],
    )

    const speed = await screen.findByRole('slider', {
      name: 'Velocidade do auto-scroll',
    })

    expect(speed).toHaveValue('1')

    expect(
      screen.getByText('Velocidade: Normal'),
    ).toBeInTheDocument()

    fireEvent.change(speed, {
      target: { value: '2' },
    })

    expect(
      screen.getByText('Velocidade: Rápida'),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', {
        name: 'Iniciar',
      }),
    )

    const firstFrame = [...callbacks.keys()][0]

    act(() => {
      runFrame(firstFrame, 1000)
    })

    const secondFrame = [...callbacks.keys()][0]

    act(() => {
      runFrame(secondFrame, 1100)
    })

    expect(scrollPosition).toBeCloseTo(24)

    expect(
      screen.getByText('Auto-scroll: Ativo'),
    ).toBeInTheDocument()

    scrollPosition = 1000

    const activeFrame = [...callbacks.keys()][0]

    act(() => {
      runFrame(activeFrame, 1200)
    })

    expect(
      screen.getByText('Auto-scroll: Pausado'),
    ).toBeInTheDocument()

    expect(callbacks.size).toBe(0)
  })

  it('keeps auto-scroll active and returns to the top when changing songs', async () => {
    const user = userEvent.setup()

    renderStage(
      [song('song-1', 'Primeira'), song('song-2', 'Segunda')],
      [
        {
          id: 'entry-1',
          setlistId: 'setlist-1',
          songId: 'song-1',
          position: 1,
        },
        {
          id: 'entry-2',
          setlistId: 'setlist-1',
          songId: 'song-2',
          position: 2,
        },
      ],
    )

    await screen.findByText('Primeira', {
      selector: 'strong',
    })

    await user.click(
      screen.getByRole('button', {
        name: 'Iniciar',
      }),
    )

    const fontRange = screen.getByRole('slider', {
      name: 'Tamanho da fonte',
    })

    fireEvent.change(fontRange, {
      target: { value: '30' },
    })

    expect(
      screen.getByText('Auto-scroll: Ativo'),
    ).toBeInTheDocument()

    expect(callbacks.size).toBe(1)

    scrollPosition = 300

    await user.click(
      screen.getByRole('button', {
        name: 'Próxima →',
      }),
    )

    expect(
      screen.getByText('Segunda', {
        selector: 'strong',
      }),
    ).toBeInTheDocument()

    expect(scrollPosition).toBe(0)

    expect(
      screen.getByText('Auto-scroll: Ativo'),
    ).toBeInTheDocument()

    expect(callbacks.size).toBe(1)
  })
})