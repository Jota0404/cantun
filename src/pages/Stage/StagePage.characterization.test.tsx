// @vitest-environment jsdom

// Characterization of the solo Stage (RN-21): pins current behavior before the refactor.

import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StagePage } from './StagePage'
import type { Song } from '../../domain/songs/song'
import type { SongRepository } from '../../db/repositories/songRepository'

function song(overrides: Partial<Song> = {}): Song {
  return {
    id: 'song-1',
    title: 'Primeira',
    artist: 'Artista X',
    originalKey: 'C',
    currentKey: 'C',
    lyrics: '[C]Aleluia',
    notes: 'Observação',
    bpm: 90,
    isFavorite: false,
    createdAt: '2026-08-23T00:00:00.000Z',
    updatedAt: '2026-08-23T00:00:00.000Z',
    ...overrides,
  }
}

function pagedLyrics() {
  return Array.from({ length: 25 }, (_, index) => `Linha ${index + 1}`).join('\n')
}

function renderStage(
  getById: SongRepository['getById'],
  path = '/stage/song/song-1',
) {
  const repository = { getById: vi.fn(getById) } as unknown as SongRepository

  return render(
    <MemoryRouter initialEntries={['/previous', path]} initialIndex={1}>
      <Routes>
        <Route path="/previous" element={<h1>Tela anterior</h1>} />
        <Route path="/stage/song/:songId" element={<StagePage repository={repository} />} />
        <Route path="/stage" element={<StagePage repository={repository} />} />
        <Route path="/songs/:songId" element={<h1>Detalhe da música</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('StagePage characterization', () => {
  let callbacks: Map<number, FrameRequestCallback>
  let nextFrameId: number
  let scrollPosition: number
  let scrollTo: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    callbacks = new Map()
    nextFrameId = 1
    scrollPosition = 0

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const id = nextFrameId++
      callbacks.set(id, callback)
      return id
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      callbacks.delete(id)
    })
    scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation((options) => {
      const top = (options as ScrollToOptions).top
      if (typeof top === 'number') scrollPosition = top
    })
    vi.spyOn(window, 'scrollBy').mockImplementation((options) => {
      const top = (options as ScrollToOptions).top
      if (typeof top === 'number') scrollPosition += top
    })
    vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => scrollPosition)
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 2000,
    })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 })
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: null,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows a loading message until the song resolves', async () => {
    let resolve: (value: Song) => void = () => undefined
    renderStage(() => new Promise<Song>((r) => { resolve = r }))

    expect(screen.getByText('Carregando Modo Palco...')).toBeInTheDocument()

    await act(async () => resolve(song()))

    expect(screen.queryByText('Carregando Modo Palco...')).not.toBeInTheDocument()
    expect(screen.getByText('Primeira', { selector: 'strong' })).toBeInTheDocument()
  })

  it('renders song metadata, lyrics region and notes in scroll mode', async () => {
    renderStage(async () => song())

    expect(await screen.findByText('Primeira', { selector: 'strong' })).toBeInTheDocument()
    const meta = screen.getByRole('region', { name: 'Informações da música' })
    expect(within(meta).getByText('Artista X')).toBeInTheDocument()
    expect(within(meta).getByText('Tom: C')).toBeInTheDocument()
    expect(within(meta).getByText('BPM: 90')).toBeInTheDocument()

    const lyrics = screen.getByRole('region', { name: 'Letra de Primeira' })
    expect(within(lyrics).getByText('C', { selector: '.stage-chord' })).toBeInTheDocument()
    expect(within(lyrics).getByText('Aleluia')).toBeInTheDocument()
    expect(within(lyrics).getByText('Observações')).toBeInTheDocument()
    expect(within(lyrics).getByText('Observação')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rolagem' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Páginas' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('omits artist, BPM and notes when absent', async () => {
    renderStage(async () => song({ artist: undefined, bpm: undefined, notes: undefined }))

    await screen.findByText('Primeira', { selector: 'strong' })
    const meta = screen.getByRole('region', { name: 'Informações da música' })
    expect(within(meta).queryByText('Artista X')).not.toBeInTheDocument()
    expect(within(meta).queryByText(/BPM/)).not.toBeInTheDocument()
    expect(screen.queryByText('Observações')).not.toBeInTheDocument()
  })

  it('displays lyrics transposed from original to current key without mutating the song', async () => {
    const stored = song({ originalKey: 'C', currentKey: 'D', lyrics: '[C]Aleluia [G]Amém' })
    renderStage(async () => stored)

    await screen.findByText('Primeira', { selector: 'strong' })

    expect(screen.getByText('Tom: D')).toBeInTheDocument()
    expect(screen.getByText('D', { selector: '.stage-chord' })).toBeInTheDocument()
    expect(screen.getByText('A', { selector: '.stage-chord' })).toBeInTheDocument()
    expect(screen.queryByText('G', { selector: '.stage-chord' })).not.toBeInTheDocument()
    expect(stored.lyrics).toBe('[C]Aleluia [G]Amém')
  })

  it('renders plain lines without chord highlighting', async () => {
    renderStage(async () => song({ lyrics: 'Só texto\n\nOutra linha' }))

    await screen.findByText('Primeira', { selector: 'strong' })

    expect(screen.getByText('Só texto')).toBeInTheDocument()
    expect(screen.getByText('Outra linha')).toBeInTheDocument()
    expect(document.querySelector('.stage-chord')).toBeNull()
  })

  it('applies the font size as a CSS variable on the stage', async () => {
    renderStage(async () => song())

    const range = await screen.findByRole('slider', { name: 'Tamanho da fonte' })
    expect(range).toHaveAttribute('min', '16')
    expect(range).toHaveAttribute('max', '36')
    expect(screen.getByRole('main').style.getPropertyValue('--stage-font-size')).toBe('22px')

    fireEvent.change(range, { target: { value: '30' } })

    expect(screen.getByRole('main').style.getPropertyValue('--stage-font-size')).toBe('30px')
  })

  it('scrolls to the top when the song loads and when auto-scroll was running restarts its frame', async () => {
    renderStage(async () => song())

    await screen.findByText('Primeira', { selector: 'strong' })

    expect(scrollTo).toHaveBeenCalledWith({ top: 0 })
    expect(callbacks.size).toBe(0)
  })

  it('shows speed labels and aria-valuetext for each auto-scroll speed', async () => {
    renderStage(async () => song())

    const speed = await screen.findByRole('slider', { name: 'Velocidade do auto-scroll' })
    expect(speed).toHaveAttribute('aria-valuetext', 'Normal')

    fireEvent.change(speed, { target: { value: '0' } })
    expect(screen.getByText('Velocidade: Lenta')).toBeInTheDocument()
    expect(speed).toHaveAttribute('aria-valuetext', 'Lenta')
  })

  it('scrolls at the slow speed rate', async () => {
    const user = userEvent.setup()
    renderStage(async () => song())

    fireEvent.change(await screen.findByRole('slider', { name: 'Velocidade do auto-scroll' }), {
      target: { value: '0' },
    })
    await user.click(screen.getByRole('button', { name: 'Iniciar' }))
    act(() => callbacks.get([...callbacks.keys()][0])?.(1000))
    act(() => callbacks.get([...callbacks.keys()][0])?.(1100))

    expect(scrollPosition).toBeCloseTo(6)
  })

  it('discards auto-scroll when leaving the stage', async () => {
    const user = userEvent.setup()
    const { unmount } = renderStage(async () => song())

    await user.click(await screen.findByRole('button', { name: 'Iniciar' }))
    expect(callbacks.size).toBe(1)

    unmount()

    expect(callbacks.size).toBe(0)
  })

  it('leaves the stage to the song detail with Sair', async () => {
    const user = userEvent.setup()
    renderStage(async () => song())

    await user.click(await screen.findByRole('button', { name: 'Sair' }))

    expect(screen.getByRole('heading', { name: 'Detalhe da música' })).toBeInTheDocument()
  })

  it('shows an alert when no song id is given and Voltar goes back', async () => {
    const user = userEvent.setup()
    renderStage(async () => song(), '/stage')

    expect(await screen.findByRole('alert')).toHaveTextContent('Música não informada.')

    await user.click(screen.getByRole('button', { name: 'Voltar' }))

    expect(screen.getByRole('heading', { name: 'Tela anterior' })).toBeInTheDocument()
  })

  it('shows a load error alert when the repository fails', async () => {
    renderStage(async () => {
      throw new Error('boom')
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar o Modo Palco.',
    )
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument()
  })

  it('toggles fullscreen label from fullscreenchange events and exits fullscreen', async () => {
    const user = userEvent.setup()
    const requestFullscreen = vi.fn().mockResolvedValue(undefined)
    const exitFullscreen = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    })
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: exitFullscreen,
    })
    renderStage(async () => song())

    await user.click(await screen.findByRole('button', { name: 'Tela cheia' }))
    expect(requestFullscreen).toHaveBeenCalledTimes(1)

    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: document.documentElement,
    })
    act(() => {
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    await user.click(screen.getByRole('button', { name: 'Sair da tela cheia' }))
    expect(exitFullscreen).toHaveBeenCalledTimes(1)

    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null })
    act(() => {
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    expect(screen.getByRole('button', { name: 'Tela cheia' })).toBeInTheDocument()
  })

  it('keeps working when exitFullscreen is rejected', async () => {
    const user = userEvent.setup()
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: document.documentElement,
    })
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: vi.fn().mockRejectedValue(new Error('nope')),
    })
    renderStage(async () => song())

    await user.click(await screen.findByRole('button', { name: 'Tela cheia' }))
    expect(document.exitFullscreen).toHaveBeenCalledTimes(1)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('pauses auto-scroll and scrolls to top when switching to page mode, and resets on return', async () => {
    const user = userEvent.setup()
    renderStage(async () => song({ lyrics: pagedLyrics() }))

    await user.click(await screen.findByRole('button', { name: 'Iniciar' }))
    scrollTo.mockClear()

    await user.click(screen.getByRole('button', { name: 'Páginas' }))

    expect(scrollTo).toHaveBeenCalledWith({ top: 0 })
    expect(callbacks.size).toBe(0)
    expect(screen.getByText('Toque nas laterais ou deslize para mudar de página')).toBeInTheDocument()
    expect(screen.queryByRole('slider', { name: 'Velocidade do auto-scroll' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Rolagem' }))

    expect(screen.getByText('Auto-scroll: Pausado')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retomar' })).toBeInTheDocument()
    expect(screen.queryByText(/Página \d+\/\d+/)).not.toBeInTheDocument()
  })

  it('shows notes only on the last page in page mode', async () => {
    const user = userEvent.setup()
    renderStage(async () => song({ lyrics: pagedLyrics() }))

    await screen.findByText('Primeira', { selector: 'strong' })
    await user.click(screen.getByRole('button', { name: 'Páginas' }))

    expect(screen.getByText('Página 1/2')).toBeInTheDocument()
    expect(screen.queryByText('Observação')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Letra de Primeira' })).not.toBeInTheDocument()

    const stage = screen.getByRole('main')
    fireEvent.pointerDown(stage, { clientX: 700, clientY: 300 })
    fireEvent.pointerUp(stage, { clientX: 500, clientY: 300 })

    expect(screen.getByText('Página 2/2')).toBeInTheDocument()
    expect(screen.getByText('Observação')).toBeInTheDocument()
  })

  it('navigates pages by tapping the screen edges and ignores the middle', async () => {
    const user = userEvent.setup()
    renderStage(async () => song({ lyrics: pagedLyrics() }))

    await screen.findByText('Primeira', { selector: 'strong' })
    await user.click(screen.getByRole('button', { name: 'Páginas' }))
    const stage = screen.getByRole('main')

    fireEvent.pointerDown(stage, { clientX: 500, clientY: 300 })
    fireEvent.pointerUp(stage, { clientX: 500, clientY: 300 })
    expect(screen.getByText('Página 1/2')).toBeInTheDocument()

    fireEvent.pointerDown(stage, { clientX: 900, clientY: 300 })
    fireEvent.pointerUp(stage, { clientX: 900, clientY: 300 })
    expect(screen.getByText('Página 2/2')).toBeInTheDocument()

    fireEvent.pointerDown(stage, { clientX: 900, clientY: 300 })
    fireEvent.pointerUp(stage, { clientX: 900, clientY: 300 })
    expect(screen.getByText('Página 2/2')).toBeInTheDocument()

    fireEvent.pointerDown(stage, { clientX: 100, clientY: 300 })
    fireEvent.pointerUp(stage, { clientX: 100, clientY: 300 })
    expect(screen.getByText('Página 1/2')).toBeInTheDocument()

    fireEvent.pointerDown(stage, { clientX: 100, clientY: 300 })
    fireEvent.pointerUp(stage, { clientX: 100, clientY: 300 })
    expect(screen.getByText('Página 1/2')).toBeInTheDocument()
  })

  it('ignores vertical swipes, cancelled pointers and pointers starting on controls', async () => {
    const user = userEvent.setup()
    renderStage(async () => song({ lyrics: pagedLyrics() }))

    await screen.findByText('Primeira', { selector: 'strong' })
    await user.click(screen.getByRole('button', { name: 'Páginas' }))
    const stage = screen.getByRole('main')

    fireEvent.pointerDown(stage, { clientX: 700, clientY: 100 })
    fireEvent.pointerUp(stage, { clientX: 690, clientY: 400 })
    expect(screen.getByText('Página 1/2')).toBeInTheDocument()

    fireEvent.pointerDown(stage, { clientX: 700, clientY: 300 })
    fireEvent.pointerCancel(stage)
    fireEvent.pointerUp(stage, { clientX: 500, clientY: 300 })
    expect(screen.getByText('Página 1/2')).toBeInTheDocument()

    const font = screen.getByRole('slider', { name: 'Tamanho da fonte' })
    fireEvent.pointerDown(font, { clientX: 700, clientY: 300 })
    fireEvent.pointerUp(stage, { clientX: 500, clientY: 300 })
    expect(screen.getByText('Página 1/2')).toBeInTheDocument()
  })

  it('does not change anything on swipes in scroll mode', async () => {
    renderStage(async () => song({ lyrics: pagedLyrics() }))

    await screen.findByText('Primeira', { selector: 'strong' })
    const stage = screen.getByRole('main')

    fireEvent.pointerDown(stage, { clientX: 700, clientY: 300 })
    fireEvent.pointerUp(stage, { clientX: 500, clientY: 300 })

    expect(screen.queryByText(/Página \d+\/\d+/)).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Letra de Primeira' })).toBeInTheDocument()
  })

  it('resets the page index when the read mode changes', async () => {
    const user = userEvent.setup()
    renderStage(async () => song({ lyrics: pagedLyrics() }))

    await screen.findByText('Primeira', { selector: 'strong' })
    await user.click(screen.getByRole('button', { name: 'Páginas' }))
    const stage = screen.getByRole('main')
    fireEvent.pointerDown(stage, { clientX: 700, clientY: 300 })
    fireEvent.pointerUp(stage, { clientX: 500, clientY: 300 })
    expect(screen.getByText('Página 2/2')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Rolagem' }))
    await user.click(screen.getByRole('button', { name: 'Páginas' }))

    expect(screen.getByText('Página 1/2')).toBeInTheDocument()
  })
})
