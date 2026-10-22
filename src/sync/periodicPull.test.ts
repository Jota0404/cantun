import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PULL_INTERVAL_MS, PULL_JITTER_MS, PULL_MIN_GAP_MS, isStagePath, startPeriodicPull } from './periodicPull'

describe('startPeriodicPull', () => {
  let stop: () => void = () => undefined
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  })
  afterEach(() => { stop(); vi.useRealTimers(); vi.restoreAllMocks() })

  const tick = () => vi.advanceTimersByTimeAsync(PULL_INTERVAL_MS + PULL_JITTER_MS)

  it('pulls on the interval while online, visible and with a session', async () => {
    const pull = vi.fn(async () => undefined)
    stop = startPeriodicPull(pull, () => true)
    await tick()
    await tick()
    expect(pull).toHaveBeenCalledTimes(2)
  })

  it('skips when hidden, offline or without session', async () => {
    const pull = vi.fn(async () => undefined)
    let session = false
    stop = startPeriodicPull(pull, () => session)
    await tick()
    session = true
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await tick()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    await tick()
    expect(pull).not.toHaveBeenCalled()
  })

  it('never overlaps pulls', async () => {
    let release: () => void = () => undefined
    const pull = vi.fn(() => new Promise<void>((resolve) => { release = resolve }))
    stop = startPeriodicPull(pull, () => true)
    await tick()
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(PULL_MIN_GAP_MS + 1)
    window.dispatchEvent(new Event('focus'))
    expect(pull).toHaveBeenCalledTimes(1)
    release()
  })

  it('pulls on refocus only after the minimum gap, and not on the stage', async () => {
    const pull = vi.fn(async () => undefined)
    stop = startPeriodicPull(pull, () => true)
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(0)
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(0)
    expect(pull).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(PULL_MIN_GAP_MS)
    window.history.pushState({}, '', '/stage/x')
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(0)
    expect(pull).toHaveBeenCalledTimes(1)
    window.history.pushState({}, '', '/')
  })

  it('pulls when the tab becomes visible again, respecting the gap', async () => {
    const pull = vi.fn(async () => undefined)
    stop = startPeriodicPull(pull, () => true)
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(pull).toHaveBeenCalledTimes(1)
  })

  it('the timer tick does not pull right after a focus pull', async () => {
    const pull = vi.fn(async () => undefined)
    stop = startPeriodicPull(pull, () => true)
    await vi.advanceTimersByTimeAsync(PULL_INTERVAL_MS - 1000)
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(PULL_JITTER_MS + 1000)
    expect(pull).toHaveBeenCalledTimes(1)
  })

  it('removes its listeners on stop()', async () => {
    const pull = vi.fn(async () => undefined)
    startPeriodicPull(pull, () => true)()
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(pull).not.toHaveBeenCalled()
  })

  it('detects the stage path regardless of the base path', () => {
    expect(isStagePath('/stage/abc', '/')).toBe(true)
    expect(isStagePath('/cantum/stage/abc', '/cantum/')).toBe(true)
    expect(isStagePath('/cantum/services', '/cantum/')).toBe(false)
    expect(isStagePath('/services/stage-notes', '/')).toBe(false)
  })

  it('stops scheduling after stop()', async () => {
    const pull = vi.fn(async () => undefined)
    startPeriodicPull(pull, () => true)()
    await tick()
    expect(pull).not.toHaveBeenCalled()
  })
})
