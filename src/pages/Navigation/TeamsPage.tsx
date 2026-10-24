import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listMyOrganizations } from '../../application/organizations/organizationService'
import { onRemoteDataApplied } from '../../application/sync/remoteData'
import { listTeams } from '../../application/teams/teamService'
import type { Organization } from '../../domain/organizations/organization'
import type { Team } from '../../domain/teams/team'
import { TeamOnboarding } from '../../components/team/TeamOnboarding'
import { labels } from '../../ui/labels'
import './NavigationPages.css'

// Apêndice B. Tarefa: chegar à banda. Prioridade: as bandas do Ministério principal (RN-11 do B2).
// Ação óbvia: abrir a banda. Sem Ministério, o onboarding.
export function TeamsPage() {
  const [organization, setOrganization] = useState<Organization>()
  const [teams, setTeams] = useState<Team[]>([])
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  // Trava o assistente: criar o Ministério (passo 1) faz a lista passar a ter organização, mas o assistente segue até o fim.
  const [onboarding, setOnboarding] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [principal] = await listMyOrganizations()
      const organizationTeams = principal ? await listTeams(principal.id) : []
      if (cancelled) return
      setOrganization(principal)
      if (!principal) setOnboarding(true)
      setTeams(organizationTeams)
      setFailed(false)
      setLoaded(true)
    }
    void load().catch(() => { if (!cancelled) { setFailed(true); setLoaded(true) } })
    const unsubscribe = onRemoteDataApplied(() => { void load().catch(() => undefined) })
    return () => { cancelled = true; unsubscribe() }
  }, [])

  if (failed) return <main className="nav-page"><h2>{labels.teams}</h2><p role="alert">Não foi possível carregar.</p></main>

  if (onboarding) return <main className="nav-page"><h2>{labels.teams}</h2><TeamOnboarding onFinished={() => setOnboarding(false)} /></main>

  return (
    <main className="nav-page">
      <h2>{labels.teams}</h2>
      {organization && <p>{organization.name}</p>}
      {loaded && teams.length === 0 && <p>{labels.noTeams}</p>}
      <ul className="nav-page__list">
        {teams.map((team) => (
          <li key={team.id}><Link to={`/organizations/${team.organizationId}/teams/${team.id}`}>{team.name}</Link></li>
        ))}
      </ul>
      {organization && <p><Link to={`/organizations/${organization.id}`}>Abrir {labels.organizationDefinite}</Link></p>}
    </main>
  )
}
