import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { onRemoteDataApplied } from '../../application/sync/remoteData'
import { listSongs } from '../../application/songs/listSongs'
import { listOrganizationSongs } from '../../application/songs/listOrganizationSongs'
import { OFFLINE_COPY_MESSAGE } from '../../application/songs/copySongToOrganization'
import { deleteService, getService, transitionService, updateServiceInfo } from '../../application/services/serviceService'
import { addReprise } from '../../application/services/addReprise'
import { addServiceItem, listServiceItems, moveServiceItem, removeServiceItem } from '../../application/services/serviceScheduleService'
import { setServiceItemKey } from '../../application/services/applyRepertoire'
import { useAuth } from '../../auth/authContext'
import { ActionMenu, type ActionMenuItem } from '../../components/ui/ActionMenu'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Icon } from '../../components/ui/Icon'
import { Sheet } from '../../components/ui/Sheet'
import { Tabs } from '../../components/ui/Tabs'
import { AddServiceItemForm, type NewItemInput } from '../../components/service/AddServiceItemForm'
import { ServiceInfoForm, type ServiceInfoValues } from '../../components/service/ServiceInfoForm'
import { ServiceOrderList } from '../../components/service/ServiceOrderList'
import { ApplyRepertoireDialog } from '../../components/service/ApplyRepertoireDialog'
import { MaterialsPanel } from '../../components/service/MaterialsPanel'
import { ExecutionRecordPanel } from '../../components/service/ExecutionRecordPanel'
import { RehearsalPanel } from '../../components/service/RehearsalPanel'
import { ServiceSchedule } from '../../components/schedule/ServiceSchedule'
import { startOrResumeStage } from '../../application/stage/stageSessionService'
import { getMyAccessContext } from '../../application/teams/teamMemberService'
import { hasPermission, type AccessContext } from '../../domain/access/permissions'
import { MAJOR_KEYS, MINOR_KEYS, type MusicalKey } from '../../domain/music/musicalKey'
import type { Service } from '../../domain/services/service'
import { countDependents, effectiveKey, validateServiceItem, type ServiceItem } from '../../domain/services/serviceItem'
import { canDeleteService, isFinalStatus, nextStatuses } from '../../domain/services/serviceLifecycle'
import type { Song } from '../../domain/songs/song'
import { SERVICE_ITEM_TYPE_LABEL, SERVICE_STATUS_LABEL, SERVICE_STATUS_TONE, SERVICE_TRANSITION_LABEL, formatServiceDate, toLocalInput } from '../../components/service/serviceLabels'
import './OrganizationPage.css'
import './ServiceDetailPage.css'

type Result = { success: true } | { success: false; errors: string[] }

const NOT_FOUND = 'Serviço não encontrado.'

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
  const [sheet, setSheet] = useState<'info' | 'add' | { repriseFor: string }>()
  const [applying, setApplying] = useState(false)
  const [repriseType, setRepriseType] = useState<'reprise' | 'medley'>('reprise')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [params, setParams] = useSearchParams()

  const load = useCallback(async () => {
    try {
      const current = await getService(serviceId)
      if (!current) { setService(undefined); setError(NOT_FOUND); return }
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

  async function run(action: () => Promise<Result>, success?: string) {
    setError('')
    setNotice('')
    try {
      const result = await action()
      if (!result.success) { setError(result.errors.join(' ')); return false }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir a operação.')
      return false
    }
    await load()
    if (success) setNotice(success)
    return true
  }

  async function startStage() {
    try {
      const session = await startOrResumeStage(serviceId)
      navigate(`/stage/service-session/${session.id}`)
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível iniciar o palco deste serviço.') }
  }

  async function saveInfo(info: ServiceInfoValues) {
    const saved = await run(() => updateServiceInfo(serviceId, {
      name: info.name, startsAt: new Date(info.startsAt).toISOString(), location: info.location, notes: info.notes,
    }), 'Informações salvas.')
    if (saved) setSheet(undefined)
  }

  async function transition(to: Service['status']) {
    if (to === 'cancelled' && !window.confirm('Cancelar este serviço? Serviços cancelados não podem ser reabertos.')) return
    await run(() => transitionService(serviceId, to), `Status: ${SERVICE_STATUS_LABEL[to]}.`)
  }

  async function addItem(input: NewItemInput) {
    setNotice('')
    const errors = validateServiceItem(input)
    if (errors.length) { setError(errors.join(' ')); return false }
    if (input.type === 'song' && personalSongs.some((song) => song.id === input.songId) && !navigator.onLine) { setError(OFFLINE_COPY_MESSAGE); return false }
    if (input.type === 'song' && items.some((item) => item.type === 'song' && item.songId === input.songId)) {
      setError(`"${songs.find((song) => song.id === input.songId)?.title ?? 'Esta música'}" já está na ordem.`)
      return false
    }
    const added = await run(() => addServiceItem(serviceId, input), 'Item adicionado à ordem.')
    if (added) setSheet(undefined)
    return added
  }

  async function submitReprise(event: FormEvent, refItemId: string) {
    event.preventDefault()
    if (await run(() => addReprise(serviceId, { type: repriseType, refItemId }), 'Adicionado à ordem.')) setSheet(undefined)
  }

  async function removeItem(item: ServiceItem) {
    const dependents = countDependents(items, item.id)
    if (dependents > 0 && !window.confirm(`Excluir "${itemLabel(item)}" também apaga ${dependents} ${dependents === 1 ? 'reprise/medley que volta' : 'reprises/medleys que voltam'} a esta música. Continuar?`)) return
    await run(() => removeServiceItem(item.id), 'Item removido.')
  }

  async function handleDelete() {
    if (!service || !window.confirm(`Excluir o serviço "${service.name}"? A ordem e a escala também serão removidas.`)) return
    const result = await deleteService(serviceId)
    if (!result.success) { setError(result.errors.join(' ')); return }
    navigate('/servicos', { replace: true })
  }

  if (!service && error === NOT_FOUND) return <main className="organization-page"><p role="alert">{NOT_FOUND}</p><Link to="/servicos">Voltar para Serviços</Link></main>
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

  const reprising = typeof sheet === 'object' ? items.find((item) => item.id === sheet.repriseFor) : undefined
  const errorAlert = error && <p role="alert" className="organization-error">{error}</p>
  const sheetOpen = sheet === 'info' || sheet === 'add' || reprising !== undefined
  const hasSongs = items.some((item) => item.type === 'song')

  const menu: ActionMenuItem[] = [
    ...(canEdit ? [{ label: 'Editar informações', onSelect: () => { setError(''); setSheet('info') } }] : []),
    ...(canTransition ? nextStatuses(service.status).map((to) => ({ label: SERVICE_TRANSITION_LABEL[to], danger: to === 'cancelled', onSelect: () => void transition(to) })) : []),
    ...(canDelete ? [{ label: 'Excluir serviço', danger: true, onSelect: () => void handleDelete() }] : []),
  ]

  const tabs = [
    { value: 'ordem', label: 'Ordem', content: <>
      <p className="service-summary">{items.filter((item) => item.type === 'song').length} música(s) · {items.length} item(ns) na ordem{service.notes && <> · {service.notes}</>}</p>
      {canEdit && <div className="service-actions">
        <Button onClick={() => { setError(''); setSheet('add') }}>Adicionar item</Button>
        <Button onClick={() => setApplying(true)}>Aplicar repertório</Button>
      </div>}
      <ServiceOrderList items={items} canEdit={canEdit} itemLabel={itemLabel} renderKey={keyField}
        onMove={(itemId, toIndex) => void run(() => moveServiceItem(serviceId, itemId, toIndex))}
        onRemove={(item) => void removeItem(item)}
        onReprise={(item) => { setError(''); setSheet({ repriseFor: item.id }) }} />
    </> },
    { value: 'escala', label: 'Escala', content: <ServiceSchedule service={service} access={access} currentUserId={user?.id ?? ''} /> },
    { value: 'ensaios', label: 'Ensaios', content: <RehearsalPanel serviceId={serviceId} items={items} itemLabel={itemLabel} final={final} /> },
    { value: 'materiais', label: 'Materiais', content: <MaterialsPanel owner={{ type: 'service', id: serviceId }} title="Materiais do serviço" final={final} /> },
    ...(service.status === 'completed' ? [{ value: 'registro', label: 'Registro', content: <ExecutionRecordPanel serviceId={serviceId} /> }] : []),
  ]
  const tab = tabs.find((item) => item.value === params.get('aba'))?.value ?? 'ordem'

  return <main className="organization-page service-page">
    <header className="service-header">
      <Link to="/servicos"><Icon name="back" size={20} /> Serviços</Link>
      <div className="service-header__title">
        <h2>{service.name}</h2>
        {menu.length > 0 && <ActionMenu label="Mais ações do serviço" items={menu} />}
      </div>
      <p className="service-header__meta">
        <Badge tone={SERVICE_STATUS_TONE[service.status]}>{SERVICE_STATUS_LABEL[service.status]}</Badge>
        <span>{formatServiceDate(service.startsAt)}</span>
        {service.location && <span>{service.location}</span>}
        <Link className="service-prepare-link" to={`/services/${service.id}/prepare`}>Preparar</Link>
      </p>
      {final && <p role="note">Serviço {SERVICE_STATUS_LABEL[service.status].toLowerCase()}: informações e ordem não podem mais ser editadas.</p>}
      {hasPermission(access, 'stage.start') && !final && <div className="service-primary-action">
        <Button variant="primary" onClick={() => void startStage()} disabled={!hasSongs}>Iniciar palco</Button>
      </div>}
    </header>
    {!sheetOpen && errorAlert}
    {notice && <p role="status">{notice}</p>}

    <Tabs label="Seções do serviço" items={tabs} value={tab} onChange={(next) => setParams({ aba: next }, { replace: true })} />

    {applying && <ApplyRepertoireDialog serviceId={serviceId} items={items} itemLabel={itemLabel} onClose={() => setApplying(false)} onApplied={() => { setApplying(false); setNotice('Repertório aplicado.'); void load() }} />}

    <Sheet open={sheet === 'info'} title="Editar informações" onClose={() => setSheet(undefined)}>
      <ServiceInfoForm initial={{ name: service.name, startsAt: toLocalInput(service.startsAt), location: service.location ?? '', notes: service.notes ?? '' }} onSave={(values) => void saveInfo(values)} onCancel={() => setSheet(undefined)} />
      {errorAlert}
    </Sheet>
    <Sheet open={sheet === 'add'} title="Adicionar item" onClose={() => setSheet(undefined)}>
      <AddServiceItemForm organizationSongs={organizationSongs} personalSongs={personalSongs} onSubmit={addItem} />
      {errorAlert}
    </Sheet>
    <Sheet open={reprising !== undefined} title="Adicionar reprise/medley" onClose={() => setSheet(undefined)}>
      {reprising && <form className="service-form service-reprise" aria-label={`Reprise de ${itemLabel(reprising)}`} onSubmit={(event) => void submitReprise(event, reprising.id)}>
        <label>Tipo<select value={repriseType} onChange={(event) => setRepriseType(event.target.value as 'reprise' | 'medley')}><option value="reprise">Reprise</option><option value="medley">Medley</option></select></label>
        <div className="service-actions"><Button type="submit" variant="primary">Adicionar à ordem</Button><Button onClick={() => setSheet(undefined)}>Cancelar</Button></div>
      </form>}
      {errorAlert}
    </Sheet>
  </main>
}
