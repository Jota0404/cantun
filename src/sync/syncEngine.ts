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

interface RemoteRow {
  id: string
  updated_at?: string
  deleted_at?: string | null
  [key: string]: unknown
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
    const results = await Promise.all([
      this.client.from('songs').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      this.client.from('setlists').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    ])
    const remoteIsEmpty = results.every(({ count, error }) => !error && (count ?? 0) === 0)
    if (!remoteIsEmpty) return this.sync(userId)

    const [songs, setlists, setlistSongs] = await Promise.all([
      this.db.songs.toArray(),
      this.db.setlists.toArray(),
      this.db.setlistSongs.toArray(),
    ])
    for (const song of songs) await this.queueUpsert(userId, 'songs', song)
    for (const setlist of setlists) await this.queueUpsert(userId, 'setlists', setlist)
    for (const entry of setlistSongs) await this.queueUpsert(userId, 'setlistSongs', entry)
    await this.sync(userId)
  }

  async sync(userId: string) {
    if (this.syncing || !navigator.onLine) return
    this.syncing = true
    try {
      await this.pushPending(userId)
      await this.pull(userId)
    } finally {
      this.syncing = false
    }
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
      for (const row of (data ?? []) as RemoteRow[]) await this.applyRemote(entity, row)
    }
  }

  private async applyRemote(entity: EntityName, remote: RemoteRow) {
    const local = await getLocal(this.db, entity, remote.id)
    const remoteUpdatedAt = remote.deleted_at ?? remote.updated_at
    if (!remoteUpdatedAt || (local && getUpdatedAt(local) > remoteUpdatedAt)) return

    if (remote.deleted_at) {
      await removeLocal(this.db, entity, remote.id)
      return
    }

    const normalized = fromRemoteRow(entity, remote)
    if (entity === 'songs') await this.db.songs.put(normalized as Song)
    else if (entity === 'setlists') await this.db.setlists.put(normalized as Setlist)
    else await this.db.setlistSongs.put(normalized as SetlistSong)
  }
}

async function getLocal(db: SalmodiaDatabase, entity: EntityName, id: string): Promise<Entity | undefined> {
  if (entity === 'songs') return db.songs.get(id)
  if (entity === 'setlists') return db.setlists.get(id)
  return db.setlistSongs.get(id)
}

async function removeLocal(db: SalmodiaDatabase, entity: EntityName, id: string) {
  if (entity === 'songs') await db.songs.delete(id)
  else if (entity === 'setlists') await db.setlists.delete(id)
  else await db.setlistSongs.delete(id)
}

function toRemoteRow(entity: Entity) {
  if ('originalKey' in entity) {
    const song = entity as Song
    return { id: song.id, title: song.title, artist: song.artist ?? null, original_key: song.originalKey, current_key: song.currentKey, bpm: song.bpm ?? null, lyrics: song.lyrics, notes: song.notes ?? null, is_favorite: song.isFavorite, created_at: song.createdAt, updated_at: song.updatedAt }
  }
  if ('name' in entity) {
    const setlist = entity as Setlist
    return { id: setlist.id, name: setlist.name, created_at: setlist.createdAt, updated_at: setlist.updatedAt }
  }
  const entry = entity as SetlistSong
  return { id: entry.id, setlist_id: entry.setlistId, song_id: entry.songId, position: entry.position }
}

function fromRemoteRow(entity: EntityName, row: RemoteRow): Entity {
  if (entity === 'songs') return {
    id: row.id,
    title: row.title as string,
    artist: (row.artist as string | null) ?? undefined,
    originalKey: row.original_key as Song['originalKey'],
    currentKey: row.current_key as Song['currentKey'],
    bpm: (row.bpm as number | null) ?? undefined,
    lyrics: row.lyrics as string,
    notes: (row.notes as string | null) ?? undefined,
    isFavorite: row.is_favorite as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
  if (entity === 'setlists') return { id: row.id, name: row.name as string, createdAt: row.created_at as string, updatedAt: row.updated_at as string }
  return { id: row.id, setlistId: row.setlist_id as string, songId: row.song_id as string, position: row.position as number }
}

function getUpdatedAt(entity: Entity) {
  return 'updatedAt' in entity ? entity.updatedAt : new Date().toISOString()
}

export type { SyncQueueItem }
