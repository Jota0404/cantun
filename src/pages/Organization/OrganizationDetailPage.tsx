import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { onRemoteDataApplied } from '../../application/sync/remoteData'
import { useAuth } from '../../auth/authContext'
import { organizationRepository } from '../../db/repositories/organizationRepository'
import { organizationSongRepository } from '../../db/repositories/organizationSongRepository'
import { repertoireRepository } from '../../db/repositories/repertoireRepository'
import { songRepository } from '../../db/repositories/songRepository'
import { createRepertoire } from '../../application/repertoires/repertoireService'
import { addSongToOrganization } from '../../application/organizations/organizationSongService'
import { InlineNameForm } from '../../components/ui/InlineNameForm'
import { labels } from '../../ui/labels'
import { ServicesPanel } from '../../components/service/ServicesPanel'
import { createTeam } from '../../application/teams/teamService'
import { teamRepository } from '../../db/repositories/teamRepository'
import type { Organization } from '../../domain/organizations/organization'
import type { Repertoire } from '../../domain/repertoires/repertoire'
import type { Song } from '../../domain/songs/song'
import type { Team } from '../../domain/teams/team'
import './OrganizationPage.css'

export function OrganizationDetailPage() {
  const { organizationId = '' } = useParams()
  const { user } = useAuth()
  const [organization, setOrganization] = useState<Organization>()
  const [songs, setSongs] = useState<Song[]>([])
  const [organizationSongIds, setOrganizationSongIds] = useState<Set<string>>(new Set())
  const [repertoires, setRepertoires] = useState<Repertoire[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [notFound, setNotFound] = useState(false)
  const [creating, setCreating] = useState<'team' | 'repertoire'>()
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const org = await organizationRepository.getById(organizationId)
      // Sem a organização local (ainda não sincronizada ou sem acesso): só vira "não encontrada" se nunca carregou.
      if (!org) { setNotFound(true); return }
      const [allSongs, ownedSongs, reps, currentTeams] = await Promise.all([
        songRepository.list(),
        organizationSongRepository.listByOrganizationId(organizationId),
        repertoireRepository.listByOrganizationId(organizationId),
        teamRepository.listByOrganizationId(organizationId),
      ])
      setOrganization(org)
      setNotFound(false)
      setError('')
      setSongs(allSongs)
      setOrganizationSongIds(new Set(ownedSongs.map((item) => item.songId)))
      setRepertoires(reps)
      // Mantém a referência quando nada mudou: a recarga ao vivo não deve recarregar o painel de serviços.
      setTeams((current) => JSON.stringify(current) === JSON.stringify(currentTeams) ? current : currentTeams)
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível carregar o Ministério.') }
  }, [organizationId])

  useEffect(() => {
    void load()
    return onRemoteDataApplied(() => { void load() })
    // Troca de usuário: os dados locais mudam de dono (ADR-048), então recarrega.
  }, [load, user?.id])

  async function createTeamForOrganization(name: string) {
    await createTeam(organizationId, name)
    setCreating(undefined)
    await load()
  }

  async function createRep(name: string) {
    if (!user) return
    await createRepertoire({ organizationId, name, createdByUserId: user.id, version: 1 })
    setCreating(undefined)
    await load()
  }

  async function addOrgSong(songId: string) {
    try { await addSongToOrganization(organizationId, songId); await load() }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível vincular a música ao Ministério.') }
  }

  if (!organization) return <main className="organization-page"><p role={error || notFound ? 'alert' : undefined}>{error || (notFound ? labels.organizationNotFound : labels.loadingOrganization)}</p></main>

  return <main className="organization-page"><section className="organization-card">
    <header><Link to="/organizations">{labels.backToOrganizations}</Link><span>{labels.organizationEyebrow}</span><h2>{organization.name}</h2><p>Biblioteca, repertórios e serviços.</p></header>
    {error && <p role="alert" className="organization-error">{error}</p>}

    <section><header><h3>{labels.teamsHeading}</h3><button type="button" aria-expanded={creating === 'team'} onClick={() => setCreating(creating === 'team' ? undefined : 'team')}>{labels.newTeam}</button></header>
      {creating === 'team' && <InlineNameForm label={labels.teamName} submitLabel={labels.createTeam} placeholder="Ex.: Banda de domingo" onSubmit={createTeamForOrganization} onCancel={() => setCreating(undefined)} />}
      <div className="organization-list">{teams.map((team) => <article className="organization-item" key={team.id}><div><strong>{team.name}</strong><p>{labels.teamSubtitle}</p></div><Link to={`/organizations/${organizationId}/teams/${team.id}`}>{labels.openTeam}</Link></article>)}</div>
      {teams.length === 0 && <p>{labels.noTeams}</p>}
    </section>

    <section><h3>Biblioteca do Ministério</h3><p>{organizationSongIds.size} música(s) vinculada(s) ao Ministério.</p>
      <div className="organization-list">{songs.map((song) => <article className="organization-item" key={song.id}><div><strong>{song.title}</strong>{song.artist && <p>{song.artist}</p>}</div>{organizationSongIds.has(song.id) ? <span>{labels.songLinked}</span> : <button type="button" aria-label={`${labels.linkSongToOrganization}: ${song.title}`} onClick={() => void addOrgSong(song.id)}>{labels.linkSongToOrganization}</button>}</article>)}</div>
    </section>

    <section><header><h3>Repertórios</h3><button type="button" aria-expanded={creating === 'repertoire'} onClick={() => setCreating(creating === 'repertoire' ? undefined : 'repertoire')}>Novo repertório</button></header>
      {creating === 'repertoire' && <InlineNameForm label="Nome do repertório" submitLabel="Criar repertório" placeholder="Ex.: Culto de domingo" onSubmit={createRep} onCancel={() => setCreating(undefined)} />}
      <div className="organization-list">{repertoires.map((rep) => <article className="organization-item" key={rep.id}><div><strong>{rep.name}</strong><Link to={`/organizations/${organizationId}/repertoires/${rep.id}`} aria-label={`Abrir repertório ${rep.name}`}>Abrir e adicionar músicas</Link></div></article>)}</div>
      {repertoires.length === 0 && <p>Nenhum repertório ainda. Crie um e adicione músicas buscando pelo nome.</p>}
    </section>

    <ServicesPanel organizationId={organizationId} teams={teams} />
  </section></main>
}
