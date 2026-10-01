import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createRepertoire } from '../../application/repertoires/repertoireService'
import { useAuth } from '../../auth/authContext'
import { organizationRepository } from '../../db/repositories/organizationRepository'
import { repertoireRepository } from '../../db/repositories/repertoireRepository'
import type { Organization } from '../../domain/organizations/organization'
import type { Repertoire } from '../../domain/repertoires/repertoire'
import './RepertoirePage.css'

export function RepertoireListPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [repertoires, setRepertoires] = useState<Array<Repertoire & { organizationName: string }>>([])
  const [organizationId, setOrganizationId] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const orgs = await organizationRepository.list()
      const rows = (await Promise.all(orgs.map(async (org) => {
        const items = await repertoireRepository.listByOrganizationId(org.id)
        return items.map((item) => ({ ...item, organizationName: org.name }))
      }))).flat()
      setOrganizations(orgs)
      setRepertoires(rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
      if (!organizationId && orgs[0]) setOrganizationId(orgs[0].id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar os repertórios.')
    } finally {
      setLoading(false)
    }
  }, [organizationId])

  useEffect(() => { void load() }, [load])

  async function handleCreate() {
    if (!organizationId || !name.trim()) return
    setSubmitting(true)
    setError('')
    try {
      const repertoire = await createRepertoire({
        organizationId,
        name: name.trim(),
        createdByUserId: user?.id ?? '',
        version: 1,
      })
      setName('')
      navigate(`/repertoires/${repertoire.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar o repertório.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <main className="repertoire-page"><p>Carregando repertórios…</p></main>

  return (
    <main className="repertoire-page">
      <header className="repertoire-page__header">
        <div><h2>Repertórios</h2><p>Coleções reutilizáveis de músicas pertencentes a uma organização.</p></div>
      </header>
      {error && <p className="repertoire-error" role="alert">{error}</p>}
      {organizations.length === 0 ? (
        <div className="repertoire-empty"><p>Nenhuma organização disponível.</p><button type="button" onClick={() => navigate('/organizations')}>Abrir organizações</button></div>
      ) : (
        <>
          <section className="repertoire-create">
            <label htmlFor="target-repertoire-org">Organização</label>
            <select id="target-repertoire-org" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>
              {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
            </select>
            <label htmlFor="target-repertoire-name">Novo repertório</label>
            <div className="repertoire-create__row">
              <input id="target-repertoire-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Culto de domingo" maxLength={120} />
              <button type="button" disabled={submitting || !name.trim()} onClick={() => void handleCreate()}>{submitting ? 'Criando…' : 'Criar repertório'}</button>
            </div>
          </section>
          {repertoires.length === 0 ? <div className="repertoire-empty"><p>Nenhum repertório cadastrado.</p></div> : (
            <div className="repertoire-list">{repertoires.map((rep) => (
              <article className="repertoire-card" key={rep.id}>
                <div><h3>{rep.name}</h3><p>{rep.organizationName} · {rep.version}ª versão</p></div>
                <button type="button" onClick={() => navigate(`/repertoires/${rep.id}`)}>Abrir repertório</button>
              </article>
            ))}</div>
          )}
        </>
      )}
    </main>
  )
}
