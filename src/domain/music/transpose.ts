import type { MajorKey, MusicalKey } from './musicalKey'

const KEY_TO_PITCH: Record<MajorKey, number> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
}

const SHARP_KEYS: readonly MajorKey[] = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
]

const FLAT_KEYS: readonly MajorKey[] = [
  'C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B',
]

const CHORD_TOKEN_PATTERN =
  /^([A-G](?:#|b)?)(?:(?:m|min|maj|dim|aug|sus|add|no|omit|M|°|ø)?(?:[0-9]+)?(?:[#b][0-9]+)?(?:\/[A-G](?:#|b)?)?)(?:\([^)]+\))?$/

function normalizePitch(pitch: number): number {
  return ((pitch % 12) + 12) % 12
}

/** Tônica sem o sufixo de modo: `F#m` → `F#`. */
function keyRoot(key: MusicalKey): MajorKey {
  return (key.endsWith('m') ? key.slice(0, -1) : key) as MajorKey
}

function keySpelling(key: MusicalKey): readonly MajorKey[] {
  return keyRoot(key).includes('b') ? FLAT_KEYS : SHARP_KEYS
}

export function getKeyPitch(key: MusicalKey): number {
  return KEY_TO_PITCH[keyRoot(key)]
}

export function getSemitoneDistance(from: MusicalKey, to: MusicalKey): number {
  return normalizePitch(getKeyPitch(to) - getKeyPitch(from))
}

/** Preserva o modo (maior/menor) e a grafia da tônica (ADR-007). */
export function transposeKey(key: MusicalKey, semitones: number): MusicalKey {
  const root = keySpelling(key)[normalizePitch(getKeyPitch(key) + semitones)]
  return (key.endsWith('m') ? `${root}m` : root) as MusicalKey
}

function transposeChordRoot(
  root: string,
  semitones: number,
  spelling: readonly MajorKey[],
): string {
  const rootPitch = KEY_TO_PITCH[root as MajorKey]
  if (rootPitch === undefined) return root
  return spelling[normalizePitch(rootPitch + semitones)]
}

export function transposeChord(
  chord: string,
  semitones: number,
  referenceKey: MusicalKey = 'C',
): string {
  if (!CHORD_TOKEN_PATTERN.test(chord)) return chord

  const rootMatch = /^([A-G](?:#|b)?)(.*)$/.exec(chord)
  if (!rootMatch) return chord

  const [, root, suffix] = rootMatch
  const spelling = keySpelling(referenceKey)
  const transposedRoot = transposeChordRoot(root, semitones, spelling)
  const transposedSuffix = suffix.replace(
    /\/([A-G](?:#|b)?)$/,
    (_, bass: string) => `/${transposeChordRoot(bass, semitones, spelling)}`,
  )

  return `${transposedRoot}${transposedSuffix}`
}

export function transposeSongLyrics(
  lyrics: string,
  semitones: number,
  referenceKey: MusicalKey = 'C',
): string {
  return lyrics.replace(/\[([^\]]+)\]/g, (match, chord: string) => {
    if (!CHORD_TOKEN_PATTERN.test(chord)) return match

    return `[${transposeChord(chord, semitones, referenceKey)}]`
  })
}
