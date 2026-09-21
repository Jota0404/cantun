export type StageMusicalRole = string

export type StageMusicalRoleExperience = {
  fontSize: number
  readMode: 'scroll' | 'pages'
  showNotes: boolean
  showBpm: boolean
  showKey: boolean
  accentLabel: string
}

const DEFAULT_EXPERIENCE: StageMusicalRoleExperience = {
  fontSize: 22,
  readMode: 'scroll',
  showNotes: true,
  showBpm: true,
  showKey: true,
  accentLabel: 'Função musical',
}

const LABELS: Record<string, string> = {
  vocals: 'Voz',
  guitar: 'Guitarra',
  'electric-guitar': 'Guitarra elétrica',
  'acoustic-guitar': 'Violão',
  bass: 'Baixo',
  drums: 'Bateria',
  keys: 'Teclas',
  piano: 'Piano',
  strings: 'Cordas',
  brass: 'Metais',
  woodwinds: 'Madeiras',
  other: 'Outra função',
}

const EXPERIENCES: Record<string, Partial<StageMusicalRoleExperience>> = {
  bass: { fontSize: 24, showNotes: false },
  drums: { fontSize: 20, readMode: 'pages', showNotes: false, showKey: false },
  keys: { fontSize: 21 },
  piano: { fontSize: 21 },
  brass: { showNotes: false },
  woodwinds: { showNotes: false },
}

export function getStageMusicalRoleExperience(role: StageMusicalRole): StageMusicalRoleExperience {
  return {
    ...DEFAULT_EXPERIENCE,
    ...(EXPERIENCES[role] ?? {}),
    accentLabel: LABELS[role] ?? DEFAULT_EXPERIENCE.accentLabel,
  }
}
