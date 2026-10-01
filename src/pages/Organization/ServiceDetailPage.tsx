import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { assignmentRepository } from '../../db/repositories/assignmentRepository'
import { serviceRepository } from '../../db/repositories/serviceRepository'
import { serviceItemRepository } from '../../db/repositories/serviceItemRepository'
import { songRepository } from '../../db/repositories/songRepository'
import { createAssignment, removeAssignment, updateAssignment } from '../../application/services/serviceService'
import { addSongToService, removeServiceItem, reorderService, updateService } from '../../application/services/serviceScheduleService'
import { createStageSession, startStageSession } from '../../application/stage/stageSessionService'
import type { Assignment } from '../../domain/services/assignment'
import type { Service } from '../../domain/services/service'
import type { ServiceItem } from '../../domain/services/serviceItem'
import type { Song } from '../../domain/songs/song'
import './OrganizationPage.css'

export function ServiceDetailPage() {
  const { serviceId = '' } = useParams()
  const navigate = useNavigate()
  const [service, setService] = useState<Service>()
  const [items, setItems] = useState<ServiceItem[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [songs, setSongs] = useState<Song[]>([])
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const current = await serviceRepository.getById(serviceId)
      if (!current) { setError('Serviço não encontrado.'); return }
      const [serviceItems, currentAssignments, allSongs] = await Promise.all([
        serviceItemRepository.listByServiceId(serviceId),
        assignmentRepository.listByServiceId(serviceId),
        songRepository.list(),
      ])
      setService(current)
      setItems(serviceItems)
      setAssignments(currentAssignments)
      setSongs(allSongs)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar o serviço.')
    }
  }, [serviceId])

  useEffect(() => { void load() }, [load])

  async function startStage() {
    try {
      const stage = await createStageSession(serviceId)
      const started = await startStageSession(stage.id)
      navigate(`/stage/service-session/${started.id}`)
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível iniciar o palco deste serviço.') }
  }

  async function editService() {
    if (!service) return
    const name = window.prompt('Nome do serviço', service.name)
    if (!name?.trim()) return
    const startsAt = window.prompt('Data/hora ISO', service.startsAt)
    if (!startsAt?.trim()) return
    try {
      await updateService(service.id, { name: name.trim(), startsAt: startsAt.trim() })
      await load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível atualizar o serviço.') }
  }

  async function addSong() {
    const available = songs.filter((song) => !items.some((item) => item.songId === song.id))
    if (available.length === 0) return
    const query = window.prompt(`ID da música para adicionar:\n\n${available.slice(0, 20).map((song) => `${song.id} — ${song.title}`).join('\n')}`)
    const song = available.find((item) => item.id === query?.trim())
    if (!song) return
    try { await addSongToService(serviceId, song.id); await load() }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível adicionar a música.') }
  }

  async function moveItem(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= items.length) return
    const ordered = [...items]
    const [moved] = ordered.splice(index, 1)
    ordered.splice(target, 0, moved)
    try { await reorderService(serviceId, ordered.map((item) => item.id)); await load() }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível reordenar o serviço.') }
  }

  async function removeItem(itemId: string) {
    try { await removeServiceItem(itemId); await load() }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível remover a música.') }
  }

  async function assign() {
    const userId = window.prompt('ID do usuário')
    const musicalFunction = window.prompt('Função musical (ex.: vocals, guitar)')
    if (!userId?.trim() || !musicalFunction?.trim()) return
    try {
      await createAssignment({ serviceId, userId: userId.trim(), musicalFunction: musicalFunction.trim(), status: 'pending' })
      await load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível criar a escala.') }
  }

  async function editAssignment(item: Assignment) {
    const userId = window.prompt('ID do usuário', item.userId)
    const musicalFunction = window.prompt('Função musical', item.musicalFunction)
    if (!userId?.trim() || !musicalFunction?.trim()) return
    try {
      await updateAssignment(item.id, { userId: userId.trim(), musicalFunction: musicalFunction.trim() })
      await load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível atualizar a escala.') }
  }

  async function deleteAssignment(itemId: string) {
    try { await removeAssignment(itemId); await load() }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível remover a escala.') }
  }

  if (!service) return <main className="organization-page"><p>{error || 'Carregando serviço…'}</p></main>

  return <main className="organization-page"><section className="organization-card">
    <header>
      <Link to={`/organizations/${service.organizationId}`}>← Organização</Link>
      <span>SERVIÇO</span>
      <h2>{service.name}</h2>
      <p>{new Date(service.startsAt).toLocaleString('pt-BR')} · {service.status}</p>
      <button type="button" onClick={() => void editService()}>Editar serviço</button>
    </header>
    {error && <p role="alert" className="organization-error">{error}</p>}

    <section>
      <header>
        <h3>Ordem musical</h3>
        <button type="button" onClick={() => void addSong()}>Adicionar música</button>
        <button type="button" onClick={() => void startStage()}>Iniciar palco</button>
      </header>
      <div className="organization-list">
        {items.map((item, index) => <article className="organization-item" key={item.id}>
          <div><strong>{index + 1}. {songs.find((song) => song.id === item.songId)?.title ?? item.songId}</strong><p>Repertório: {item.repertoireId ?? 'avulso'}</p></div>
          <div>
            <button type="button" disabled={index === 0} onClick={() => void moveItem(index, -1)}>↑</button>
            <button type="button" disabled={index === items.length - 1} onClick={() => void moveItem(index, 1)}>↓</button>
            <button type="button" onClick={() => void removeItem(item.id)}>Remover</button>
          </div>
        </article>)}
        {items.length === 0 && <p>Nenhuma música adicionada.</p>}
      </div>
    </section>

    <section>
      <header><h3>Escala</h3><button type="button" onClick={() => void assign()}>Adicionar à escala</button></header>
      <div className="organization-list">
        {assignments.map((item) => <article className="organization-item" key={item.id}>
          <div><strong>{item.userId}</strong><p>{item.musicalFunction} · {item.status}</p></div>
          <div><button type="button" onClick={() => void editAssignment(item)}>Editar</button><button type="button" onClick={() => void deleteAssignment(item.id)}>Remover</button></div>
        </article>)}
        {assignments.length === 0 && <p>Nenhuma pessoa escalada.</p>}
      </div>
    </section>
  </section></main>
}
