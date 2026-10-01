export const MUSICAL_ROLES = [
  'vocals',
  'electric-guitar',
  'acoustic-guitar',
  'bass',
  'drums',
  'keys',
  'piano',
  'strings',
  'brass',
  'woodwinds',
  'other',
] as const

export type MusicalRole = typeof MUSICAL_ROLES[number]

export type MusicalRoleLabel = {
  role: MusicalRole
  label: string
}

export const MUSICAL_ROLE_LABELS: Record<MusicalRole, string> = {
  vocals: 'Vocal',
  'electric-guitar': 'Guitarra elétrica',
  'acoustic-guitar': 'Violão',
  bass: 'Baixo',
  drums: 'Bateria',
  keys: 'Teclas',
  piano: 'Piano',
  strings: 'Cordas',
  brass: 'Metais',
  woodwinds: 'Madeiras',
  other: 'Outro',
}

export function isMusicalRole(value: unknown): value is MusicalRole {
  return typeof value === 'string' && MUSICAL_ROLES.includes(value as MusicalRole)
}

export function toMusicalRole(value: unknown, fallback: MusicalRole = 'other'): MusicalRole {
  return isMusicalRole(value) ? value : fallback
}
