import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/authContext'
import { onRemoteDataApplied } from '../../application/sync/remoteData'
import { listMyOrganizations } from '../../application/organizations/organizationService'
import type { Organization } from '../../domain/organizations/organization'
import {
  clearMyAvailability, confirmAssignment, declineAssignment, listMyAvailability, listMyUpcomingAssignments, requestReplacement, setMyAvailability,
  type MyUpcomingAssignment,
} from '../../application/services/scheduleService'
import { availableAssignmentActions, type AssignmentAction } from '../../domain/services/assignmentLifecycle'
import { AVAILABILITY_NOTE_MAX, type AvailabilityStatus, type MemberAvailability } from '../../domain/services/memberAvailability'
import { ASSIGNMENT_ACTION_LABEL, ASSIGNMENT_STATUS_LABEL, AVAILABILITY_LABEL, OFFLINE_MESSAGE } from '../../components/schedule/scheduleLabels'
import { useOnline } from '../../components/schedule/useOnline'
import { musicalFunctionLabel } from '../../components/team/musicalFunctions'
import { formatServiceDate } from '../../components/service/serviceLabels'
import './MyServicesPage.css'
import { labels } from '../../ui/labels'

type Result = { success: true } | { success: false; errors: string[] }

export function MyServicesPage() {
  const { user } = useAuth()
  const online = useOnline()
  const [upcoming, setUpcoming] = useState<MyUpcomingAssignment[]>([])
  const [loaded, setLoaded] = useState(false)
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [availability, setAvailability] = useState<MemberAvailability[]>([])
  const [organizationId, setOrganizationId] = useState('')
  const [date, setDate] = useState('')
  const [status, setStatus] = useState<AvailabilityStatus>('unavailable')
  const [note, setNote] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const userId = user?.id ?? ''
  const activeOrganizationId = organizationId || organizations[0]?.id || ''

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [mine, orgs] = await Promise.all([listMyUpcomingAssignments(), listMyOrganizations()])
        const orgId = organizationId || orgs[0]?.id
        const days = orgId ? await listMyAvailability(orgId) : []
        if (cancelled) return
        setUpcoming(mine)
        setOrganizations(orgs)
        setAvailability(days)
        setLoaded(true)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Não foi possível carregar seus serviços.')
      }
    }
    void load()
    const unsubscribe = onRemoteDataApplied(() => { void load() })
    return () => { cancelled = true; unsubscribe() }
  }, [reloadKey, userId, organizationId])

  async function run(action: () => Promise<Result | void>, needsOnline: boolean) {
    setError('')
    if (needsOnline && !online) { setError(OFFLINE_MESSAGE); return }
    setBusy(true)
    try {
      const result = await action()
      if (result && !result.success) { setError(result.errors.join(' ')); return }
      setReloadKey((key) => key + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir a operação.')
    } finally {
      setBusy(false)
    }
  }

  function respond(action: AssignmentAction, assignmentId: string) {
    const calls: Partial<Record<AssignmentAction, () => Promise<Result>>> = {
      confirm: () => confirmAssignment(assignmentId),
      decline: () => declineAssignment(assignmentId),
      request_replacement: () => requestReplacement(assignmentId),
    }
    const call = calls[action]
    if (call) void run(call, true)
  }

  async function saveAvailability(event: FormEvent) {
    event.preventDefault()
    await run(() => setMyAvailability({ organizationId: activeOrganizationId, date, status, note: note || undefined }), false)
    setDate(''); setNote('')
  }

  return (
    <div className="my-services">
      {!online && <p role="note">Você está sem conexão: confirmar, recusar e pedir substituição só funcionam online.</p>}
      {error && <p role="alert" className="organization-error">{error}</p>}

      <section aria-labelledby="my-upcoming-title">
        <h3 id="my-upcoming-title">Próximos serviços</h3>
        {loaded && upcoming.length === 0 && <p>Você não está escalado em nenhum serviço próximo.</p>}
        <ul className="my-services__list">
          {upcoming.map(({ assignment, service, songTitles }) => (
            <li key={assignment.id} aria-label={service.name}>
              <header>
                <Link to={`/services/${service.id}`}>{service.name}</Link>
                <span>{formatServiceDate(service.startsAt)}{service.location && <> · {service.location}</>}</span>
              </header>
              <p>Função: <strong>{musicalFunctionLabel(assignment.musicalFunction)}</strong> · {ASSIGNMENT_STATUS_LABEL[assignment.status]}</p>
              <p>{songTitles.length ? `Músicas: ${songTitles.join(', ')}` : 'Ainda sem músicas na ordem.'}</p>
              <div className="my-services__actions">
                {availableAssignmentActions(assignment, userId, false, false).map((action) => (
                  <button key={action} type="button" aria-label={`${ASSIGNMENT_ACTION_LABEL[action]} em ${service.name}`} disabled={busy || !online} onClick={() => respond(action, assignment.id)}>
                    {ASSIGNMENT_ACTION_LABEL[action]}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="my-availability-title">
        <h3 id="my-availability-title">Minha disponibilidade</h3>
        {!activeOrganizationId ? <p>{labels.noOrganizationYet}</p> : <>
          <form className="my-services__form" onSubmit={(event) => void saveAvailability(event)} aria-label="Informar disponibilidade">
            {organizations.length > 1 && <label>{labels.organization}
              <select value={activeOrganizationId} onChange={(event) => setOrganizationId(event.target.value)}>
                {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
              </select>
            </label>}
            <label>Data<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
            <label>Situação
              <select value={status} onChange={(event) => setStatus(event.target.value as AvailabilityStatus)}>
                {(Object.keys(AVAILABILITY_LABEL) as AvailabilityStatus[]).map((value) => <option key={value} value={value}>{AVAILABILITY_LABEL[value]}</option>)}
              </select>
            </label>
            <label>Nota (opcional)<input value={note} maxLength={AVAILABILITY_NOTE_MAX} onChange={(event) => setNote(event.target.value)} /></label>
            <button type="submit" disabled={busy}>Salvar disponibilidade</button>
          </form>
          {availability.length === 0 ? <p>Nenhuma data informada.</p> : (
            <ul className="my-services__list">
              {availability.map((item) => (
                <li key={item.id}>
                  <span><strong>{new Date(`${item.date}T12:00:00`).toLocaleDateString('pt-BR')}</strong> · {AVAILABILITY_LABEL[item.status]}{item.note && <> · {item.note}</>}</span>
                  <button type="button" aria-label={`Remover disponibilidade de ${new Date(`${item.date}T12:00:00`).toLocaleDateString('pt-BR')}`} disabled={busy} onClick={() => void run(() => clearMyAvailability(item.organizationId, item.date), false)}>
                    Remover
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>}
      </section>
    </div>
  )
}
