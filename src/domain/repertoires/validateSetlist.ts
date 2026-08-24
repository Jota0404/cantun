export interface SetlistValidationError {
  field: 'name'
  message: string
}

export function validateSetlistName(name: string): SetlistValidationError[] {
  if (!name.trim()) {
    return [{ field: 'name', message: 'Nome do repertório é obrigatório.' }]
  }

  return []
}
