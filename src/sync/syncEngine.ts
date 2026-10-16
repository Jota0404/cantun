import type { SalmodiaDatabase } from '../db/database'
import type { Song } from '../domain/songs/song'
import { toSong } from '../domain/songs/songRow'
import { selectRows, updateRows, upsertRows } from '../platform/sync'
import { notifyRemoteDataApplied } from './remoteChanges'

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

  constructor(db: SalmodiaDatabase) {
    this.db = db
  }

  async queueUpsert(userId: string, entity: EntityName, payload: Entity) {
    await this.db.syncQueue.where('[userId+entity+entityId]').equals([userId, entity, payload.id]).delete()
    await this.db.syncQueue.add({ userId, entity, entityId: payload.id, operation: 'upsert', payload, updatedAt: getUpdatedAt(payload), attempts: 0 })
    void this.sync(userId)
  }

  /** `payload` (a música antes de apagar) diz se era uma cópia de Ministério, que se apaga por `id`. */
  async queueDelete(userId: string, entity: EntityName, entityId: string, updatedAt = new Date().toISOString(), payload?: Entity) {
    await this.db.syncQueue.where('[userId+entity+entityId]').equals([userId, entity, entityId]).delete()
    await this.db.syncQueue.add({ userId, entity, entityId, operation: 'delete', payload, updatedAt, attempts: 0 })
    void this.sync(userId)
  }

  async bootstrap(userId: string) {
    if (!navigator.onLine) return
    // ponytail: baixa as linhas só para contar; trocar por contagem no servidor se a biblioteca crescer.
    const remoteIsEmpty = await selectRows<RemoteRow>('songs', { user_id: userId }).then((rows) => rows.every((row) => row.organization_id), () => false)
    if (!remoteIsEmpty) return this.sync(userId)

    const songs = await this.db.songs.filter((song) => !song.organizationId).toArray()
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
        notifyRemoteDataApplied()
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
    const isCopy = Boolean(item.payload?.organizationId)
    const [remote] = await selectRows<RemoteRow>(table, isCopy ? { id: item.entityId } : { user_id: userId, id: item.entityId })

    const remoteUpdatedAt = remote ? getRemoteUpdatedAt(remote) : undefined
    if (remoteUpdatedAt && remoteUpdatedAt >= item.updatedAt) return

    // RN-A14: a cópia é atualizada por `id`, sem trocar autor, organização nem origem; nunca upsert com `user_id` = eu.
    if (isCopy) {
      const song = item.payload as Song
      if (item.operation === 'delete') await updateRows(table, { id: item.entityId }, { deleted_at: item.updatedAt })
      else await updateRows(table, { id: item.entityId }, copyPatch(song))
      return
    }

    if (item.operation === 'delete') {
      await updateRows(table, { user_id: userId, id: item.entityId }, { deleted_at: item.updatedAt })
      return
    }
    await upsertRows(table, [{ ...toRemoteRow(item.payload!), user_id: userId, deleted_at: null }])
  }

  private async pull(userId: string) {
    for (const entity of Object.keys(tables) as EntityName[]) {
      const rows = await selectRows<RemoteRow>(tables[entity], { user_id: userId }).catch(() => null)
      if (!rows) continue
      // As cópias que eu criei chegam pelo pull do Ministério (abaixo), não por aqui.
      for (const row of rows) if (!row.organization_id) await this.applyRemote(userId, entity, row)
    }
    // RN-A6: uma requisição por Ministério traz as cópias de todos, respeitando a RLS.
    for (const organization of await this.db.organizations.toArray()) {
      const rows = await selectRows<RemoteRow>('songs', { organization_id: organization.id }).catch(() => null)
      if (!rows) continue
      for (const row of rows) await this.applyRemote(userId, 'songs', row)
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

    await this.db.songs.put(toSong(remote))
  }
}

function toRemoteRow(song: Entity) {
  return { id: song.id, title: song.title, artist: song.artist ?? null, original_key: song.originalKey, current_key: song.currentKey, bpm: song.bpm ?? null, lyrics: song.lyrics, notes: song.notes ?? null, is_favorite: song.isFavorite, created_at: song.createdAt, updated_at: song.updatedAt }
}

/** Colunas que a RLS deixa o editor mudar numa cópia (sem `user_id`, `organization_id` nem `source_song_id`). */
function copyPatch(song: Song) {
  return { title: song.title, artist: song.artist ?? null, original_key: song.originalKey, current_key: song.currentKey, bpm: song.bpm ?? null, lyrics: song.lyrics, notes: song.notes ?? null, updated_at: song.updatedAt }
}

function getUpdatedAt(entity: Entity) {
  return entity.updatedAt
}

function getRemoteUpdatedAt(row: RemoteRow) {
  if (row.deleted_at && row.updated_at) return row.deleted_at > row.updated_at ? row.deleted_at : row.updated_at
  return row.deleted_at ?? row.updated_at
}

export type { SyncQueueItem }
