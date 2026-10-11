/** Nome de exibição de um membro, guardado só para leitura offline (não é sincronizado). */
export interface MemberProfile {
  userId: string
  displayName: string
  organizationId: string
  updatedAt: string
}
