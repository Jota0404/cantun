import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/authContext'
import { organizationRepository } from '../../db/repositories/organizationRepository'
import { organizationSongRepository } from '../../db/repositories/organizationSongRepository'
import { repertoireRepository } from '../../db/repositories/repertoireRepository'
import { serviceRepository } from '../../db/repositories/serviceRepository'
import { songRepository } from '../../db/repositories/songRepository'
import { createRepertoire, addSongToRepertoire } from '../../application/repertoires/repertoireService'
import { addSongToOrganization } from '../../application/organizations/organizationSongService'
import { createService } from '../../application/services/serviceService'
import { addSongToService } from '../../application/services/serviceScheduleService'
import type { Organization } from '../../domain/organizations/organization'
import type { Repertoire } from '../../domain/repertoires/repertoire'
import type { Service } from '../../domain/services/service'
import type { Song } from '../../domain/songs/song'
import './OrganizationPage.css'

export function OrganizationDetailPage() {
  const { organizationId = '' } = useParams()
  const { user } = useAuth()
  const [organization, setOrganization] = useState<Organization>()
  const [songs, setSongs] = useState<Song[]>([])
  const [organizationSongIds, setOrganizationSongIds] = useState<Set<string>>(new Set())
  const [repertoires, setRepertoires] = useState<Repertoire[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const org = await organizationRepository.getById(organizationId)
      if (!org) { setError('Organização não encontrada.'); return }
      const [allSongs, ownedSongs, reps, currentServices] = await Promise.all([
        songRepository.list(),
        organizationSongRepository.listByOrganizationId(organizationId),
        repertoireRepository.listByOrganizationId(organizationId),
        serviceRepository.listByOrganizationId(organizationId),
      ])
      setOrganization(org)
      setSongs(allSongs)
      setOrganizationSongIds(new Set(ownedSongs.map((item) => item.songId)))
      setRepertoires(reps)
      setServices(currentServices)
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível carregar a organização.') }
  }, [organizationId])

  useEffect(() => { void load() }, [load])

  async function createRep() {
    if (!user) return
    const name = window.prompt('Nome do repertório')
    if (!name?.trim()) return
    try {
      await createRepertoire({ organizationId, name: name.trim(), createdByUserId: user.id, version: 1 })
      await load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível criar o repertório.') }
  }

  async function createSvc() {
    if (!user) return
    const name = window.prompt('Nome do serviço')
    if (!name?.trim()) return
    try {
      await createService({ organizationId, name: name.trim(), startsAt: new Date().toISOString(), status: 'planned', createdByUserId: user.id })
      await load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível criar o serviço.') }
  }

  async function addOrgSong(songId: string) {
    try { await addSongToOrganization(organizationId, songId); await load() }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível adicionar a música à organização.') }
  }

  async function addRepSong(repertoireId: string, songId: string) {
    try { await addSongToRepertoire(repertoireId, songId); await load() }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível adicionar ao repertório.') }
  }

  async function addServiceSong(serviceId: string, songId: string) {
    try { await addSongToService(serviceId, songId); await load() }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível adicionar ao serviço.') }
  }

  if (!organization) return <main className="organization-page"><p>{error || 'Carregando organização…'}</p></main>

  return <main className="organization-page"><section className="organization-card">
    <header><Link to="/organizations">← Organizações</Link><span>ORGANIZAÇÃO</span><h2>{organization.name}</h2><p>Biblioteca, repertórios e serviços.</p></header>
    {error && <p role="alert" className="organization-error">{error}</p>}

    <section><h3>Biblioteca da organização</h3><p>{organizationSongIds.size} música(s) vinculada(s).</p>
      <div className="organization-list">{songs.map((song) => <article className="organization-item" key={song.id}><div><strong>{song.title}</strong>{song.artist && <p>{song.artist}</p>}</div>{organizationSongIds.has(song.id) ? <span>Vinculada</span> : <button type="button" onClick={() => void addOrgSong(song.id)}>Adicionar</button>}</article>)}</div>
    </section>

    <section><header><h3>Repertórios</h3><button type="button" onClick={() => void createRep()}>Novo repertório</button></header>
      <div className="organization-list">{repertoires.map((rep) => <article className="organization-item" key={rep.id}><div><strong>{rep.name}</strong><p>{rep.version}ª versão</p><Link to={`/organizations/${organizationId}/repertoires/${rep.id}`}>Abrir</Link></div><div>{songs.filter((song) => organizationSongIds.has(song.id)).slice(0, 5).map((song) => <button key={song.id} type="button" onClick={() => void addRepSong(rep.id, song.id)}>+ {song.title}</button>)}</div></article>)}</div>
    </section>

    <section><header><h3>Serviços</h3><button type="button" onClick={() => void createSvc()}>Novo serviço</button></header>
      <div className="organization-list">{services.map((service) => <article className="organization-item" key={service.id}><div><strong>{service.name}</strong><p>{new Date(service.startsAt).toLocaleString('pt-BR')}</p><Link to={`/services/${service.id}`}>Abrir serviço</Link></div><div>{songs.filter((song) => organizationSongIds.has(song.id)).slice(0, 5).map((song) => <button key={song.id} type="button" onClick={() => void addServiceSong(service.id, song.id)}>+ {song.title}</button>)}</div></article>)}</div>
    </section>
  </section></main>
}
