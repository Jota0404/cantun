import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createOrganization } from '../../application/organizations/organizationService'
import { organizationRepository } from '../../db/repositories/organizationRepository'
import { teamRepository } from '../../db/repositories/teamRepository'
import type { Organization } from '../../domain/organizations/organization'
import type { Team } from '../../domain/teams/team'
import './OrganizationPage.css'

export function OrganizationPage() {
  const navigate = useNavigate()
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [teams, setTeams] = useState<Record<string, Team[]>>({})
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const orgs = await organizationRepository.list()
      const grouped: Record<string, Team[]> = {}
      await Promise.all(orgs.map(async (org) => { grouped[org.id] = await teamRepository.listByOrganizationId(org.id) }))
      setOrganizations(orgs)
      setTeams(grouped)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar as organizações.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function handleCreate() {
    if (!name.trim()) return
    setError('')
    try {
      const organization = await createOrganization(name)
      setName('')
      await load()
      navigate('/organizations')
      void organization
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar a organização.')
    }
  }

  if (loading) return <main className="organization-page"><p>Carregando organizações…</p></main>

  return (
    <main className="organization-page">
      <section className="organization-card">
        <header>
          <span>CANTUM WORKSPACE</span>
          <h2>Organizações</h2>
          <p>A organização é o espaço principal onde equipes, repertórios e serviços são administrados.</p>
        </header>

        <div className="organization-create">
          <input aria-label="Nome da organização" value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome da organização" />
          <button type="button" onClick={() => void handleCreate()}>Criar organização</button>
        </div>

        {error && <p role="alert" className="organization-error">{error}</p>}

        {organizations.length === 0 ? (
          <p>Nenhuma organização disponível.</p>
        ) : (
          <div className="organization-list">
            {organizations.map((organization) => (
              <article key={organization.id} className="organization-item">
                <div>
                  <h3>{organization.name}</h3>
                  <p>{teams[organization.id]?.length ?? 0} equipe(s)</p>
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
