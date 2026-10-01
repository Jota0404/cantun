const CHORD_TOKEN_PATTERN =
  /^([A-G](?:#|b)?)(?:(?:m|min|maj|dim|aug|sus|add|no|omit|M|°|ø)?(?:[0-9]+)?(?:[#b][0-9]+)?(?:\/[A-G](?:#|b)?)?)(?:\([^)]+\))?$/

const SECTION_LABELS = new Set([
  'intro', 'introdução', 'verso', 'verse', 'refrão', 'coro', 'chorus',
  'ponte', 'bridge', 'pré-refrão', 'pre-refrão', 'pre-chorus', 'final',
  'outro', 'ending', 'solo', 'instrumental', 'tab', 'tablatura',
])

function isChordToken(token: string): boolean {
  return CHORD_TOKEN_PATTERN.test(token)
}

function isTabLine(line: string): boolean {
  const trimmed = line.trimStart()
  return /^[eBGDAE]\|/i.test(trimmed) || /^\|(?:-{2,}|={2,})/.test(trimmed)
}

function stripLegacyChordMarker(line: string): string {
  const trimmed = line.trim()
  if (trimmed.startsWith('">')) return trimmed.slice(2).trimStart()
  if (trimmed.startsWith('>')) return trimmed.slice(1).trimStart()
  return trimmed
}

function normalizeChordOnlyLine(line: string): string | undefined {
  const chordContent = stripLegacyChordMarker(line)
  const tokens = chordContent.match(/\S+/g) ?? []

  if (tokens.length === 0 || !tokens.every(isChordToken)) return undefined

  return chordContent.replace(/\S+/g, (token) => `[${token}]`)
}

function normalizeSectionChordLine(line: string): string | undefined {
  const match = /^(\s*)([^\s:]+(?:\s+[^\s:]+)*?)(:\s*|\s+)(\S+(?:\s+\S+)*)$/.exec(line)
  if (!match) return undefined

  const [, indentation, label, separator, chordPart] = match
  const normalizedLabel = label.toLocaleLowerCase().replace(/[:\-–—]+$/, '').trim()
  if (!SECTION_LABELS.has(normalizedLabel)) return undefined

  const chords = chordPart.split(/\s+/)
  if (!chords.every(isChordToken)) return undefined

  return `${indentation}${label}${separator}${chords.map((chord) => `[${chord}]`).join(' ')}`
}

/**
 * Normalizes legacy chord-sheet lines into CANTUM's canonical [Chord]
 * notation. Lines that cannot be classified confidently are preserved exactly.
 * This is intentionally conservative so lyric text and tablature are never
 * rewritten as chords by accident.
 */
export function normalizeSongLyrics(lyrics: string): string {
  return lyrics
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => {
      if (!line.trim() || isTabLine(line) || line.includes('[')) return line

      return normalizeChordOnlyLine(line) ?? normalizeSectionChordLine(line) ?? line
    })
    .join('\n')
}
