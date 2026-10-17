import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { listMyOrganizations } from '../../application/organizations/organizationService'
import { getMyAccessContext } from '../../application/teams/teamMemberService'
import { listTeams } from '../../application/teams/teamService'
import { hasPermission } from '../../domain/access/permissions'
import type { Organization } from '../../domain/organizations/organization'
import type { Team } from '../../domain/teams/team'
import { ServicesPanel } from '../../components/service/ServicesPanel'
import { MyServicesPage } from '../Schedule/MyServicesPage'
import './NavigationPages.css'

// Apêndice B. Tarefa: ver onde estou escalado e quais serviços existem. Prioridade: o que preciso confirmar.
// Ação óbvia: abrir o serviço. "Todos os serviços" só aparece para quem cria serviços (RN-02).
export function ServicesPage({ tab }: { tab: 'mine' | 'all' }) {
  const [organization, setOrganization] = useState<Organization>()
  const [teams, setTeams] = useState<Team[]>([])
  const [canManage, setCanManage] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [principal] = await listMyOrganizations()
      const organizationTeams = principal ? await listTeams(principal.id) : []
      const contexts = principal ? await Promise.all(organizationTeams.map((team) => getMyAccessContext({ organizationId: principal.id, teamId: team.id }))) : []
      if (cancelled) return
      setOrganization(principal)
      setTeams(organizationTeams)
      setCanManage(contexts.some((context) => hasPermission(context, 'service.create')))
      setLoaded(true)
    }
    void load().catch(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [])

  const showAll = tab === 'all' && canManage

  return (
    <main className="nav-page">
      <h2>Serviços</h2>
      {canManage && (
        <nav className="nav-page__tabs" aria-label="Seções de serviços">
          <NavLink to="/meus-servicos" end>Meus serviços</NavLink>
          <NavLink to="/servicos/todos" end>Todos os serviços</NavLink>
        </nav>
      )}
      {showAll
        ? organization && <ServicesPanel organizationId={organization.id} teams={teams} />
        : <MyServicesPage />}
      {loaded && tab === 'all' && !canManage && <p>Você vê aqui os serviços em que está escalado.</p>}
      {loaded && !organization && <p>Você ainda não participa de um Ministério. <Link to="/bandas">Criar a primeira banda</Link></p>}
    </main>
  )
}
