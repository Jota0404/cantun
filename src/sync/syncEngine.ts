import type { SalmodiaDatabase } from '../db/database'
import type { Song } from '../domain/songs/song'
import { toSong } from '../domain/songs/songRow'
import { selectRows, updateRows, upsertRows } from '../platform/sync'
import { ApiError } from '../platform/http'
import { notifyRemoteDataApplied } from './remoteChanges'
import { isPermanent, type SyncStatus } from './targetSyncEngine'

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
  /** `failed`: recusado em definitivo pelo servidor; não é reenviado até o usuário descartar (como na fila de alvos). */
  status?: 'failed'
  lastError?: string
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
  // Geração: start()/stop() incrementam; execução antiga (resposta tardia) descarta em vez de gravar (ADR-048).
  private epoch = 0
  private stopped = false
  private runningEpoch: number | null = null
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
    const epoch = this.epoch
    // ponytail: baixa as linhas só para contar; trocar por contagem no servidor se a biblioteca crescer.
    const remoteIsEmpty = await selectRows<RemoteRow>('songs', { user_id: userId }).then((rows) => rows.every((row) => row.organization_id), () => false)
    if (epoch !== this.epoch) return
    if (!remoteIsEmpty) return this.sync(userId)

    const songs = await this.db.songs.filter((song) => !song.organizationId).toArray()
    for (const song of songs) await this.queueUpsert(userId, 'songs', song)
    await this.sync(userId)
  }

  async sync(userId: string) {
    if (this.runningEpoch === this.epoch || this.stopped) return

    const epoch = this.epoch
    this.runningEpoch = epoch
    try {
      if (navigator.onLine) {
        await this.pushPending(userId, epoch)
        await this.pull(userId, epoch)
        if (epoch === this.epoch) notifyRemoteDataApplied()
      }
    } finally {
      if (this.runningEpoch === epoch) this.runningEpoch = null
    }
    if (epoch !== this.epoch) return

    const remaining = (await this.db.syncQueue.where('userId').equals(userId).toArray()).filter((i) => i.status !== 'failed').length
    if (remaining > 0) {
      this.scheduleRetry(userId)
    } else {
      this.clearRetry()
    }
  }

  /** Para o retry e espera o sync em andamento terminar; nada reagenda até `start()`. */
  async stop() {
    this.stopped = true
    this.epoch++
    this.clearRetry()
    while (this.runningEpoch !== null) await new Promise((resolve) => setTimeout(resolve, 10))
  }

  /** Idempotente: só abre nova geração se estava parado (senão liberaria uma 2ª run em paralelo). */
  start() {
    if (!this.stopped) return
    this.stopped = false
    this.epoch++
  }

  private scheduleRetry(userId: string) {
    if (this.stopped || this.retryTimer !== undefined) return
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

  private async pushPending(userId: string, epoch: number) {
    const pending = (await this.db.syncQueue.where('userId').equals(userId).sortBy('id')).filter((i) => i.status !== 'failed')
    for (const item of pending) {
      try {
        await this.pushItem(userId, item, epoch)
        if (epoch !== this.epoch) return
        if (item.id !== undefined) await this.db.syncQueue.delete(item.id)
      } catch (error) {
        if (epoch !== this.epoch) return
        if (item.id === undefined) continue
        const attempts = item.attempts + 1
        await this.db.syncQueue.update(item.id, isPermanent(error) ? { attempts, status: 'failed', lastError: error.message } : { attempts })
      }
    }
  }

  async getStatus(): Promise<SyncStatus> {
    const items = await this.db.syncQueue.toArray()
    const failed = items.filter((i) => i.status === 'failed' && i.id !== undefined)
    return { pending: items.length - failed.length, failed: failed.map((i) => ({ id: i.id!, entity: i.entity, reason: i.lastError ?? '' })) }
  }

  /** Descarta as músicas recusadas: somem da fila e do aparelho; o próximo pull traz a versão do servidor. */
  async discardFailed(): Promise<void> {
    const failed = await this.db.syncQueue.filter((i) => i.status === 'failed').toArray()
    for (const item of failed) {
      if (item.operation === 'upsert') await this.db.songs.delete(item.entityId)
      if (item.id !== undefined) await this.db.syncQueue.delete(item.id)
    }
  }

  private async pushItem(userId: string, item: SyncQueueItem, epoch: number) {
    const table = tables[item.entity]
    const isCopy = Boolean(item.payload?.organizationId)
    const [remote] = await selectRows<RemoteRow>(table, isCopy ? { id: item.entityId } : { user_id: userId, id: item.entityId })

    if (epoch !== this.epoch) return
    const remoteUpdatedAt = remote ? getRemoteUpdatedAt(remote) : undefined
    if (remoteUpdatedAt && remoteUpdatedAt >= item.updatedAt) return

    // RN-A14: a cópia é atualizada por `id`, sem trocar autor, organização nem origem; nunca upsert com `user_id` = eu.
    if (isCopy) {
      const song = item.payload as Song
      assertApplied(await updateRows(table, { id: item.entityId }, item.operation === 'delete' ? { deleted_at: item.updatedAt } : copyPatch(song)))
      return
    }

    if (item.operation === 'delete') {
      // Música pessoal que nunca chegou ao servidor: nada a apagar lá.
      if (remote) assertApplied(await updateRows(table, { user_id: userId, id: item.entityId }, { deleted_at: item.updatedAt }))
      return
    }
    await upsertRows(table, [{ ...toRemoteRow(item.payload!), user_id: userId, deleted_at: null }])
  }

  private async pull(userId: string, epoch: number) {
    for (const entity of Object.keys(tables) as EntityName[]) {
      const rows = await selectRows<RemoteRow>(tables[entity], { user_id: userId }).catch(() => null)
      if (epoch !== this.epoch) return
      if (!rows) continue
      // As cópias que eu criei chegam pelo pull do Ministério (abaixo), não por aqui.
      for (const row of rows) {
        if (epoch !== this.epoch) return
        if (!row.organization_id) await this.applyRemote(userId, entity, row, epoch)
      }
    }
    // RN-A6: uma requisição por Ministério traz as cópias de todos, respeitando a RLS.
    for (const organization of await this.db.organizations.toArray()) {
      const rows = await selectRows<RemoteRow>('songs', { organization_id: organization.id }).catch(() => null)
      if (epoch !== this.epoch) return
      if (!rows) continue
      for (const row of rows) {
        if (epoch !== this.epoch) return
        await this.applyRemote(userId, 'songs', row, epoch)
      }
    }
  }

  private async applyRemote(userId: string, entity: EntityName, remote: RemoteRow, epoch: number) {
    if (epoch !== this.epoch) return
    const pending = await this.db.syncQueue.where('[userId+entity+entityId]').equals([userId, entity, remote.id]).first()
    if (pending || epoch !== this.epoch) return

    const local = await this.db.songs.get(remote.id)
    const remoteUpdatedAt = getRemoteUpdatedAt(remote)
    if (!remoteUpdatedAt || (local && getUpdatedAt(local) > remoteUpdatedAt)) return

    if (epoch !== this.epoch) return
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

/** O /sync devolve `count: 0` sem erro quando a RLS nega; sem isto o item sairia da fila como sucesso. */
function assertApplied(result: { count: number }) {
  if (result.count === 0) throw new ApiError(403, 'O servidor não aplicou a alteração.')
}

function getUpdatedAt(entity: Entity) {
  return entity.updatedAt
}

function getRemoteUpdatedAt(row: RemoteRow) {
  if (row.deleted_at && row.updated_at) return row.deleted_at > row.updated_at ? row.deleted_at : row.updated_at
  return row.deleted_at ?? row.updated_at
}

export type { SyncQueueItem }
