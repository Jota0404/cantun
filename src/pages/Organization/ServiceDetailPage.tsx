import { useCallback, useEffect, useState, type DragEvent, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { onRemoteDataApplied } from '../../application/sync/remoteData'
import { listSongs } from '../../application/songs/listSongs'
import { listOrganizationSongs } from '../../application/songs/listOrganizationSongs'
import { OFFLINE_COPY_MESSAGE } from '../../application/songs/copySongToOrganization'
import { deleteService, getService, transitionService, updateServiceInfo } from '../../application/services/serviceService'
import { addServiceItem, listServiceItems, moveServiceItem, removeServiceItem } from '../../application/services/serviceScheduleService'
import { setServiceItemKey } from '../../application/services/applyRepertoire'
import { useAuth } from '../../auth/authContext'
import { Badge } from '../../components/ui/Badge'
import { ApplyRepertoireDialog } from '../../components/service/ApplyRepertoireDialog'
import { ServiceSchedule } from '../../components/schedule/ServiceSchedule'
import { createStageSession, startStageSession } from '../../application/stage/stageSessionService'
import { getMyAccessContext } from '../../application/teams/teamMemberService'
import { hasPermission, type AccessContext } from '../../domain/access/permissions'
import { MAJOR_KEYS, MINOR_KEYS, type MusicalKey } from '../../domain/music/musicalKey'
import type { Service } from '../../domain/services/service'
import { SERVICE_ITEM_TYPES, effectiveKey, validateServiceItem, type ServiceItem, type ServiceItemType } from '../../domain/services/serviceItem'
import { canDeleteService, isFinalStatus, nextStatuses } from '../../domain/services/serviceLifecycle'
import type { Song } from '../../domain/songs/song'
import { SERVICE_ITEM_TYPE_LABEL, SERVICE_STATUS_LABEL, SERVICE_STATUS_TONE, SERVICE_TRANSITION_LABEL, formatServiceDate, toLocalInput } from '../../components/service/serviceLabels'
import './OrganizationPage.css'
import './ServiceDetailPage.css'
import { labels } from '../../ui/labels'

type Result = { success: true } | { success: false; errors: string[] }

export function ServiceDetailPage() {
  const { serviceId = '' } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [service, setService] = useState<Service>()
  const [items, setItems] = useState<ServiceItem[]>([])
  const [organizationSongs, setOrganizationSongs] = useState<Song[]>([])
  const [personalSongs, setPersonalSongs] = useState<Song[]>([])
  const songs = [...organizationSongs, ...personalSongs]
  const [access, setAccess] = useState<AccessContext>({ organizationRole: null })
  const [editingInfo, setEditingInfo] = useState(false)
  const [info, setInfo] = useState({ name: '', startsAt: '', location: '', notes: '' })
  const [itemType, setItemType] = useState<ServiceItemType>('song')
  const [itemSongId, setItemSongId] = useState('')
  const [itemTitle, setItemTitle] = useState('')
  const [itemMinutes, setItemMinutes] = useState('')
  const [itemNotes, setItemNotes] = useState('')
  const [applying, setApplying] = useState(false)
  const [dragged, setDragged] = useState<string>()
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const current = await getService(serviceId)
      if (!current) { setError('Serviço não encontrado.'); return }
      const [serviceItems, personal, ministrySongs, context] = await Promise.all([
        listServiceItems(serviceId),
        listSongs(),
        listOrganizationSongs(current.organizationId),
        getMyAccessContext({ organizationId: current.organizationId, teamId: current.teamId ?? undefined }),
      ])
      setService(current)
      setItems(serviceItems)
      setPersonalSongs(personal)
      setOrganizationSongs(ministrySongs)
      setAccess(context)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar o serviço.')
    }
  }, [serviceId])

  useEffect(() => {
    void load()
    return onRemoteDataApplied(() => { void load() })
  }, [load])

  async function run(action: () => Promise<Result>) {
    setError('')
    try {
      const result = await action()
      if (!result.success) { setError(result.errors.join(' ')); return false }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir a operação.')
      return false
    }
    await load()
    return true
  }

  async function startStage() {
    try {
      const stage = await createStageSession(serviceId)
      const started = await startStageSession(stage.id)
      navigate(`/stage/service-session/${started.id}`)
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível iniciar o palco deste serviço.') }
  }

  function openInfo() {
    if (!service) return
    setInfo({ name: service.name, startsAt: toLocalInput(service.startsAt), location: service.location ?? '', notes: service.notes ?? '' })
    setEditingInfo(true)
  }

  async function saveInfo(event: FormEvent) {
    event.preventDefault()
    const saved = await run(() => updateServiceInfo(serviceId, {
      name: info.name, startsAt: new Date(info.startsAt).toISOString(), location: info.location, notes: info.notes,
    }))
    if (saved) setEditingInfo(false)
  }

  async function transition(to: Service['status']) {
    if (to === 'cancelled' && !window.confirm('Cancelar este serviço? Serviços cancelados não podem ser reabertos.')) return
    await run(() => transitionService(serviceId, to))
  }

  async function addItem(event: FormEvent) {
    event.preventDefault()
    const input = {
      type: itemType,
      songId: itemType === 'song' ? itemSongId || undefined : undefined,
      title: itemType === 'song' ? undefined : itemTitle,
      notes: itemNotes || undefined,
      durationMinutes: itemMinutes ? Number(itemMinutes) : undefined,
    }
    const errors = validateServiceItem(input)
    if (errors.length) { setError(errors.join(' ')); return }
    if (input.type === 'song' && personalSongs.some((song) => song.id === input.songId) && !navigator.onLine) { setError(OFFLINE_COPY_MESSAGE); return }
    if (input.type === 'song' && items.some((item) => item.type === 'song' && item.songId === input.songId)) {
      setError(`"${songs.find((song) => song.id === input.songId)?.title ?? 'Esta música'}" já está na ordem.`)
      return
    }
    if (await run(() => addServiceItem(serviceId, input))) { setItemSongId(''); setItemTitle(''); setItemMinutes(''); setItemNotes('') }
  }

  function dropOn(event: DragEvent, toIndex: number) {
    event.preventDefault()
    if (dragged) void run(() => moveServiceItem(serviceId, dragged, toIndex))
    setDragged(undefined)
  }

  async function handleDelete() {
    if (!service || !window.confirm(`Excluir o serviço "${service.name}"? A ordem e a escala também serão removidas.`)) return
    const result = await deleteService(serviceId)
    if (!result.success) { setError(result.errors.join(' ')); return }
    navigate(`/organizations/${service.organizationId}`, { replace: true })
  }

  if (!service) return <main className="organization-page"><p role={error ? 'alert' : undefined}>{error || 'Carregando serviço…'}</p></main>

  const final = isFinalStatus(service.status)
  const canEdit = !final && hasPermission(access, 'service.edit')
  const canTransition = hasPermission(access, 'service.transition')
  const isOrgAdmin = access.organizationRole === 'owner' || access.organizationRole === 'admin'
  const canDelete = canDeleteService(service.status, hasPermission(access, 'service.delete'), isOrgAdmin)
  const itemLabel = (item: ServiceItem) => item.type === 'song'
    ? songs.find((song) => song.id === item.songId)?.title ?? 'Música indisponível'
    : item.title ?? SERVICE_ITEM_TYPE_LABEL[item.type]

  const keyField = (item: ServiceItem) => {
    const song = songs.find((candidate) => candidate.id === item.songId)
    const effective = song ? effectiveKey(item, song) : item.key
    if (!canEdit) return effective ? <span>Tom: {effective}</span> : null
    const options: readonly MusicalKey[] = song?.originalKey.endsWith('m') ? MINOR_KEYS : MAJOR_KEYS
    return <><label>Tom neste serviço
      <select value={item.key ?? ''} onChange={(event) => void run(() => setServiceItemKey(item.id, (event.target.value || undefined) as MusicalKey | undefined))}>
        <option value="">{song ? `Tom da música (${song.currentKey})` : 'Tom da música'}</option>
        {options.map((key) => <option key={key} value={key}>{key}</option>)}
      </select></label>
      {effective && <span>Tom: {effective}</span>}</>
  }

  return <main className="organization-page"><section className="organization-card">
    <header>
      <Link to={`/organizations/${service.organizationId}`}>{labels.backToOrganization}</Link>
      <span>SERVIÇO</span>
      <h2>{service.name}</h2>
      <p>{formatServiceDate(service.startsAt)}{service.location && <> · {service.location}</>}</p>
      <p>Status: <Badge tone={SERVICE_STATUS_TONE[service.status]}>{SERVICE_STATUS_LABEL[service.status]}</Badge></p>
      {canDelete && <p><button type="button" onClick={() => void handleDelete()}>Excluir serviço</button></p>}
      {final && <p role="note">Serviço {SERVICE_STATUS_LABEL[service.status].toLowerCase()}: informações e ordem não podem mais ser editadas.</p>}
    </header>
    {error && <p role="alert" className="organization-error">{error}</p>}

    {canTransition && nextStatuses(service.status).length > 0 && <section aria-labelledby="service-status-title">
      <h3 id="service-status-title">Mudar status</h3>
      <div className="service-actions">
        {nextStatuses(service.status).map((to) => <button key={to} type="button" onClick={() => void transition(to)}>{SERVICE_TRANSITION_LABEL[to]}</button>)}
      </div>
    </section>}

    <section aria-labelledby="service-overview-title">
      <h3 id="service-overview-title">Visão geral</h3>
      {editingInfo ? (
        <form className="service-form" onSubmit={(event) => void saveInfo(event)}>
          <label>Nome<input value={info.name} onChange={(event) => setInfo({ ...info, name: event.target.value })} required pattern=".*\S.*" /></label>
          <label>Data e hora<input type="datetime-local" value={info.startsAt} onChange={(event) => setInfo({ ...info, startsAt: event.target.value })} required /></label>
          <label>Local<input value={info.location} onChange={(event) => setInfo({ ...info, location: event.target.value })} /></label>
          <label>Observações<textarea rows={3} value={info.notes} onChange={(event) => setInfo({ ...info, notes: event.target.value })} /></label>
          <div className="service-actions"><button type="submit">Salvar</button><button type="button" onClick={() => setEditingInfo(false)}>Cancelar edição</button></div>
        </form>
      ) : <>
        <p>{items.filter((item) => item.type === 'song').length} música(s) · {items.length} item(ns) na ordem</p>
        <h4>Observações</h4>
        <p>{service.notes || 'Sem observações.'}</p>
        {canEdit && <button type="button" onClick={openInfo}>Editar informações</button>}
      </>}
    </section>

    <section aria-labelledby="service-order-title">
      <header className="service-actions">
        <h3 id="service-order-title">Ordem do serviço</h3>
        {hasPermission(access, 'stage.start') && !final && <button type="button" onClick={() => void startStage()} disabled={!items.some((item) => item.type === 'song')}>Iniciar palco</button>}
      </header>
      {items.length === 0 ? <p>Nenhum item na ordem.</p> : (
        <ol className="service-order">
          {items.map((item, index) => (
            <li key={item.id} draggable={canEdit} onDragStart={() => setDragged(item.id)} onDragOver={(event) => canEdit && event.preventDefault()} onDrop={(event) => dropOn(event, index)}>
              <div>
                <strong>{index + 1}. {itemLabel(item)}</strong>
                <span>{SERVICE_ITEM_TYPE_LABEL[item.type]}{item.durationMinutes && <> · {item.durationMinutes} min</>}</span>
                {item.notes && <span>{item.notes}</span>}
                {item.type === 'song' && keyField(item)}
              </div>
              {canEdit && <div className="service-actions">
                <button type="button" aria-label={`Subir ${itemLabel(item)}`} disabled={index === 0} onClick={() => void run(() => moveServiceItem(serviceId, item.id, index - 1))}>↑</button>
                <button type="button" aria-label={`Descer ${itemLabel(item)}`} disabled={index === items.length - 1} onClick={() => void run(() => moveServiceItem(serviceId, item.id, index + 1))}>↓</button>
                <button type="button" aria-label={`Remover ${itemLabel(item)}`} onClick={() => void run(() => removeServiceItem(item.id))}>Remover</button>
              </div>}
            </li>
          ))}
        </ol>
      )}
      {canEdit && <p><button type="button" onClick={() => setApplying(true)}>Aplicar repertório</button></p>}
      {applying && <ApplyRepertoireDialog serviceId={serviceId} items={items} itemLabel={itemLabel} onClose={() => setApplying(false)} onApplied={() => { setApplying(false); void load() }} />}
      {canEdit && <form className="service-form" onSubmit={(event) => void addItem(event)} aria-label="Adicionar item">
        <label>Tipo
          <select value={itemType} onChange={(event) => setItemType(event.target.value as ServiceItemType)}>
            {SERVICE_ITEM_TYPES.map((type) => <option key={type} value={type}>{SERVICE_ITEM_TYPE_LABEL[type]}</option>)}
          </select>
        </label>
        {itemType === 'song'
          ? <label>Música<select value={itemSongId} onChange={(event) => setItemSongId(event.target.value)} required>
              <option value="">Escolha a música</option>
              <optgroup label={labels.fromOrganization}>{organizationSongs.map((song) => <option key={song.id} value={song.id}>{song.title}</option>)}</optgroup>
              <optgroup label={`${labels.fromMyLibrary} (será copiada para o Ministério)`}>{personalSongs.filter((song) => !organizationSongs.some((copy) => copy.sourceSongId === song.id)).map((song) => <option key={song.id} value={song.id}>{song.title}</option>)}</optgroup>
            </select></label>
          : <label>Título<input value={itemTitle} onChange={(event) => setItemTitle(event.target.value)} required maxLength={120} /></label>}
        <label>Duração em minutos (opcional)<input type="number" min={1} max={600} value={itemMinutes} onChange={(event) => setItemMinutes(event.target.value)} /></label>
        <label>Observações do item (opcional)<input value={itemNotes} onChange={(event) => setItemNotes(event.target.value)} /></label>
        <button type="submit">Adicionar item</button>
      </form>}
    </section>

    <section aria-labelledby="service-materials-title" className="service-placeholder">
      <h3 id="service-materials-title">Materiais</h3>
      <p>Em breve: cifras, áudios e arquivos do serviço.</p>
    </section>
    <section aria-labelledby="service-rehearsal-title" className="service-placeholder">
      <h3 id="service-rehearsal-title">Ensaio</h3>
      <p>Em breve: data, local e pauta do ensaio.</p>
    </section>

    <ServiceSchedule service={service} access={access} currentUserId={user?.id ?? ''} />
  </section></main>
}
