// @vitest-environment jsdom

import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useFullscreen } from './useFullscreen'

function Probe() {
  const { isFullscreen, supported, toggleFullscreen } = useFullscreen()
  return <button type="button" data-supported={supported} onClick={() => void toggleFullscreen()}>{isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}</button>
}

describe('useFullscreen', () => {
  afterEach(() => Reflect.deleteProperty(document.documentElement, 'requestFullscreen'))

  it('requests fullscreen on click', () => {
    const request = vi.fn().mockResolvedValue(undefined)
    document.documentElement.requestFullscreen = request
    render(<Probe />)
    fireEvent.click(screen.getByRole('button', { name: 'Tela cheia' }))
    expect(request).toHaveBeenCalled()
  })

  it('tolerates a rejected request', async () => {
    document.documentElement.requestFullscreen = vi.fn().mockRejectedValue(new Error('denied'))
    render(<Probe />)
    fireEvent.click(screen.getByRole('button', { name: 'Tela cheia' }))
    await Promise.resolve()
    expect(screen.getByRole('button', { name: 'Tela cheia' })).toBeTruthy()
  })

  it('reports support', () => {
    const { unmount } = render(<Probe />)
    expect(screen.getByRole('button').dataset.supported).toBe('false')
    unmount()
    document.documentElement.requestFullscreen = vi.fn()
    render(<Probe />)
    expect(screen.getByRole('button').dataset.supported).toBe('true')
  })

  it('toggles label on fullscreenchange and removes the listener on unmount', () => {
    const remove = vi.spyOn(document, 'removeEventListener')
    const { unmount } = render(<Probe />)
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: document.body })
    act(() => { document.dispatchEvent(new Event('fullscreenchange')) })
    expect(screen.getByRole('button', { name: 'Sair da tela cheia' })).toBeTruthy()
    Reflect.deleteProperty(document, 'fullscreenElement')
    unmount()
    expect(remove).toHaveBeenCalledWith('fullscreenchange', expect.any(Function))
    remove.mockRestore()
  })
})
