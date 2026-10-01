import { db } from '../db/database'
import { supabase } from '../lib/supabase'
import { BandSyncEngine, type BandEntityName } from './bandSyncEngine'
import type { Band } from '../domain/bands/band'
import type { BandMember } from '../domain/bands/bandMember'
import type { BandSong } from '../domain/bands/bandSong'
import type { BandSongMemberState } from '../domain/bands/bandSongMemberState'
import type { BandSetlist } from '../domain/bands/bandSetlist'
import type { BandSetlistSong } from '../domain/bands/bandSetlistSong'

type BandEntity = Band | BandMember | BandSong | BandSongMemberState | BandSetlist | BandSetlistSong
export const bandSyncEngine = supabase ? new BandSyncEngine(db, supabase) : null

async function userId() { if (!supabase) return null; const { data } = await supabase.auth.getSession(); return data.session?.user.id ?? null }
export async function queueBandUpsert(entity: BandEntityName, payload: BandEntity) { const id = await userId(); if (id && bandSyncEngine) await bandSyncEngine.queueUpsert(id, entity, payload) }
export async function queueBandDelete(entity: BandEntityName, entityId: string, updatedAt?: string) { const id = await userId(); if (id && bandSyncEngine) await bandSyncEngine.queueDelete(id, entity, entityId, updatedAt) }
export async function syncBands() { const id = await userId(); if (id && bandSyncEngine) await bandSyncEngine.sync(id) }
export async function bootstrapBandSync() { const id = await userId(); if (id && bandSyncEngine) await bandSyncEngine.bootstrap(id) }
