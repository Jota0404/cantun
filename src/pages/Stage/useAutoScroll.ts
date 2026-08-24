import { useEffect, useRef, useState } from 'react'

export const AUTO_SCROLL_SPEEDS = [
  { value: 20, label: 'Lenta' },
  { value: 40, label: 'Normal' },
  { value: 70, label: 'Rápida' },
] as const

export function getAutoScrollSpeedLabel(speed: number) {
  return AUTO_SCROLL_SPEEDS.find((option) => option.value === speed)?.label ?? 'Normal'
}

export function useAutoScroll() {
  const [speed, setSpeed] = useState(40)
  const [isScrolling, setIsScrolling] = useState(false)
  const frameRef = useRef<number | null>(null)
  const lastTimestampRef = useRef<number | null>(null)
  const speedRef = useRef(speed)
  const isScrollingRef = useRef(false)

  useEffect(() => {
    speedRef.current = speed
  }, [speed])

  function stop() {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    lastTimestampRef.current = null
    isScrollingRef.current = false
    setIsScrolling(false)
  }

  function tick(timestamp: number) {
    if (!isScrollingRef.current) return

    const lastTimestamp = lastTimestampRef.current ?? timestamp
    const elapsed = Math.min(timestamp - lastTimestamp, 100)
    lastTimestampRef.current = timestamp

    const maxScrollTop = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
    if (window.scrollY >= maxScrollTop) {
      stop()
      return
    }

    window.scrollBy({ top: (speedRef.current * elapsed) / 1000, behavior: 'auto' })
    frameRef.current = window.requestAnimationFrame(tick)
  }

  function start() {
    if (isScrollingRef.current) return

    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current)
    }

    isScrollingRef.current = true
    setIsScrolling(true)
    lastTimestampRef.current = null
    frameRef.current = window.requestAnimationFrame(tick)
  }

  function pause() {
    stop()
  }

  function restartAtCurrentPosition() {
    if (!isScrollingRef.current) return

    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current)
    }
    lastTimestampRef.current = null
    frameRef.current = window.requestAnimationFrame(tick)
  }

  useEffect(() => () => stop(), [])

  return {
    speed,
    setSpeed,
    isScrolling,
    start,
    pause,
    restartAtCurrentPosition,
  }
}
