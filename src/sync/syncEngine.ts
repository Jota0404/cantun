import type { SupabaseClient } from '@supabase/supabase-js'
import type { SalmodiaDatabase } from '../db/database'
import type { Song } from '../domain/songs/song'
import type { Setlist } from '../domain/repertoires/setlist'
import type { SetlistSong } from '../domain/repertoires/setlistSong'

type EntityName = 'songs' | 'setlists' | 'setlistSongs'
type Entity = Song | Setlist | SetlistSong

interface SyncQueueItem {
  id?: number
  userId: string
  entity: EntityName
  entityId: string
  operation: 'upsert' | 'delete'
  payload?: Entity
  updatedAt: string
  attempts: number
}

const tables: Record<EntityName, string> = {
  songs: 'songs',
  setlists: 'setlists',
  setlistSongs: 'setlist_songs',
}

export class SyncEngine {
  private syncing = false

  constructor(
    private readonly db: SalmodiaDatabase,
    private readonly client: SupabaseClient,
  ) {}

  async queueUpsert(userId: string, entity: EntityName, payload: Entity) {
    const entityId = payload.id
    await this.db.syncQueue.put({ userId, entity, entityId, operation: 'upsert', payload, updatedAt: getUpdatedAt(payload), attempts: 0 })
    void this.sync(userId)
  }

  async queueDelete(userId: string, entity: EntityName, entityId: string, updatedAt = new Date().toISOString()) {
    await this.db.syncQueue.put({ userId, entity, entityId, operation: 'delete', updatedAt, attempts: 0 })
    void this.sync(userId)
  }

  async sync(userId: string) {
    if (this.syncing || !navigator.onLine) return
    this.syncing = true
    try {
      await this.pull(userId)
      const pending = await this.db.syncQueue.where('userId').equals(userId).sortBy('id')
      for (const item of pending) {
        try {
          await this.pushItem(userId, item)
          if (item.id !== undefined) await this.db.syncQueue.delete(item.id)
        } catch {
          await this.db.syncQueue.update(item.id!, { attempts: item.attempts + 1 })
        }
      }
      await this.pull(userId)
    } finally {
      this.syncing = false
    }
  }

  private async pushItem(userId: string, item: SyncQueueItem) {
    const table = tables[item.entity]
    if (item.operation === 'delete') {
      const { error } = await this.client.from(table).delete().eq('user_id', userId).eq('id', item.entityId)
      if (error) throw error
      return
    }
    const row = { ...(item.payload as object), user_id: userId }
    const { error } = await this.client.from(table).upsert(row, { onConflict: 'user_id,id' })
    if (error) throw error
  }

  private async pull(userId: string) {
    for (const entity of Object.keys(tables) as EntityName[]) {
      const { data, error } = await this.client.from(tables[entity]).select('*').eq('user_id', userId)
      if (error) throw error
      for (const row of data ?? []) await this.applyRemote(entity, row as Entity)
    }
  }

  private async applyRemote(entity: EntityName, remote: Entity) {
    if (entity === 'songs') await this.db.songs.put(remote as Song)
    else if (entity === 'setlists') await this.db.setlists.put(remote as Setlist)
    else await this.db.setlistSongs.put(remote as SetlistSong)
  }
}

function getUpdatedAt(entity: Entity) {
  return 'updatedAt' in entity ? entity.updatedAt : new Date().toISOString()
}

export type { SyncQueueItem }
