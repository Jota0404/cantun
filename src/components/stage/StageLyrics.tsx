type ParsedStageLine = {
  type: 'text' | 'chord'
  value: string
}

const LEGACY_CHORD_PATTERN = /^(?:[A-G](?:#|b)?)(?:(?:m|min|maj|dim|aug|sus|add|no|omit|M|°|ø)?(?:[0-9]+)?(?:[#b][0-9]+)?(?:\/[A-G](?:#|b)?)?)(?:\([^)]+\))?$/

function isChordToken(value: string): boolean {
  return LEGACY_CHORD_PATTERN.test(value)
}

function parseStageLine(line: string): ParsedStageLine[] {
  if (!line) return [{ type: 'text', value: '' }]

  const parts: ParsedStageLine[] = []
  let cursor = 0
  const chordPattern = /\[([^\]]+)\]/g
  let match = chordPattern.exec(line)

  while (match) {
    if (match.index > cursor) {
      parts.push({ type: 'text', value: line.slice(cursor, match.index) })
    }

    parts.push({ type: 'chord', value: match[1] })
    cursor = match.index + match[0].length
    match = chordPattern.exec(line)
  }

  if (parts.length > 0) {
    if (cursor < line.length) {
      parts.push({ type: 'text', value: line.slice(cursor) })
    }

    return parts
  }

  const legacyLine = line.replace(/^\s*"?>\s?/, '').trim()
  const legacyTokens = legacyLine.split(/(\s+)/).filter(Boolean)
  const hasLegacyChords =
    legacyLine.length > 0 &&
    legacyTokens.every((token) => /^\s+$/.test(token) || isChordToken(token)) &&
    legacyTokens.some((token) => isChordToken(token))

  if (hasLegacyChords) {
    return legacyTokens.map((token) =>
      /^\s+$/.test(token)
        ? { type: 'text', value: token }
        : { type: 'chord', value: token },
    )
  }

  return [{ type: 'text', value: line }]
}

export function StageLyrics({ lyrics, className = '' }: { lyrics: string; className?: string }) {
  return (
    <div className={`stage-lyrics${className ? ` ${className}` : ''}`}>
      {lyrics.split('\n').map((line, index) => (
        <div className="stage-lyrics__line" key={`${index}-${line}`}>
          {parseStageLine(line).map((part, partIndex) =>
            part.type === 'chord' ? (
              <span
                className="stage-chord"
                key={`${index}-${partIndex}-${part.value}`}
              >
                {part.value}
              </span>
            ) : (
              <span key={`${index}-${partIndex}-${part.value}`}>{part.value}</span>
            ),
          )}
        </div>
      ))}
    </div>
  )
}
