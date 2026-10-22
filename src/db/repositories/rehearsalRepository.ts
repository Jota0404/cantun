import type { Rehearsal, RehearsalSong } from '../../domain/services/rehearsal'
import { rehearsalSongId } from '../../domain/services/rehearsal'
import type { SalmodiaDatabase } from '../database'
import { db as defaultDb } from '../database'
import { queueTargetUpserts, queueTargetDeleteAtomic } from '../../sync/syncService'

export class RehearsalRepository {
  private readonly db: SalmodiaDatabase
  constructor(db: SalmodiaDatabase = defaultDb) {
    this.db = db
  }
  async get(id: string): Promise<Rehearsal | undefined> { return this.db.rehearsals.get(id) }
  async listByServiceId(serviceId: string): Promise<Rehearsal[]> { return this.db.rehearsals.where('serviceId').equals(serviceId).sortBy('startsAt') }
  async listSongs(rehearsalId: string): Promise<RehearsalSong[]> { return this.db.rehearsalSongs.where('rehearsalId').equals(rehearsalId).toArray() }

  /** Grava e enfileira ensaio e músicas em foco numa única transação (ensaio antes das linhas). */
  async save(value: Rehearsal, serviceItemIds: string[]): Promise<void> {
    const current = await this.listSongs(value.id)
    const removed = current.filter((s) => !serviceItemIds.includes(s.serviceItemId))
    const songs: RehearsalSong[] = serviceItemIds.map((serviceItemId) => ({ rehearsalId: value.id, serviceItemId }))
    const added = songs.filter((s) => !current.some((c) => c.serviceItemId === s.serviceItemId))
    await queueTargetUpserts('rehearsals', [value], [this.db.rehearsals, this.db.rehearsalSongs], async () => {
      await this.db.rehearsals.put(value)
      await this.db.rehearsalSongs.bulkDelete(removed.map((s) => [s.rehearsalId, s.serviceItemId]))
      await this.db.rehearsalSongs.bulkPut(songs)
    }, { deleteSongIds: removed.map((s) => rehearsalSongId(s.rehearsalId, s.serviceItemId)), upsertSongs: added })
  }

  /** O banco apaga as linhas em cascata; localmente apaga as dele na mesma transação. */
  async remove(id: string): Promise<void> {
    await queueTargetDeleteAtomic('rehearsals', id, [this.db.rehearsals, this.db.rehearsalSongs], async () => {
      await this.db.rehearsals.delete(id)
      await this.db.rehearsalSongs.where('rehearsalId').equals(id).delete()
    })
  }
}
export const rehearsalRepository = new RehearsalRepository()
