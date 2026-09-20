import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { assignmentRepository } from '../../db/repositories/assignmentRepository'
import { serviceRepository } from '../../db/repositories/serviceRepository'
import { serviceItemRepository } from '../../db/repositories/serviceItemRepository'
import { songRepository } from '../../db/repositories/songRepository'
import { createAssignment } from '../../application/services/serviceService'
import { createStageSession, startStageSession } from '../../application/stage/stageSessionService'
import { useNavigate } from 'react-router-dom'
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
      setService(current); setItems(serviceItems); setAssignments(currentAssignments); setSongs(allSongs)
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível carregar o serviço.') }
  }, [serviceId])

  useEffect(() => { void load() }, [load])

  async function startStage() {
    try {
      const stage = await createStageSession(serviceId)
      const started = await startStageSession(stage.id)
      navigate(`/stage/session/${started.legacyBandStageSessionId}`)
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível iniciar o palco deste serviço.') }
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

  if (!service) return <main className="organization-page"><p>{error || 'Carregando serviço…'}</p></main>

  return <main className="organization-page"><section className="organization-card">
    <header><Link to={`/organizations/${service.organizationId}`}>← Organização</Link><span>SERVIÇO</span><h2>{service.name}</h2><p>{new Date(service.startsAt).toLocaleString('pt-BR')} · {service.status}</p></header>
    {error && <p role="alert" className="organization-error">{error}</p>}
    <section><header><h3>Ordem musical</h3><button type="button" onClick={() => void startStage()}>Iniciar palco</button><button type="button" onClick={() => void assign()}>Adicionar à escala</button></header>
      <div className="organization-list">{items.map((item) => <article className="organization-item" key={item.id}><div><strong>{item.position + 1}. {songs.find((song) => song.id === item.songId)?.title ?? item.songId}</strong><p>Repertório: {item.repertoireId ?? 'avulso'}</p></div></article>)}</div>
    </section>
    <section><h3>Escala</h3><div className="organization-list">{assignments.map((item) => <article className="organization-item" key={item.id}><div><strong>{item.userId}</strong><p>{item.musicalFunction}</p></div><span>{item.status}</span></article>)}</div></section>
  </section></main>
}
