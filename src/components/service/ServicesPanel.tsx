import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { createService, listServices, type ServiceGroups } from '../../application/services/serviceService'
import { onRemoteDataApplied } from '../../application/sync/remoteData'
import { getMyAccessContext } from '../../application/teams/teamMemberService'
import { hasPermission } from '../../domain/access/permissions'
import type { Service } from '../../domain/services/service'
import type { Team } from '../../domain/teams/team'
import { SERVICE_STATUS_LABEL, formatServiceDate } from './serviceLabels'
import './ServicesPanel.css'

const GROUPS: Array<{ key: keyof ServiceGroups; title: string; empty: string }> = [
  { key: 'upcoming', title: 'Próximos', empty: 'Nenhum serviço pronto ou em andamento.' },
  { key: 'planning', title: 'Em planejamento', empty: 'Nenhum serviço em planejamento.' },
  { key: 'past', title: 'Realizados', empty: 'Nenhum serviço realizado ou cancelado.' },
]

export function ServicesPanel({ organizationId, teams }: { organizationId: string; teams: Team[] }) {
  const [groups, setGroups] = useState<ServiceGroups>({ upcoming: [], planning: [], past: [] })
  const [creatableTeams, setCreatableTeams] = useState<Team[]>([])
  const [creating, setCreating] = useState(false)
  const [teamId, setTeamId] = useState('')
  const [name, setName] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [nextGroups, allowed] = await Promise.all([
          listServices(organizationId),
          Promise.all(teams.map(async (team) => hasPermission(await getMyAccessContext({ organizationId, teamId: team.id }), 'service.create') ? [team] : [])),
        ])
        if (cancelled) return
        setGroups(nextGroups)
        setCreatableTeams(allowed.flat())
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Não foi possível carregar os serviços.')
      }
    }
    void load()
    const unsubscribe = onRemoteDataApplied(() => { void load() })
    return () => { cancelled = true; unsubscribe() }
  }, [organizationId, teams, reloadKey])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submitting) return
    setError('')
    setSubmitting(true)
    const result = await createService({
      organizationId,
      teamId: teamId || creatableTeams[0]?.id || '',
      name,
      startsAt: new Date(startsAt).toISOString(),
      location: location || undefined,
      notes: notes || undefined,
    }).catch((err: unknown) => ({ success: false as const, errors: [err instanceof Error ? err.message : 'Não foi possível criar o serviço.'] }))
    setSubmitting(false)
    if (!result.success) { setError(result.errors.join(' ')); return }
    setName(''); setStartsAt(''); setLocation(''); setNotes(''); setCreating(false)
    setReloadKey((key) => key + 1)
  }

  const teamName = (service: Service) => teams.find((team) => team.id === service.teamId)?.name ?? 'Sem equipe'

  return (
    <section aria-labelledby="services-title" className="services-panel">
      <header>
        <h3 id="services-title">Serviços</h3>
        {creatableTeams.length > 0 && <button type="button" aria-expanded={creating} onClick={() => setCreating(!creating)}>Novo serviço</button>}
      </header>
      {error && <p role="alert" className="organization-error">{error}</p>}
      {creating && (
        <form className="services-panel__form" onSubmit={(event) => void submit(event)} aria-label="Novo serviço">
          <label>Equipe
            <select value={teamId || creatableTeams[0]?.id} onChange={(event) => setTeamId(event.target.value)} required>
              {creatableTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          </label>
          <label>Nome<input value={name} onChange={(event) => setName(event.target.value)} required pattern=".*\S.*" placeholder="Ex.: Culto de domingo" /></label>
          <label>Data e hora<input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required /></label>
          <label>Local (opcional)<input value={location} onChange={(event) => setLocation(event.target.value)} /></label>
          <label>Observações (opcional)<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} /></label>
          <button type="submit" disabled={submitting}>{submitting ? 'Criando…' : 'Criar serviço'}</button>
        </form>
      )}
      {GROUPS.map((group) => (
        <section key={group.key} aria-labelledby={`services-${group.key}`}>
          <h4 id={`services-${group.key}`}>{group.title}</h4>
          {groups[group.key].length === 0 ? <p>{group.empty}</p> : (
            <ul className="services-panel__list">
              {groups[group.key].map((service) => (
                <li key={service.id}>
                  <Link to={`/services/${service.id}`}>{service.name}</Link>
                  <span>{formatServiceDate(service.startsAt)} · {teamName(service)}</span>
                  <span className={`service-status service-status--${service.status}`}>{SERVICE_STATUS_LABEL[service.status]}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </section>
  )
}
