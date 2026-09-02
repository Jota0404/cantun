import { transposeChord } from '../music/transpose'

const CHORD_TOKEN_PATTERN =
  /^([A-G](?:#|b)?)(?:(?:m|min|maj|dim|aug|sus|add|no|omit|M|°|ø)?(?:[0-9]+)?(?:[#b][0-9]+)?(?:\/[A-G](?:#|b)?)?)$/

const SECTION_LABELS = new Set([
  'intro',
  'introdução',
  'verso',
  'verse',
  'refrão',
  'refrão 1',
  'refrão 2',
  'coro',
  'chorus',
  'ponte',
  'bridge',
  'pré-refrão',
  'pre-refrão',
  'pre-chorus',
  'final',
  'outro',
  'ending',
  'solo',
  'instrumental',
  'tab',
  'tablatura',
])

function isChordToken(token: string): boolean {
  return CHORD_TOKEN_PATTERN.test(token)
}

function isTabLine(line: string): boolean {
  const trimmed = line.trimStart()
  return /^[eBGDAE]\|/i.test(trimmed) || /^\|(?:-{2,}|={2,})/.test(trimmed)
}

function normalizeChordToken(token: string): string {
  return `[${token}]`
}

function normalizeChordOnlyLine(line: string): string | undefined {
  const leadingWhitespace = line.match(/^\s*/)?.[0] ?? ''
  const content = line.slice(leadingWhitespace.length)
  const hasLegacyPrefix = content.startsWith('>')
  const chordContent = hasLegacyPrefix ? content.slice(1).trimStart() : content
  const tokens = chordContent.match(/\S+/g) ?? []

  if (tokens.length === 0 || !tokens.every(isChordToken)) {
    return undefined
  }

  const normalized = chordContent.replace(/\S+/g, (token) => normalizeChordToken(token))

  return `${leadingWhitespace}${normalized}`
}

function normalizeLabelAndChordLine(line: string): string | undefined {
  const match = /^(\s*)(.+?)(\s+|:\s+)([A-G](?:#|b)?[^\s]*)((?:\s+[A-G](?:#|b)?[^\s]*)*)\s*$/.exec(line)
  if (!match) return undefined

  const [, indentation, label, separator, firstChord, remaining] = match
  const normalizedLabel = label.trim().toLocaleLowerCase()
  const normalizedLabelWithoutPunctuation = normalizedLabel.replace(/[:\-–—]+$/, '').trim()

  if (!SECTION_LABELS.has(normalizedLabelWithoutPunctuation)) {
    return undefined
  }

  const chordTokens = [firstChord, ...remaining.trim().split(/\s+/).filter(Boolean)]
  if (!chordTokens.every(isChordToken)) return undefined

  const separatorOutput = separator.startsWith(':') ? ': ' : separator
  return `${indentation}${label.trim()}${separatorOutput}${chordTokens.map(normalizeChordToken).join(' ')}`
}

function normalizeLegacyChordSheetLine(line: string): string {
  if (!line.trim() || isTabLine(line) || line.includes('[')) {
    return line
  }

  const chordOnly = normalizeChordOnlyLine(line)
  if (chordOnly !== undefined) {
    return chordOnly
  }

  const labelAndChords = normalizeLabelAndChordLine(line)
  if (labelAndChords !== undefined) {
    return labelAndChords
  }

  const leadingWhitespace = line.match(/^\s*/)?.[0] ?? ''
  const content = line.slice(leadingWhitespace.length)
  if (content.startsWith('>')) {
    const body = content.slice(1).trimStart()
    const token = body.split(/\s+/)[0] ?? ''
    if (token && isChordToken(token) && body === token) {
      return `${leadingWhitespace}[${token}]`
    }
  }

  return line
}

/**
 * Converts supported legacy chord-sheet notation to CANTUM's canonical
 * bracketed chord notation without touching lyric, annotation, or tablature
 * content that cannot be identified confidently as chords.
 */
export function normalizeSongLyrics(lyrics: string): string {
  return lyrics
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(normalizeLegacyChordSheetLine)
    .join('\n')
}

/**
 * Convenience helper used by tests and future callers that need a normalized
 * chord token without changing its musical content.
 */
export function normalizeChordTokenValue(token: string): string {
  if (!isChordToken(token)) return token
  return transposeChord(token, 0, 'C') === token ? `[${token}]` : token
}
