export type TeamRole = 'leader' | 'member'
/** Valores persistidos (`team_memberships.status`). */
export type MemberStatus = 'active' | 'inactive'
/** Leitura para a UI: `pending_invite` vem de `organization_invites` e nunca é salvo (RN-10). */
export type MemberDisplayStatus = MemberStatus | 'pending_invite'

export interface TeamMembership {
  id: string
  teamId: string
  userId: string
  /** Autoridade do servidor: só muda por RPC; o pull sobrescreve sem LWW. */
  role: TeamRole
  /** Autoridade do servidor: só muda por RPC; o pull sobrescreve sem LWW. */
  status: MemberStatus
  createdAt: string
  updatedAt: string
}
