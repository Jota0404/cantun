import type { Band } from '../../domain/bands/band'
import type { BandMember } from '../../domain/bands/bandMember'
import type { BandSong } from '../../domain/bands/bandSong'
import type { BandSongMemberState } from '../../domain/bands/bandSongMemberState'
import type { BandSetlist } from '../../domain/bands/bandSetlist'
import type { BandSetlistSong } from '../../domain/bands/bandSetlistSong'
import type { SalmodiaDatabase } from '../database'
import { db as defaultDb } from '../database'
import { queueBandDelete, queueBandUpsert } from '../../sync/bandSyncService'

export class BandRepository {
  private readonly db: SalmodiaDatabase

  constructor(db: SalmodiaDatabase = defaultDb) {
    this.db = db
  }

  async create(value: Band) { await this.db.bands.add(value); await queueBandUpsert('bands', value) }
  async getById(id: string) { return this.db.bands.get(id) }
  async list() { return this.db.bands.orderBy('updatedAt').reverse().toArray() }
  async update(value: Band) { await this.db.bands.put(value); await queueBandUpsert('bands', value) }
  async remove(id: string) { await this.db.bands.delete(id); await queueBandDelete('bands', id) }
}

export class BandMemberRepository {
  private readonly db: SalmodiaDatabase

  constructor(db: SalmodiaDatabase = defaultDb) {
    this.db = db
  }

  async create(value: BandMember) { await this.db.bandMembers.add(value); await queueBandUpsert('bandMembers', value) }
  async getById(id: string) { return this.db.bandMembers.get(id) }
  async listByBandId(bandId: string) { return this.db.bandMembers.where('bandId').equals(bandId).toArray() }
  async findByBandAndUser(bandId: string, userId: string) { return this.db.bandMembers.where('[bandId+userId]').equals([bandId, userId]).first() }
  async update(value: BandMember) { await this.db.bandMembers.put(value); await queueBandUpsert('bandMembers', value) }
  async remove(id: string) { await this.db.bandMembers.delete(id); await queueBandDelete('bandMembers', id) }
}

export class BandSongRepository {
  private readonly db: SalmodiaDatabase

  constructor(db: SalmodiaDatabase = defaultDb) {
    this.db = db
  }

  async create(value: BandSong) { await this.db.bandSongs.add(value); await queueBandUpsert('bandSongs', value) }
  async getById(id: string) { return this.db.bandSongs.get(id) }
  async listByBandId(bandId: string) { return this.db.bandSongs.where('bandId').equals(bandId).toArray() }
  async update(value: BandSong) { await this.db.bandSongs.put(value); await queueBandUpsert('bandSongs', value) }
  async remove(id: string) { await this.db.bandSongs.delete(id); await queueBandDelete('bandSongs', id) }
}

export class BandSongMemberStateRepository {
  private readonly db: SalmodiaDatabase

  constructor(db: SalmodiaDatabase = defaultDb) {
    this.db = db
  }

  async create(value: BandSongMemberState) { await this.db.bandSongMemberStates.add(value); await queueBandUpsert('bandSongMemberStates', value) }
  async getById(id: string) { return this.db.bandSongMemberStates.get(id) }
  async findByBandSongAndUser(bandSongId: string, userId: string) { return this.db.bandSongMemberStates.where('[bandSongId+userId]').equals([bandSongId, userId]).first() }
  async update(value: BandSongMemberState) { await this.db.bandSongMemberStates.put(value); await queueBandUpsert('bandSongMemberStates', value) }
  async remove(id: string) { await this.db.bandSongMemberStates.delete(id); await queueBandDelete('bandSongMemberStates', id) }
}

export class BandSetlistRepository {
  private readonly db: SalmodiaDatabase

  constructor(db: SalmodiaDatabase = defaultDb) {
    this.db = db
  }

  async create(value: BandSetlist) { await this.db.bandSetlists.add(value); await queueBandUpsert('bandSetlists', value) }
  async getById(id: string) { return this.db.bandSetlists.get(id) }
  async listByBandId(bandId: string) { return this.db.bandSetlists.where('bandId').equals(bandId).toArray() }
  async update(value: BandSetlist) { await this.db.bandSetlists.put(value); await queueBandUpsert('bandSetlists', value) }
  async remove(id: string) { await this.db.bandSetlists.delete(id); await queueBandDelete('bandSetlists', id) }
}

export class BandSetlistSongRepository {
  private readonly db: SalmodiaDatabase

  constructor(db: SalmodiaDatabase = defaultDb) {
    this.db = db
  }

  async create(value: BandSetlistSong) { await this.db.bandSetlistSongs.add(value); await queueBandUpsert('bandSetlistSongs', value) }
  async getById(id: string) { return this.db.bandSetlistSongs.get(id) }
  async listBySetlistId(bandSetlistId: string) { return this.db.bandSetlistSongs.where('bandSetlistId').equals(bandSetlistId).sortBy('position') }
  async findBySetlistAndSong(bandSetlistId: string, bandSongId: string) { return this.db.bandSetlistSongs.where('[bandSetlistId+bandSongId]').equals([bandSetlistId, bandSongId]).first() }
  async update(value: BandSetlistSong) { await this.db.bandSetlistSongs.put(value); await queueBandUpsert('bandSetlistSongs', value) }
  async remove(id: string) { const value = await this.db.bandSetlistSongs.get(id); await this.db.bandSetlistSongs.delete(id); await queueBandDelete('bandSetlistSongs', id, value?.updatedAt) }
}

export const bandRepository = new BandRepository()
export const bandMemberRepository = new BandMemberRepository()
export const bandSongRepository = new BandSongRepository()
export const bandSongMemberStateRepository = new BandSongMemberStateRepository()
export const bandSetlistRepository = new BandSetlistRepository()
export const bandSetlistSongRepository = new BandSetlistSongRepository()
