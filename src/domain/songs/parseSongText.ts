import type { MusicalKey } from '../music/musicalKey'
import { MUSICAL_KEYS } from '../music/musicalKey'
import type { Song } from './song'
import { normalizeSongLyrics } from './normalizeSongLyrics'

export type SongImportData = Pick<
  Song,
  'title' | 'artist' | 'originalKey' | 'currentKey' | 'bpm' | 'lyrics' | 'notes'
>

export type SongTextParseResult =
  | { success: true; data: SongImportData }
  | { success: false; errors: string[] }

// RN-A4: rótulos aceitos sem diferenciar caixa nem acento.
const HEADER_LABELS: Record<string, 'title' | 'artist' | 'key' | 'bpm' | 'notes'> = {
  titulo: 'title', title: 'title', musica: 'title',
  artista: 'artist', artist: 'artist',
  tom: 'key', key: 'key',
  bpm: 'bpm',
  notas: 'notes', nota: 'notes', notes: 'notes', observacoes: 'notes', observacao: 'notes', obs: 'notes',
}

type HeaderField = (typeof HEADER_LABELS)[string]

function normalizeLabel(label: string): string {
  return label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
}

function parseHeader(line: string): { field: HeaderField; value: string } | null {
  const separatorIndex = line.indexOf(':')

  if (separatorIndex <= 0) return null

  const field = HEADER_LABELS[normalizeLabel(line.slice(0, separatorIndex))]

  if (!field) return null

  return {
    field,
    value: line.slice(separatorIndex + 1).trim(),
  }
}

/** Aceita tônica em maiúscula ou minúscula (`d`, `f#`, `bb`) e o sufixo `m` de tom menor (`Am`, `f#m`). */
export function normalizeMusicalKey(value: string): MusicalKey | undefined {
  const match = /^([A-Ga-g])([#♯b♭]?)(m?)$/.exec(value.trim())
  if (!match) return undefined
  const accidental = match[2] === '♯' ? '#' : match[2] === '♭' ? 'b' : match[2]
  const key = `${match[1].toUpperCase()}${accidental}${match[3]}`
  return MUSICAL_KEYS.includes(key as MusicalKey) ? key as MusicalKey : undefined
}

function parseLines(text: string) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const headers: Partial<Record<HeaderField, string>> = {}
  let index = 0

  while (index < lines.length && lines[index].trim() === '') index += 1

  const firstHeader = parseHeader(lines[index] ?? '')

  // Also accept the common chord-sheet layout used by existing .txt files:
  // title on line 1, artist on line 2, then metadata such as "Tom: D".
  if (!firstHeader && lines[index]?.trim()) {
    headers.title = lines[index].trim()
    index += 1

    while (index < lines.length && lines[index].trim() === '') index += 1

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
    if (!header) break

    headers[header.field] = header.value
    index += 1
  }

  return { headers, lyrics: normalizeSongLyrics(lines.slice(index).join('\n')).trim() }
}

/** Rascunho da importação: o tom pode faltar; a tela de revisão obriga a escolher (RN-A4/A5). */
export type SongImportDraft = Omit<SongImportData, 'originalKey' | 'currentKey'> & {
  originalKey?: MusicalKey
  currentKey?: MusicalKey
  /** Texto original do tom quando não foi reconhecido (ex.: `Am`, `H`), para a revisão mostrar. */
  rawKey?: string
}

export type SongDraftParseResult =
  | { success: true; data: SongImportDraft }
  | { success: false; errors: string[] }

/** Importação tolerante: tom ausente ou inválido não reprova. Título, letra e BPM ainda são validados. */
export function parseSongDraft(text: string): SongDraftParseResult {
  const { headers, lyrics } = parseLines(text)
  const title = headers.title?.trim() ?? ''
  const rawKey = headers.key?.trim() || undefined
  const key = rawKey ? normalizeMusicalKey(rawKey) : undefined
  const bpmText = headers.bpm?.trim() ?? ''
  const errors: string[] = []

  if (!title) errors.push('Título é obrigatório.')
  if (!lyrics) errors.push('Cifra/letra é obrigatória.')

  let bpm: number | undefined
  if (bpmText) {
    bpm = Number(bpmText)
    if (!Number.isInteger(bpm) || bpm < 1 || bpm > 999) {
      errors.push('BPM deve ser um número inteiro entre 1 e 999.')
    }
  }

  if (errors.length > 0) return { success: false, errors }

  return {
    success: true,
    data: {
      title,
      artist: headers.artist?.trim() || undefined,
      originalKey: key,
      currentKey: key,
      rawKey: key ? undefined : rawKey,
      bpm,
      lyrics,
      notes: headers.notes?.trim() || undefined,
    },
  }
}

/** Versão estrita: exige tom válido. A tela de importação nova usa `parseSongDraft`. */
export function parseSongText(text: string): SongTextParseResult {
  const parsed = parseSongDraft(text)
  if (!parsed.success) {
    // Mantém o conjunto de erros da versão estrita, incluindo o tom.
    const extra = collectKeyError(text)
    return { success: false, errors: extra ? insertKeyError(parsed.errors, extra) : parsed.errors }
  }
  const { originalKey, rawKey, ...rest } = parsed.data
  if (!originalKey) return { success: false, errors: [rawKey ? `Tom inválido: ${rawKey}.` : 'Tom é obrigatório.'] }
  return { success: true, data: { ...rest, originalKey, currentKey: originalKey } }
}

function collectKeyError(text: string): string | null {
  const { headers } = parseLines(text)
  const raw = headers.key?.trim()
  if (!raw) return 'Tom é obrigatório.'
  return normalizeMusicalKey(raw) ? null : `Tom inválido: ${raw}.`
}

// Ordem histórica dos erros: título, tom, letra, BPM.
function insertKeyError(errors: string[], keyError: string): string[] {
  const afterTitle = errors[0] === 'Título é obrigatório.' ? 1 : 0
  return [...errors.slice(0, afterTitle), keyError, ...errors.slice(afterTitle)]
}
