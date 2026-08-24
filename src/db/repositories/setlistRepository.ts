import type { Setlist } from '../../domain/repertoires/setlist'
import type { SalmodiaDatabase } from '../database'
import { db as defaultDb } from '../database'

export class SetlistRepository {
  private readonly db: SalmodiaDatabase

  constructor(db: SalmodiaDatabase = defaultDb) {
    this.db = db
  }

  async create(setlist: Setlist): Promise<void> {
    await this.db.setlists.add(setlist)
  }

  async getById(id: string): Promise<Setlist | undefined> {
    return this.db.setlists.get(id)
  }

  async list(): Promise<Setlist[]> {
    return this.db.setlists.orderBy('updatedAt').reverse().toArray()
  }

  async update(setlist: Setlist): Promise<void> {
    await this.db.setlists.put(setlist)
  }

  async remove(id: string): Promise<void> {
    await this.db.setlists.delete(id)
  }
}

export const setlistRepository = new SetlistRepository()
