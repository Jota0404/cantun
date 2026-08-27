import type { Setlist } from '../../domain/repertoires/setlist'
import type { SalmodiaDatabase } from '../database'
import { db as defaultDb } from '../database'
import { supabase } from '../../lib/supabase'
import { queueLocalDelete, queueLocalUpsert } from '../../sync/syncService'

export class SetlistRepository {
  private readonly db: SalmodiaDatabase

  constructor(db: SalmodiaDatabase = defaultDb) {
    this.db = db
  }

  async create(setlist: Setlist): Promise<void> {
    await this.db.setlists.add(setlist)
    await this.enqueueUpsert(setlist)
  }

  async getById(id: string): Promise<Setlist | undefined> {
    return this.db.setlists.get(id)
  }

  async list(): Promise<Setlist[]> {
    return this.db.setlists.orderBy('updatedAt').reverse().toArray()
  }

  async update(setlist: Setlist): Promise<void> {
    await this.db.setlists.put(setlist)
    await this.enqueueUpsert(setlist)
  }

  async remove(id: string): Promise<void> {
    await this.db.setlists.delete(id)
    if (!supabase) return
    const { data } = await supabase.auth.getUser()
    await queueLocalDelete(data.user?.id ?? null, 'setlists', id)
  }

  private async enqueueUpsert(setlist: Setlist) {
    if (!supabase) return
    const { data } = await supabase.auth.getUser()
    await queueLocalUpsert(data.user?.id ?? null, 'setlists', setlist)
  }
}

export const setlistRepository = new SetlistRepository()
