export type MajorKey =
  | 'C' | 'C#' | 'Db' | 'D' | 'D#' | 'Eb' | 'E' | 'F' | 'F#' | 'Gb' | 'G' | 'G#' | 'Ab' | 'A' | 'A#' | 'Bb' | 'B'

/** Tom menor: a tônica seguida de `m` (`Am`, `F#m`, `Bbm`). */
export type MusicalKey = MajorKey | `${MajorKey}m`

export const MAJOR_KEYS: readonly MajorKey[] = [
  'C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B',
]

export const MINOR_KEYS: readonly MusicalKey[] = MAJOR_KEYS.map((key) => `${key}m` as const)

export const MUSICAL_KEYS: readonly MusicalKey[] = [...MAJOR_KEYS, ...MINOR_KEYS]
