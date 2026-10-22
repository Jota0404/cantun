import { useCallback, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

export type StageReadMode = 'scroll' | 'pages'

export function useStageReadMode(pauseAutoScroll: () => void) {
  const [readMode, setReadMode] = useState<StageReadMode>('scroll')
  const [pageIndex, setPageIndex] = useState(0)
  const [pageCount, setPageCount] = useState(1)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

  const activePageIndex = Math.min(pageIndex, Math.max(0, pageCount - 1))

  const handlePageCountChange = useCallback((count: number) => {
    setPageCount(count)
  }, [])

  function selectPage(index: number) {
    if (index < 0 || index >= pageCount) return

    setPageIndex(index)
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest('button, input, label')) return

    touchStartRef.current = { x: event.clientX, y: event.clientY }
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLElement>) {
    const start = touchStartRef.current
    touchStartRef.current = null
    if (!start) return

    const deltaX = event.clientX - start.x
    const deltaY = event.clientY - start.y
    const horizontalSwipe =
      Math.abs(deltaX) >= 64 && Math.abs(deltaX) > Math.abs(deltaY)

    if (readMode !== 'pages') return

    if (horizontalSwipe) {
      selectPage(deltaX < 0 ? activePageIndex + 1 : activePageIndex - 1)
      return
    }

    if (Math.abs(deltaX) < 18 && Math.abs(deltaY) < 18) {
      const width = window.innerWidth

      if (event.clientX >= width * 0.78) {
        selectPage(activePageIndex + 1)
      } else if (event.clientX <= width * 0.22) {
        selectPage(activePageIndex - 1)
      }
    }
  }

  function handlePointerCancel() {
    touchStartRef.current = null
  }

  function changeReadMode(mode: StageReadMode) {
    setReadMode(mode)
    setPageIndex(0)
    setPageCount(1)

    if (mode === 'pages') {
      pauseAutoScroll()
      window.scrollTo({ top: 0 })
    }
  }

  // Called when a new song loads: back to the first page.
  const resetPages = useCallback(() => {
    setPageIndex(0)
    setPageCount(1)
  }, [])

  return {
    readMode,
    activePageIndex,
    pageCount,
    handlePageCountChange,
    handlePointerDown,
    handlePointerUp,
    handlePointerCancel,
    changeReadMode,
    resetPages,
  }
}
