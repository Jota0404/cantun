export interface Repertoire {
  id: string
  /** Ausente = repertório pessoal do `createdByUserId` (ADR-062). */
  organizationId?: string
  name: string
  createdByUserId: string
  version: number
  createdAt: string
  updatedAt: string
}
