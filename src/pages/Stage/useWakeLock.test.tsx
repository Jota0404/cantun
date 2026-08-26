// @vitest-environment jsdom

import { render } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWakeLock } from './useWakeLock'

type FakeSentinel = EventTarget & {
  release: ReturnType<typeof vi.fn>
}

function TestComponent() {
  useWakeLock()
  return null
}

describe('useWakeLock', () => {
  let request: ReturnType<typeof vi.fn>
  let sentinel: FakeSentinel

  beforeEach(() => {
    request = vi.fn()
    sentinel = Object.assign(new EventTarget(), {
      release: vi.fn().mockResolvedValue(undefined),
    })

    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request },
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    Reflect.deleteProperty(navigator, 'wakeLock')
  })

  it('requests a screen wake lock when the API is available', async () => {
    request.mockResolvedValue(sentinel)

    render(<TestComponent />)

    await vi.waitFor(() => {
      expect(request).toHaveBeenCalledWith('screen')
    })
  })

  it('does not fail when the API is unavailable', () => {
    Reflect.deleteProperty(navigator, 'wakeLock')

    expect(() => render(<TestComponent />)).not.toThrow()
  })

  it('does not fail when the request is rejected', async () => {
    request.mockRejectedValue(new Error('Denied'))

    expect(() => render(<TestComponent />)).not.toThrow()

    await vi.waitFor(() => {
      expect(request).toHaveBeenCalledWith('screen')
    })
  })

  it('releases the wake lock when the component unmounts', async () => {
    request.mockResolvedValue(sentinel)
    const { unmount } = render(<TestComponent />)

    await vi.waitFor(() => {
      expect(request).toHaveBeenCalled()
    })

    unmount()

    expect(sentinel.release).toHaveBeenCalledTimes(1)
  })

  it('safely clears the sentinel when the lock is lost and reacquires when visible', async () => {
    request.mockResolvedValue(sentinel)
    render(<TestComponent />)

    await vi.waitFor(() => {
      expect(request).toHaveBeenCalledTimes(1)
    })

    await act(async () => {
      sentinel.dispatchEvent(new Event('release'))
    })

    request.mockResolvedValueOnce(sentinel)

    await act(async () => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'visible',
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await vi.waitFor(() => {
      expect(request).toHaveBeenCalledTimes(2)
    })
  })
})
