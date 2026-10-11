import { useEffect, useState, type FormEvent } from 'react'
import { onRemoteDataApplied } from '../../application/sync/remoteData'
import {
  assignMember, cancelAssignment, confirmAssignment, createPosition, declineAssignment, getServiceGaps, listAssignments,
  removePosition, replaceAssignment, requestReplacement, resendAssignmentInvite, suggestForPosition, updatePosition,
  type NamedSuggestion, type PositionGap,
} from '../../application/services/scheduleService'
import { listTeamMembers } from '../../application/teams/teamMemberService'
import { hasPermission, type AccessContext } from '../../domain/access/permissions'
import type { Assignment } from '../../domain/services/assignment'
import { availableAssignmentActions, type AssignmentAction } from '../../domain/services/assignmentLifecycle'
import { MUSICAL_FUNCTIONS } from '../../domain/services/servicePosition'
import type { Service } from '../../domain/services/service'
import { isFinalStatus } from '../../domain/services/serviceLifecycle'
import { musicalFunctionLabel } from '../team/musicalFunctions'
import { ASSIGNMENT_ACTION_LABEL, ASSIGNMENT_STATUS_LABEL, AVAILABILITY_LABEL, OFFLINE_MESSAGE } from './scheduleLabels'
import { useOnline } from './useOnline'
import './ServiceSchedule.css'

type Result = { success: true } | { success: false; errors: string[] }

interface Props {
  service: Service
  access: AccessContext
  currentUserId: string
}

export function ServiceSchedule({ service, access, currentUserId }: Props) {
  const online = useOnline()
  const [gaps, setGaps] = useState<PositionGap[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [reloadKey, setReloadKey] = useState(0)
  const [picker, setPicker] = useState<{ positionId: string; replacing?: string; suggestions: NamedSuggestion[] }>()
  const [editing, setEditing] = useState<string>()
  const [editQuantity, setEditQuantity] = useState('1')
  const [newFunction, setNewFunction] = useState('')
  const [newQuantity, setNewQuantity] = useState('1')
  const [newNotes, setNewNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const final = isFinalStatus(service.status)
  const canManage = hasPermission(access, 'schedule.manage')
  const reload = () => setReloadKey((key) => key + 1)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [serviceGaps, current, members] = await Promise.all([
          getServiceGaps(service.id),
          listAssignments(service.id),
          service.teamId ? listTeamMembers({ organizationId: service.organizationId, teamId: service.teamId }) : Promise.resolve([]),
        ])
        if (cancelled) return
        setGaps(serviceGaps.gaps)
        setAssignments(current)
        setNames(Object.fromEntries(members.flatMap((member) => member.userId ? [[member.userId, member.displayName]] : [])))
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Não foi possível carregar a escala.')
      }
    }
    void load()
    const unsubscribe = onRemoteDataApplied(() => { void load() })
    return () => { cancelled = true; unsubscribe() }
  }, [service.id, service.organizationId, service.teamId, reloadKey])

  const nameOf = (userId: string) => userId === currentUserId ? 'Você' : names[userId] ?? 'Participante'

  async function run(action: () => Promise<Result>, { online: needsOnline = false } = {}) {
    setError('')
    if (needsOnline && !online) { setError(OFFLINE_MESSAGE); return false }
    setBusy(true)
    try {
      const result = await action()
      if (!result.success) { setError(result.errors.join(' ')); return false }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir a operação.')
      return false
    } finally {
      setBusy(false)
    }
    reload()
    return true
  }

  async function openPicker(positionId: string, replacing?: string) {
    setError('')
    setPicker({ positionId, replacing, suggestions: await suggestForPosition(positionId) })
  }

  async function perform(action: AssignmentAction, assignment: Assignment) {
    if (action === 'replace') { await openPicker(assignment.positionId ?? '', assignment.id); return }
    if (action === 'cancel' && !window.confirm('Cancelar esta pessoa da escala?')) return
    const calls: Record<Exclude<AssignmentAction, 'replace'>, () => Promise<Result>> = {
      confirm: () => confirmAssignment(assignment.id),
      decline: () => declineAssignment(assignment.id),
      request_replacement: () => requestReplacement(assignment.id),
      cancel: () => cancelAssignment(assignment.id),
      resend_invite: () => resendAssignmentInvite(assignment.id),
    }
    await run(calls[action], { online: true })
  }

  async function choose(userId: string) {
    if (!picker) return
    const { positionId, replacing } = picker
    const done = await run(() => replacing ? replaceAssignment(replacing, userId) : assignMember(positionId, userId), { online: true })
    if (done) setPicker(undefined)
  }

  async function addPosition(event: FormEvent) {
    event.preventDefault()
    const done = await run(() => createPosition({ serviceId: service.id, musicalFunction: newFunction, quantity: Number(newQuantity), notes: newNotes || undefined }))
    if (done) { setNewFunction(''); setNewQuantity('1'); setNewNotes('') }
  }

  async function saveQuantity(event: FormEvent, positionId: string) {
    event.preventDefault()
    if (await run(() => updatePosition(positionId, { quantity: Number(editQuantity) }))) setEditing(undefined)
  }

  const usedFunctions = new Set(gaps.map((gap) => gap.position.musicalFunction))
  const freeFunctions = MUSICAL_FUNCTIONS.filter((value) => !usedFunctions.has(value))
  const missingTotal = gaps.reduce((sum, gap) => sum + gap.missing, 0)

  return (
    <section className="service-schedule" aria-labelledby="schedule-title">
      <h3 id="schedule-title">Escala</h3>
      {gaps.length > 0 && <p role="status">{missingTotal === 0 ? 'Escala completa: todas as vagas confirmadas.' : `Faltam ${missingTotal} pessoa(s) confirmada(s) em ${gaps.filter((gap) => gap.state === 'open').length} vaga(s).`}</p>}
      {!online && <p role="note">Você está sem conexão: confirmar, convidar e trocar pessoas só funciona online.</p>}
      {error && <p role="alert" className="organization-error">{error}</p>}
      {gaps.length === 0 && <p>Nenhuma vaga definida.</p>}

      <ul className="service-schedule__positions">
        {gaps.map((gap) => {
          const { position } = gap
          const label = musicalFunctionLabel(position.musicalFunction)
          const people = assignments.filter((assignment) => assignment.positionId === position.id && assignment.status !== 'cancelled')
          return (
            <li key={position.id} aria-label={`Vaga de ${label}`}>
              <header>
                <strong>{label}</strong>
                <span>{gap.confirmed} de {position.quantity} confirmado(s)</span>
                <span className={`schedule-state schedule-state--${gap.state}`}>
                  {gap.state === 'filled' ? 'Vaga completa' : `Faltam ${gap.missing}: ${gap.invited} aguardando resposta, ${gap.uninvited} sem convite`}
                </span>
              </header>
              {position.notes && <p>{position.notes}</p>}
              {people.length > 0 && <ul className="service-schedule__people">
                {people.map((assignment) => (
                  <li key={assignment.id}>
                    <span><strong>{nameOf(assignment.userId)}</strong> · {ASSIGNMENT_STATUS_LABEL[assignment.status]}</span>
                    <span className="service-schedule__actions">
                      {availableAssignmentActions(assignment, currentUserId, canManage, final).map((action) => (
                        <button key={action} type="button" aria-label={`${ASSIGNMENT_ACTION_LABEL[action]} de ${nameOf(assignment.userId)}`} disabled={busy || !online} onClick={() => void perform(action, assignment)}>
                          {ASSIGNMENT_ACTION_LABEL[action]}
                        </button>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>}
              {canManage && !final && <div className="service-schedule__actions">
                <button type="button" disabled={busy || !online} onClick={() => void openPicker(position.id)}>Convidar para {label}</button>
                <button type="button" disabled={busy} onClick={() => { setEditing(editing === position.id ? undefined : position.id); setEditQuantity(String(position.quantity)) }}>Editar vaga de {label}</button>
                <button type="button" disabled={busy} onClick={() => { if (window.confirm('Excluir vaga? O histórico de recusas desta vaga será apagado.')) void run(() => removePosition(position.id)) }}>Excluir vaga de {label}</button>
              </div>}
              {editing === position.id && <form className="service-schedule__form" onSubmit={(event) => void saveQuantity(event, position.id)} aria-label={`Editar vaga de ${label}`}>
                <label>Quantidade<input type="number" min={1} max={20} value={editQuantity} onChange={(event) => setEditQuantity(event.target.value)} required /></label>
                <button type="submit" disabled={busy}>Salvar quantidade</button>
              </form>}
              {picker?.positionId === position.id && (
                <section aria-label={picker.replacing ? 'Escolher substituto' : `Convidar para ${label}`} className="service-schedule__picker">
                  <h4>{picker.replacing ? 'Escolher substituto' : `Convidar para ${label}`}</h4>
                  {picker.suggestions.length === 0 ? <p>Ninguém disponível para sugerir nesta equipe.</p> : (
                    <ul>
                      {picker.suggestions.map((suggestion) => (
                        <li key={suggestion.userId}>
                          <span>
                            <strong>{suggestion.displayName}</strong>
                            {' · '}{suggestion.hasFunction ? `tem a função ${label}` : 'não marcou esta função'}
                            {suggestion.availability && <> · {AVAILABILITY_LABEL[suggestion.availability]} no dia</>}
                            {suggestion.warnings.includes('unavailable') && <> · Atenção: marcou indisponível</>}
                            {suggestion.warnings.includes('busy') && <> · Atenção: já escalado em outro serviço no mesmo horário</>}
                          </span>
                          <button type="button" disabled={busy || !online} onClick={() => void choose(suggestion.userId)}>Escalar {suggestion.displayName}</button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <button type="button" onClick={() => setPicker(undefined)}>Fechar sugestões</button>
                </section>
              )}
            </li>
          )
        })}
      </ul>

      {canManage && !final && <form className="service-schedule__form" onSubmit={(event) => void addPosition(event)} aria-label="Nova vaga">
        <label>Função
          <select value={newFunction} onChange={(event) => setNewFunction(event.target.value)} required>
            <option value="">Escolha a função</option>
            {freeFunctions.map((value) => <option key={value} value={value}>{musicalFunctionLabel(value)}</option>)}
          </select>
        </label>
        <label>Quantidade<input type="number" min={1} max={20} value={newQuantity} onChange={(event) => setNewQuantity(event.target.value)} required /></label>
        <label>Observações (opcional)<input value={newNotes} onChange={(event) => setNewNotes(event.target.value)} maxLength={500} /></label>
        <button type="submit" disabled={busy}>Adicionar vaga</button>
      </form>}
    </section>
  )
}
