import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/authContext'
import { organizationMembershipRepository } from '../../db/repositories/organizationRepository'
import { teamMembershipRepository, teamRepository } from '../../db/repositories/teamRepository'
import { getMyTeamMusicalFunctions, setMyTeamMusicalFunctions } from '../../application/teams/musicalFunctionService'
import type { Team } from '../../domain/teams/team'
import type { TeamMembership } from '../../domain/teams/teamMembership'
import type { OrganizationMembership } from '../../domain/organizations/organizationMembership'
import './OrganizationPage.css'

const FUNCTION_OPTIONS = ['vocals', 'guitar', 'bass', 'drums', 'keys', 'acoustic_guitar', 'electric_guitar', 'other']

export function TeamPage() {
  const { teamId = '' } = useParams()
  const { user } = useAuth()
  const [team, setTeam] = useState<Team>()
  const [members, setMembers] = useState<TeamMembership[]>([])
  const [organizationMembers, setOrganizationMembers] = useState<OrganizationMembership[]>([])
  const [myFunctions, setMyFunctions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const currentTeam = await teamRepository.getById(teamId)
      if (!currentTeam) { setError('Equipe não encontrada.'); return }
      const [teamMembers, orgMembers, musicalFunctions] = await Promise.all([
        teamMembershipRepository.listByTeamId(teamId),
        organizationMembershipRepository.listByOrganizationId(currentTeam.organizationId),
        getMyTeamMusicalFunctions(teamId),
      ])
      setTeam(currentTeam)
      setMembers(teamMembers)
      setOrganizationMembers(orgMembers)
      setMyFunctions(musicalFunctions)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar a equipe.')
    } finally {
      setLoading(false)
    }
  }, [teamId])

  useEffect(() => { void load() }, [load])

  async function toggleFunction(value: string) {
    const next = myFunctions.includes(value) ? myFunctions.filter((item) => item !== value) : [...myFunctions, value]
    try {
      setMyFunctions(await setMyTeamMusicalFunctions(teamId, next))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar suas funções musicais.')
    }
  }

  if (loading) return <main className="organization-page"><p>Carregando equipe…</p></main>
  if (!team) return <main className="organization-page"><p>{error || 'Equipe não encontrada.'}</p></main>

  return (
    <main className="organization-page">
      <section className="organization-card">
        <header>
          <Link to="/organizations">← Organizações</Link>
          <span>EQUIPE</span>
          <h2>{team.name}</h2>
          <p>{members.length} membro(s)</p>
        </header>

        {error && <p role="alert" className="organization-error">{error}</p>}

        <section>
          <h3>Suas funções musicais</h3>
          <p>Uma pessoa pode exercer várias funções na mesma equipe.</p>
          <div>
            {FUNCTION_OPTIONS.map((value) => (
              <label key={value} style={{ display: 'inline-flex', gap: '.35rem', marginRight: '.75rem', marginBottom: '.5rem' }}>
                <input type="checkbox" checked={myFunctions.includes(value)} onChange={() => void toggleFunction(value)} />
                {value}
              </label>
            ))}
          </div>
        </section>

        <section>
          <h3>Membros da equipe</h3>
          <ul>
            {members.map((member) => {
              const organizationMember = organizationMembers.find((item) => item.userId === member.userId)
              return <li key={member.id}>{member.userId === user?.id ? 'Você' : member.userId} — acesso: {organizationMember?.role ?? 'desconhecido'}</li>
            })}
          </ul>
        </section>
      </section>
    </main>
  )
}
