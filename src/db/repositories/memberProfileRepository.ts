import type { MemberProfile } from '../../domain/users/memberProfile'
import type { SalmodiaDatabase } from '../database'
import { db as defaultDb } from '../database'

// Cache local de nomes (leitura offline). Não entra na fila de sync.
// B8: apagar ao sair da organização ou da conta (hoje `clearLocalUserData` já limpa no logout).
export class MemberProfileRepository {
  private readonly db: SalmodiaDatabase
  constructor(db: SalmodiaDatabase = defaultDb) {
    this.db = db
  }
  async putMany(values: MemberProfile[]): Promise<void> { await this.db.memberProfiles.bulkPut(values) }
  async namesByOrganization(organizationId: string): Promise<Record<string, string>> {
    const found = await this.db.memberProfiles.where('organizationId').equals(organizationId).toArray()
    return Object.fromEntries(found.map((profile) => [profile.userId, profile.displayName]))
  }
}
export const memberProfileRepository = new MemberProfileRepository()
