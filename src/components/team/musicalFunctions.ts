// Mesmos valores do check de `team_musical_functions` no banco.
export const MUSICAL_FUNCTIONS = [
  { value: 'vocals', label: 'Voz' },
  { value: 'acoustic-guitar', label: 'Violão' },
  { value: 'electric-guitar', label: 'Guitarra' },
  { value: 'bass', label: 'Baixo' },
  { value: 'drums', label: 'Bateria' },
  { value: 'keys', label: 'Teclado' },
  { value: 'piano', label: 'Piano' },
  { value: 'strings', label: 'Cordas' },
  { value: 'brass', label: 'Metais' },
  { value: 'woodwinds', label: 'Madeiras' },
  { value: 'other', label: 'Outra' },
] as const

export function musicalFunctionLabel(value: string): string {
  return MUSICAL_FUNCTIONS.find((item) => item.value === value)?.label ?? value
}
