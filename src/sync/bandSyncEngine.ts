import type { SupabaseClient } from '@supabase/supabase-js'
import type { SalmodiaDatabase } from '../db/database'
import type { Band } from '../domain/bands/band'
import type { BandMember } from '../domain/bands/bandMember'
import type { BandSong } from '../domain/bands/bandSong'
import type { BandSongMemberState } from '../domain/bands/bandSongMemberState'
import type { BandSetlist } from '../domain/bands/bandSetlist'
import type { BandSetlistSong } from '../domain/bands/bandSetlistSong'

export type BandEntityName = 'bands' | 'bandMembers' | 'bandSongs' | 'bandSongMemberStates' | 'bandSetlists' | 'bandSetlistSongs'
type BandEntity = Band | BandMember | BandSong | BandSongMemberState | BandSetlist | BandSetlistSong
export interface BandSyncQueueItem { id?: number; userId: string; entity: BandEntityName; entityId: string; operation: 'upsert' | 'delete'; payload?: BandEntity; updatedAt: string; attempts: number }
interface RemoteRow { id: string; updated_at?: string; [key: string]: unknown }
const tables: Record<BandEntityName, string> = { bands: 'bands', bandMembers: 'band_members', bandSongs: 'band_songs', bandSongMemberStates: 'band_song_member_states', bandSetlists: 'band_setlists', bandSetlistSongs: 'band_setlist_songs' }
const syncOrder: BandEntityName[] = ['bands','bandMembers','bandSongs','bandSongMemberStates','bandSetlists','bandSetlistSongs']
const RETRY_MS = 10000

export class BandSyncEngine {
  private syncing = false
  private retryTimer: number | undefined
  private readonly db: SalmodiaDatabase
  private readonly client: SupabaseClient

  constructor(db: SalmodiaDatabase, client: SupabaseClient) {
    this.db = db
    this.client = client
  }

  async queueUpsert(userId: string, entity: BandEntityName, payload: BandEntity) {
    await this.db.bandSyncQueue.where('[userId+entity+entityId]').equals([userId, entity, payload.id]).delete()
    await this.db.bandSyncQueue.add({ userId, entity, entityId: payload.id, operation: 'upsert', payload, updatedAt: payload.updatedAt, attempts: 0 })
    void this.sync(userId)
  }

  async queueDelete(userId: string, entity: BandEntityName, entityId: string, updatedAt = new Date().toISOString()) {
    await this.db.bandSyncQueue.where('[userId+entity+entityId]').equals([userId, entity, entityId]).delete()
    await this.db.bandSyncQueue.add({ userId, entity, entityId, operation: 'delete', updatedAt, attempts: 0 })
    void this.sync(userId)
  }

  async bootstrap(userId: string) { await this.sync(userId) }

  async sync(userId: string) {
    if (this.syncing) return
    this.syncing = true
    try { if (navigator.onLine) { await this.pushPending(userId); await this.pull(userId) } }
    finally { this.syncing = false }
    if (await this.db.bandSyncQueue.where('userId').equals(userId).count()) this.scheduleRetry(userId); else this.clearRetry()
  }

  private scheduleRetry(userId: string) {
    if (this.retryTimer !== undefined) return
    this.retryTimer = window.setTimeout(() => { this.retryTimer = undefined; void this.sync(userId) }, RETRY_MS)
  }
  private clearRetry() { if (this.retryTimer !== undefined) { window.clearTimeout(this.retryTimer); this.retryTimer = undefined } }

  private async pushPending(userId: string) {
    const pending = await this.db.bandSyncQueue.where('userId').equals(userId).sortBy('id')
    pending.sort((a,b) => syncOrder.indexOf(a.entity) - syncOrder.indexOf(b.entity) || (a.id ?? 0) - (b.id ?? 0))
    for (const item of pending) try { await this.pushItem(item); if (item.id !== undefined) await this.db.bandSyncQueue.delete(item.id) } catch { if (item.id !== undefined) await this.db.bandSyncQueue.update(item.id, { attempts: item.attempts + 1 }) }
  }

  private async pushItem(item: BandSyncQueueItem) {
    const table = tables[item.entity]
    const remote = await this.findRemote(item)
    if (remote?.updated_at && remote.updated_at >= item.updatedAt) return
    if (item.operation === 'delete') { if (!remote) return; const { error } = await this.client.from(table).delete().eq('id', remote.id); if (error) throw error; return }
    if (!item.payload) throw new Error('Band sync upsert sem payload.')
    const row = { ...toRemoteRow(item.entity, item.payload), id: remote?.id ?? item.payload.id }
    const { error } = await this.client.from(table).upsert(row, { onConflict: 'id' })
    if (error) throw error
  }

  private async findRemote(item: BandSyncQueueItem): Promise<RemoteRow | undefined> {
    const table = tables[item.entity]
    const { data, error } = await this.client.from(table).select('*').eq('id', item.entityId).maybeSingle()
    if (error) throw error
    if (data) return data as RemoteRow
    if (item.operation !== 'upsert' || !item.payload) return undefined
    const pair = item.entity === 'bandMembers' ? ['band_id','user_id', (item.payload as BandMember).bandId, (item.payload as BandMember).userId]
      : item.entity === 'bandSongMemberStates' ? ['band_song_id','user_id', (item.payload as BandSongMemberState).bandSongId, (item.payload as BandSongMemberState).userId]
      : item.entity === 'bandSetlistSongs' ? ['band_setlist_id','band_song_id', (item.payload as BandSetlistSong).bandSetlistId, (item.payload as BandSetlistSong).bandSongId] : null
    if (!pair) return undefined
    const { data: byPair, error: pairError } = await this.client.from(table).select('*').eq(pair[0], pair[2]).eq(pair[1], pair[3]).maybeSingle()
    if (pairError) throw pairError
    return (byPair as RemoteRow | null) ?? undefined
  }

  private async pull(userId: string) {
    for (const entity of syncOrder) {
      const { data, error } = await this.client.from(tables[entity]).select('*')
      if (error) continue
      const rows = (data ?? []) as RemoteRow[]
      const ids = new Set(rows.map(r => r.id))
      for (const row of rows) await this.applyRemote(userId, entity, row)
      const locals = await listLocal(this.db, entity)
      for (const local of locals) if (!ids.has(local.id) && !(await this.db.bandSyncQueue.where('[userId+entity+entityId]').equals([userId, entity, local.id]).first())) await removeLocal(this.db, entity, local.id)
    }
  }

  private async applyRemote(userId: string, entity: BandEntityName, remote: RemoteRow) {
    if (await this.db.bandSyncQueue.where('[userId+entity+entityId]').equals([userId, entity, remote.id]).first()) return
    const local = await getLocal(this.db, entity, remote.id)
    if (!remote.updated_at || (local && local.updatedAt > remote.updated_at)) return
    await putLocal(this.db, entity, fromRemoteRow(entity, remote))
  }
}

async function getLocal(db: SalmodiaDatabase, e: BandEntityName, id: string): Promise<BandEntity | undefined> { if(e==='bands')return db.bands.get(id); if(e==='bandMembers')return db.bandMembers.get(id); if(e==='bandSongs')return db.bandSongs.get(id); if(e==='bandSongMemberStates')return db.bandSongMemberStates.get(id); if(e==='bandSetlists')return db.bandSetlists.get(id); return db.bandSetlistSongs.get(id) }
async function listLocal(db: SalmodiaDatabase, e: BandEntityName): Promise<BandEntity[]> { if(e==='bands')return db.bands.toArray(); if(e==='bandMembers')return db.bandMembers.toArray(); if(e==='bandSongs')return db.bandSongs.toArray(); if(e==='bandSongMemberStates')return db.bandSongMemberStates.toArray(); if(e==='bandSetlists')return db.bandSetlists.toArray(); return db.bandSetlistSongs.toArray() }
async function putLocal(db: SalmodiaDatabase,e: BandEntityName,v: BandEntity){if(e==='bands')await db.bands.put(v as Band);else if(e==='bandMembers')await db.bandMembers.put(v as BandMember);else if(e==='bandSongs')await db.bandSongs.put(v as BandSong);else if(e==='bandSongMemberStates')await db.bandSongMemberStates.put(v as BandSongMemberState);else if(e==='bandSetlists')await db.bandSetlists.put(v as BandSetlist);else await db.bandSetlistSongs.put(v as BandSetlistSong)}
async function removeLocal(db: SalmodiaDatabase,e: BandEntityName,id:string){if(e==='bands')await db.bands.delete(id);else if(e==='bandMembers')await db.bandMembers.delete(id);else if(e==='bandSongs')await db.bandSongs.delete(id);else if(e==='bandSongMemberStates')await db.bandSongMemberStates.delete(id);else if(e==='bandSetlists')await db.bandSetlists.delete(id);else await db.bandSetlistSongs.delete(id)}
function toRemoteRow(e:BandEntityName,v:BandEntity):Record<string,unknown>{if(e==='bands'){const x=v as Band;return{id:x.id,name:x.name,owner_user_id:x.ownerUserId,created_at:x.createdAt,updated_at:x.updatedAt}}if(e==='bandMembers'){const x=v as BandMember;return{id:x.id,band_id:x.bandId,user_id:x.userId,role:x.role,created_at:x.createdAt,updated_at:x.updatedAt}}if(e==='bandSongs'){const x=v as BandSong;return{id:x.id,band_id:x.bandId,title:x.title,artist:x.artist??null,original_key:x.originalKey,bpm:x.bpm??null,lyrics:x.lyrics,notes:x.notes??null,source_song_id:x.sourceSongId??null,created_at:x.createdAt,updated_at:x.updatedAt}}if(e==='bandSongMemberStates'){const x=v as BandSongMemberState;return{id:x.id,band_song_id:x.bandSongId,user_id:x.userId,current_key:x.currentKey,created_at:x.createdAt,updated_at:x.updatedAt}}if(e==='bandSetlists'){const x=v as BandSetlist;return{id:x.id,band_id:x.bandId,name:x.name,created_by_user_id:x.createdByUserId,version:x.version,created_at:x.createdAt,updated_at:x.updatedAt}}const x=v as BandSetlistSong;return{id:x.id,band_setlist_id:x.bandSetlistId,band_song_id:x.bandSongId,position:x.position,updated_at:x.updatedAt}}
function fromRemoteRow(e:BandEntityName,r:RemoteRow):BandEntity{if(e==='bands')return{id:r.id,name:r.name as string,ownerUserId:r.owner_user_id as string,createdAt:r.created_at as string,updatedAt:r.updated_at as string};if(e==='bandMembers')return{id:r.id,bandId:r.band_id as string,userId:r.user_id as string,role:r.role as BandMember['role'],createdAt:r.created_at as string,updatedAt:r.updated_at as string};if(e==='bandSongs')return{id:r.id,bandId:r.band_id as string,title:r.title as string,artist:(r.artist as string|null)??undefined,originalKey:r.original_key as BandSong['originalKey'],bpm:(r.bpm as number|null)??undefined,lyrics:r.lyrics as string,notes:(r.notes as string|null)??undefined,sourceSongId:(r.source_song_id as string|null)??undefined,createdAt:r.created_at as string,updatedAt:r.updated_at as string};if(e==='bandSongMemberStates')return{id:r.id,bandSongId:r.band_song_id as string,userId:r.user_id as string,currentKey:r.current_key as BandSongMemberState['currentKey'],createdAt:r.created_at as string,updatedAt:r.updated_at as string};if(e==='bandSetlists')return{id:r.id,bandId:r.band_id as string,name:r.name as string,createdByUserId:r.created_by_user_id as string,version:r.version as number,createdAt:r.created_at as string,updatedAt:r.updated_at as string};return{id:r.id,bandSetlistId:r.band_setlist_id as string,bandSongId:r.band_song_id as string,position:r.position as number,updatedAt:r.updated_at as string}}
export type { BandEntity }
