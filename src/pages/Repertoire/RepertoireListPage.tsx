import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { onRemoteDataApplied } from '../../application/sync/remoteData'
import { createRepertoire, listPersonalRepertoires, listRepertoireGroups, type PersonalRepertoireSummary } from '../../application/repertoires/repertoireService'
import { useAuth } from '../../auth/authContext'
import type { Repertoire } from '../../domain/repertoires/repertoire'
import { summarySongs } from '../../components/repertoire/summarySongs'
import { labels } from '../../ui/labels'
import './RepertoirePage.css'

export function RepertoireListPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const [personal, setPersonal] = useState<PersonalRepertoireSummary[]>([])
  const [repertoires, setRepertoires] = useState<Array<Repertoire & { organizationName: string }>>([])
  const [name, setName] = useState('')
  // Só a primeira carga mostra "Carregando": a recarga ao vivo atualiza a lista no lugar e preserva o formulário (RN-A12).
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [mine, groups] = await Promise.all([listPersonalRepertoires(userId), listRepertoireGroups()])
      const rows = groups.flatMap((group) => group.repertoires.map((item) => ({ ...item, organizationName: group.organization.name })))
      setPersonal(mine)
      setRepertoires(rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar os repertórios.')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void load()
    return onRemoteDataApplied(() => { void load() })
  }, [load])

  // RN-C1: a aba cria repertório pessoal (sem Ministério), que funciona offline.
  async function handleCreate() {
    if (!userId || !name.trim()) return
    setSubmitting(true)
    setError('')
    try {
      const repertoire = await createRepertoire({ name: name.trim(), createdByUserId: userId, version: 1 })
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
        <div><h2>Repertórios</h2><p>{labels.repertoireOwnerHint}</p></div>
      </header>
      {error && <p className="repertoire-error" role="alert">{error}</p>}
      <section className="repertoire-create">
        <label htmlFor="target-repertoire-name">Novo repertório</label>
        <form className="repertoire-create__row" onSubmit={(event) => { event.preventDefault(); void handleCreate() }}>
          <input id="target-repertoire-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Culto de domingo" maxLength={120} />
          <button type="submit" disabled={submitting || !name.trim()}>{submitting ? 'Criando…' : 'Criar repertório'}</button>
        </form>
      </section>
      <section className="repertoire-section">
        <h3>{labels.personalRepertoires}</h3>
        {personal.length === 0 ? <div className="repertoire-empty"><p>{labels.noPersonalRepertoires}</p></div> : (
          <div className="repertoire-list">{personal.map((entry) => (
            <article className="repertoire-card" key={entry.repertoire.id}>
              <div><h4>{entry.repertoire.name}</h4><p>{summarySongs(entry)}</p></div>
              <button type="button" onClick={() => navigate(`/repertoires/${entry.repertoire.id}`)}>Abrir repertório</button>
            </article>
          ))}</div>
        )}
      </section>
      {repertoires.length > 0 && (
        <section className="repertoire-section">
          <h3>{labels.organizationRepertoires}</h3>
          <div className="repertoire-list">{repertoires.map((rep) => (
            <article className="repertoire-card" key={rep.id}>
              <div><h4>{rep.name}</h4><p>{rep.organizationName}</p></div>
              <button type="button" onClick={() => navigate(`/repertoires/${rep.id}`)}>Abrir repertório</button>
            </article>
          ))}</div>
        </section>
      )}
    </main>
  )
}
