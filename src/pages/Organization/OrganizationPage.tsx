import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { onRemoteDataApplied } from '../../application/sync/remoteData'
import { createTeam } from '../../application/teams/teamService'
import { InlineNameForm } from '../../components/ui/InlineNameForm'
import { labels } from '../../ui/labels'
import { TeamOnboarding } from '../../components/team/TeamOnboarding'
import { organizationRepository } from '../../db/repositories/organizationRepository'
import { teamRepository } from '../../db/repositories/teamRepository'
import type { Organization } from '../../domain/organizations/organization'
import type { Team } from '../../domain/teams/team'
import './OrganizationPage.css'

export function OrganizationPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [teams, setTeams] = useState<Record<string, Team[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creatingTeamFor, setCreatingTeamFor] = useState<string>()
  // Decidido na primeira carga: o assistente segue aberto mesmo depois que a organização entra na lista.
  const [onboarding, setOnboarding] = useState<boolean>()

  const load = useCallback(async () => {
    try {
      const orgs = await organizationRepository.list()
      const grouped: Record<string, Team[]> = {}
      await Promise.all(orgs.map(async (org) => { grouped[org.id] = await teamRepository.listByOrganizationId(org.id) }))
      setOrganizations(orgs)
      setOnboarding((current) => current ?? orgs.length === 0)
      setTeams(grouped)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar as organizações.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    return onRemoteDataApplied(() => { void load() })
  }, [load])

  async function handleCreateTeam(organizationId: string, name: string) {
    await createTeam(organizationId, name)
    setCreatingTeamFor(undefined)
    await load()
  }

  if (loading) return <main className="organization-page"><p>Carregando organizações…</p></main>

  return (
    <main className="organization-page">
      <section className="organization-card">
        <header>
          <span>CANTUM WORKSPACE</span>
          <h2>{labels.organizations}</h2>
          <p>O Ministério é o espaço principal onde bandas, repertórios e serviços são administrados.</p>
        </header>

        {error && <p role="alert" className="organization-error">{error}</p>}

        {onboarding ? (
          <TeamOnboarding onFinished={() => setOnboarding(false)} />
        ) : (
          <div className="organization-list">
            {organizations.map((organization) => (
              <article key={organization.id} className="organization-item">
                <div>
                  <h3>{organization.name}</h3>
                  <p>{teams[organization.id]?.length ?? 0} banda(s)</p>
                  <button type="button" aria-expanded={creatingTeamFor === organization.id} aria-label={`${labels.createTeam} em ${organization.name}`} onClick={() => setCreatingTeamFor(creatingTeamFor === organization.id ? undefined : organization.id)}>{labels.createTeam}</button>
                  {creatingTeamFor === organization.id && <InlineNameForm label={labels.teamName} submitLabel={labels.createTeam} placeholder="Ex.: Banda de domingo" onSubmit={(name) => handleCreateTeam(organization.id, name)} onCancel={() => setCreatingTeamFor(undefined)} />}
                </div>
                <div>
                  <Link to={teams[organization.id]?.[0] ? `/organizations/${organization.id}/teams/${teams[organization.id][0].id}` : `/organizations/${organization.id}`}>
                    Abrir
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
