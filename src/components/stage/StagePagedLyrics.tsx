import { useEffect, useRef, useState } from 'react'
import { StageLyrics } from './StageLyrics'

function estimateFallbackLinesPerPage(fontSize: number): number {
  const availableHeight = Math.max(
    1,
    window.innerHeight - (window.innerWidth <= 800 ? 250 : 190),
  )
  const lineHeight = fontSize * (window.innerWidth <= 800 ? 1.5 : 1.55)

  return Math.max(1, Math.floor(availableHeight / lineHeight))
}

function buildFallbackPages(lyrics: string, fontSize: number): string[] {
  const lines = lyrics.split('\n')
  const linesPerPage = estimateFallbackLinesPerPage(fontSize)
  const result: string[] = []

  for (let index = 0; index < lines.length; index += linesPerPage) {
    result.push(lines.slice(index, index + linesPerPage).join('\n'))
  }

  return result.length > 0 ? result : ['']
}

function buildVisualPages(
  lyrics: string,
  measurementElement: HTMLElement | null,
  availableHeight: number,
  fontSize: number,
): string[] {
  const lines = lyrics.split('\n')
  const lineElements = measurementElement
    ? Array.from(
        measurementElement.querySelectorAll<HTMLElement>('.stage-lyrics__line'),
      )
    : []

  const hasUsableMeasurements =
    lineElements.length === lines.length &&
    availableHeight > 0 &&
    lineElements.some((line) => line.offsetHeight > 0)

  if (!hasUsableMeasurements) {
    return buildFallbackPages(lyrics, fontSize)
  }

  const result: string[] = []
  let pageLines: string[] = []
  let pageTop = lineElements[0].offsetTop

  lineElements.forEach((lineElement, index) => {
    const lineBottom = lineElement.offsetTop + lineElement.offsetHeight
    const wouldOverflow =
      pageLines.length > 0 && lineBottom > pageTop + availableHeight

    if (wouldOverflow) {
      result.push(pageLines.join('\n'))
      pageLines = []
      pageTop = lineElement.offsetTop
    }

    pageLines.push(lines[index])
  })

  if (pageLines.length > 0) {
    result.push(pageLines.join('\n'))
  }

  return result.length > 0 ? result : ['']
}

export function StagePagedLyrics({
  lyrics,
  fontSize,
  pageIndex,
  onPageCountChange,
}: {
  lyrics: string
  fontSize: number
  pageIndex: number
  onPageCountChange: (count: number) => void
}) {
  const [pages, setPages] = useState<string[]>(() =>
    buildFallbackPages(lyrics, fontSize),
  )
  const containerRef = useRef<HTMLElement | null>(null)
  const measurementRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = containerRef.current
    const measurement = measurementRef.current
    if (!container || !measurement) return

    const updatePages = () => {
      const nextPages = buildVisualPages(
        lyrics,
        measurement,
        container.clientHeight,
        fontSize,
      )

      setPages(nextPages)
      onPageCountChange(nextPages.length)
    }

    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(updatePages)
        : undefined

    observer?.observe(container)
    observer?.observe(measurement)
    window.addEventListener('resize', updatePages)

    const fallbackTimer = window.setTimeout(updatePages, 0)

    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', updatePages)
      window.clearTimeout(fallbackTimer)
    }
  }, [fontSize, lyrics, onPageCountChange])

  const activePageIndex = Math.min(pageIndex, Math.max(0, pages.length - 1))

  return (
    <>
      <section
        ref={containerRef}
        className="stage-content--pages"
        aria-label="Página da cifra"
      >
        <StageLyrics lyrics={pages[activePageIndex] ?? ''} />
      </section>

      <div ref={measurementRef} className="stage-page-measurement" aria-hidden="true">
        <StageLyrics lyrics={lyrics} />
      </div>
    </>
  )
}
