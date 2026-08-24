import type { MusicalKey } from '../music/musicalKey'
import { MUSICAL_KEYS } from '../music/musicalKey'
import type { Song } from './song'

export type SongImportData = Pick<
  Song,
  'title' | 'artist' | 'originalKey' | 'currentKey' | 'bpm' | 'lyrics' | 'notes'
>

export type SongTextParseResult =
  | { success: true; data: SongImportData }
  | { success: false; errors: string[] }

const HEADER_FIELDS = {
  'Título': 'title',
  'Artista': 'artist',
  'Tom': 'key',
  'BPM': 'bpm',
  'Notas': 'notes',
} as const

type HeaderField = (typeof HEADER_FIELDS)[keyof typeof HEADER_FIELDS]

function parseHeader(line: string): { field: HeaderField; value: string } | null {
  const separatorIndex = line.indexOf(':')

  if (separatorIndex <= 0) {
    return null
  }

  const label = line.slice(0, separatorIndex).trim() as keyof typeof HEADER_FIELDS
  const field = HEADER_FIELDS[label]

  if (!field) {
    return null
  }

  return {
    field,
    value: line.slice(separatorIndex + 1).trim(),
  }
}

function isMusicalKey(value: string): value is MusicalKey {
  return MUSICAL_KEYS.includes(value as MusicalKey)
}

function normalizeChordSheetLine(line: string): string {
  const cleaned = line.replace(/^\s*">\s?/, '').trimEnd()

  if (!cleaned || cleaned.startsWith('[')) {
    return cleaned
  }

  // Existing chord sheets commonly place a chord on its own line. Convert it
  // to Salmodia's native [chord] notation so display and transposition work.
  const chordPattern = /^[A-G](?:#|b)?(?:m|min|maj|dim|aug|sus|add|no|omit|M|°|ø)?(?:[0-9]+)?(?:[#b][0-9]+)?(?:\/[A-G](?:#|b)?)?(?:\([^)]+\))?$/

  if (chordPattern.test(cleaned)) {
    return `[${cleaned}]`
  }

  return cleaned
}

function normalizeLyrics(lines: string[]): string {
  return lines.map(normalizeChordSheetLine).join('\n').trim()
}

export function parseSongText(text: string): SongTextParseResult {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const headers: Partial<Record<HeaderField, string>> = {}
  let index = 0

  while (index < lines.length && lines[index].trim() === '') {
    index += 1
  }

  const firstHeader = parseHeader(lines[index] ?? '')

  // Also accept the common chord-sheet layout used by existing .txt files:
  // title on line 1, artist on line 2, then metadata such as "Tom: D".
  if (!firstHeader && lines[index]?.trim()) {
    headers.title = lines[index].trim()
    index += 1

    while (index < lines.length && lines[index].trim() === '') {
      index += 1
    }

    if (index < lines.length && !parseHeader(lines[index])) {
      headers.artist = lines[index].trim()
      index += 1
    }
  }

  while (index < lines.length) {
    if (lines[index].trim() === '') {
      index += 1
      continue
    }

    const header = parseHeader(lines[index])

    if (!header) {
      break
    }

    headers[header.field] = header.value
    index += 1
  }

  const lyrics = normalizeLyrics(lines.slice(index))
  const title = headers.title?.trim() ?? ''
  const key = headers.key?.trim() ?? ''
  const artist = headers.artist?.trim() || undefined
  const notes = headers.notes?.trim() || undefined
  const bpmText = headers.bpm?.trim() ?? ''
  const errors: string[] = []

  if (!title) {
    errors.push('Título é obrigatório.')
  }

  if (!key) {
    errors.push('Tom é obrigatório.')
  } else if (!isMusicalKey(key)) {
    errors.push(`Tom inválido: ${key}.`)
  }

  if (!lyrics) {
    errors.push('Cifra/letra é obrigatória.')
  }

  let bpm: number | undefined

  if (bpmText) {
    bpm = Number(bpmText)

    if (!Number.isInteger(bpm) || bpm < 1 || bpm > 999) {
      errors.push('BPM deve ser um número inteiro entre 1 e 999.')
    }
  }

  if (errors.length > 0) {
    return { success: false, errors }
  }

  const musicalKey = key as MusicalKey

  return {
    success: true,
    data: {
      title,
      artist,
      originalKey: musicalKey,
      currentKey: musicalKey,
      bpm,
      lyrics,
      notes,
    },
  }
}
