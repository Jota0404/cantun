import type { SupabaseClient } from '@supabase/supabase-js'
import type { SalmodiaDatabase } from '../db/database'
import type { Song } from '../domain/songs/song'

type EntityName = 'songs'
type Entity = Song

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

interface RemoteRow {
  id: string
  updated_at?: string
  deleted_at?: string | null
  [key: string]: unknown
}

const tables: Record<EntityName, string> = { songs: 'songs' }
const SYNC_RETRY_DELAY_MS = 10000

export class SyncEngine {
  private syncing = false
  private retryTimer: number | undefined
  private readonly db: SalmodiaDatabase
  private readonly client: SupabaseClient

  constructor(db: SalmodiaDatabase, client: SupabaseClient) {
    this.db = db
    this.client = client
  }

  async queueUpsert(userId: string, entity: EntityName, payload: Entity) {
    await this.db.syncQueue.where('[userId+entity+entityId]').equals([userId, entity, payload.id]).delete()
    await this.db.syncQueue.add({ userId, entity, entityId: payload.id, operation: 'upsert', payload, updatedAt: getUpdatedAt(payload), attempts: 0 })
    void this.sync(userId)
  }

  async queueDelete(userId: string, entity: EntityName, entityId: string, updatedAt = new Date().toISOString()) {
    await this.db.syncQueue.where('[userId+entity+entityId]').equals([userId, entity, entityId]).delete()
    await this.db.syncQueue.add({ userId, entity, entityId, operation: 'delete', updatedAt, attempts: 0 })
    void this.sync(userId)
  }

  async bootstrap(userId: string) {
    if (!navigator.onLine) return
    const { count, error } = await this.client.from('songs').select('id', { count: 'exact', head: true }).eq('user_id', userId)
    const remoteIsEmpty = !error && (count ?? 0) === 0
    if (!remoteIsEmpty) return this.sync(userId)

    const songs = await this.db.songs.toArray()
    for (const song of songs) await this.queueUpsert(userId, 'songs', song)
    await this.sync(userId)
  }

  async sync(userId: string) {
    if (this.syncing) return

    this.syncing = true
    try {
      if (navigator.onLine) {
        await this.pushPending(userId)
        await this.pull(userId)
      }
    } finally {
      this.syncing = false
    }

    const remaining = await this.db.syncQueue.where('userId').equals(userId).count()
    if (remaining > 0) {
      this.scheduleRetry(userId)
    } else {
      this.clearRetry()
    }
  }

  private scheduleRetry(userId: string) {
    if (this.retryTimer !== undefined) return
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = undefined
      void this.sync(userId)
    }, SYNC_RETRY_DELAY_MS)
  }

  private clearRetry() {
    if (this.retryTimer === undefined) return
    window.clearTimeout(this.retryTimer)
    this.retryTimer = undefined
  }

  private async pushPending(userId: string) {
    const pending = await this.db.syncQueue.where('userId').equals(userId).sortBy('id')
    for (const item of pending) {
      try {
        await this.pushItem(userId, item)
        if (item.id !== undefined) await this.db.syncQueue.delete(item.id)
      } catch {
        if (item.id !== undefined) await this.db.syncQueue.update(item.id, { attempts: item.attempts + 1 })
      }
    }
  }

  private async pushItem(userId: string, item: SyncQueueItem) {
    const table = tables[item.entity]
    const { data: remote, error: readError } = await this.client
      .from(table)
      .select('id, updated_at, deleted_at')
      .eq('user_id', userId)
      .eq('id', item.entityId)
      .maybeSingle()
    if (readError) throw readError

    const remoteUpdatedAt = remote ? getRemoteUpdatedAt(remote as RemoteRow) : undefined
    if (remoteUpdatedAt && remoteUpdatedAt >= item.updatedAt) return

    if (item.operation === 'delete') {
      const { error } = await this.client.from(table).update({ deleted_at: item.updatedAt }).eq('user_id', userId).eq('id', item.entityId)
      if (error) throw error
      return
    }
    const { error } = await this.client.from(table).upsert({ ...toRemoteRow(item.payload!), user_id: userId, deleted_at: null }, { onConflict: 'user_id,id' })
    if (error) throw error
  }

  private async pull(userId: string) {
    for (const entity of Object.keys(tables) as EntityName[]) {
      const { data, error } = await this.client.from(tables[entity]).select('*').eq('user_id', userId)
      if (error) continue
      for (const row of (data ?? []) as RemoteRow[]) await this.applyRemote(userId, entity, row)
    }
  }

  private async applyRemote(userId: string, entity: EntityName, remote: RemoteRow) {
    const pending = await this.db.syncQueue.where('[userId+entity+entityId]').equals([userId, entity, remote.id]).first()
    if (pending) return

    const local = await this.db.songs.get(remote.id)
    const remoteUpdatedAt = getRemoteUpdatedAt(remote)
    if (!remoteUpdatedAt || (local && getUpdatedAt(local) > remoteUpdatedAt)) return

    if (remote.deleted_at) {
      await this.db.songs.delete(remote.id)
      return
    }

    await this.db.songs.put(fromRemoteRow(remote))
  }
}

function toRemoteRow(song: Entity) {
  return { id: song.id, title: song.title, artist: song.artist ?? null, original_key: song.originalKey, current_key: song.currentKey, bpm: song.bpm ?? null, lyrics: song.lyrics, notes: song.notes ?? null, is_favorite: song.isFavorite, created_at: song.createdAt, updated_at: song.updatedAt }
}

function fromRemoteRow(row: RemoteRow): Entity {
  return { id: row.id, title: row.title as string, artist: (row.artist as string | null) ?? undefined, originalKey: row.original_key as Song['originalKey'], currentKey: row.current_key as Song['currentKey'], bpm: (row.bpm as number | null) ?? undefined, lyrics: row.lyrics as string, notes: (row.notes as string | null) ?? undefined, isFavorite: row.is_favorite as boolean, createdAt: row.created_at as string, updatedAt: row.updated_at as string }
}

function getUpdatedAt(entity: Entity) {
  return entity.updatedAt
}

function getRemoteUpdatedAt(row: RemoteRow) {
  if (row.deleted_at && row.updated_at) return row.deleted_at > row.updated_at ? row.deleted_at : row.updated_at
  return row.deleted_at ?? row.updated_at
}

export type { SyncQueueItem }
