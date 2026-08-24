import { useCallback, useEffect, useRef, useState } from 'react'

export const AUTO_SCROLL_SPEEDS = [
  { value: 60, label: 'Lenta' },
  { value: 120, label: 'Normal' },
  { value: 240, label: 'Rápida' },
] as const

export function getAutoScrollSpeedLabel(speed: number) {
  return (
    AUTO_SCROLL_SPEEDS.find((option) => option.value === speed)?.label ??
    'Normal'
  )
}

export function useAutoScroll() {
  const [speed, setSpeed] = useState(120)
  const [isScrolling, setIsScrolling] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)

  const frameRef = useRef<number | null>(null)
  const lastTimestampRef = useRef<number | null>(null)
  const speedRef = useRef(speed)
  const isScrollingRef = useRef(false)
  const tickRef = useRef<FrameRequestCallback>(() => undefined)

  useEffect(() => {
    speedRef.current = speed
  }, [speed])

  const stop = useCallback(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }

    lastTimestampRef.current = null
    isScrollingRef.current = false
    setIsScrolling(false)
  }, [])

  useEffect(() => {
    tickRef.current = (timestamp) => {
      if (!isScrollingRef.current) return

      const lastTimestamp = lastTimestampRef.current ?? timestamp
      const elapsed = Math.min(timestamp - lastTimestamp, 100)

      lastTimestampRef.current = timestamp

      const maxScrollTop = Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight,
      )

      const remaining = maxScrollTop - window.scrollY

      if (remaining <= 0) {
        stop()
        return
      }

      const distance = (speedRef.current * elapsed) / 1000
      const scrollDistance = Math.min(distance, remaining)

      window.scrollBy({
        top: scrollDistance,
        behavior: 'auto',
      })

      if (scrollDistance >= remaining) {
        stop()
        return
      }

      frameRef.current = window.requestAnimationFrame(tickRef.current)
    }
  }, [stop])

  const start = useCallback(() => {
    if (isScrollingRef.current) return

    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current)
    }

    isScrollingRef.current = true
    setHasStarted(true)
    setIsScrolling(true)
    lastTimestampRef.current = null

    frameRef.current = window.requestAnimationFrame(tickRef.current)
  }, [])

  const pause = useCallback(() => {
    stop()
  }, [stop])

  const restartAtCurrentPosition = useCallback(() => {
    if (!isScrollingRef.current) return

    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current)
    }

    lastTimestampRef.current = null
    frameRef.current = window.requestAnimationFrame(tickRef.current)
  }, [])

  useEffect(() => {
    return () => stop()
  }, [stop])

  return {
    speed,
    setSpeed,
    isScrolling,
    hasStarted,
    start,
    pause,
    restartAtCurrentPosition,
  }
}