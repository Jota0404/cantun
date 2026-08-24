import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { createSetlist } from '../../application/repertoires/createSetlist'
import { deleteSetlist } from '../../application/repertoires/deleteSetlist'
import { duplicateSetlist } from '../../application/repertoires/duplicateSetlist'
import { listSetlists } from '../../application/repertoires/listSetlists'
import type { Setlist } from '../../domain/repertoires/setlist'
import type { SetlistRepository } from '../../db/repositories/setlistRepository'
import './RepertoirePage.css'

type RepertoireListPageProps = {
  repository?: SetlistRepository
}

export function RepertoireListPage({ repository }: RepertoireListPageProps) {
  const [setlists, setSetlists] = useState<Setlist[]>([])
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | undefined>()
  const [duplicatingId, setDuplicatingId] = useState<string | undefined>()
  const [error, setError] = useState<string | undefined>()
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false

    async function load() {
      const result = repository ? await listSetlists(repository) : await listSetlists()
      if (!cancelled) {
        setSetlists(result)
        setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [repository])

  async function handleDelete(setlistId: string, setlistName: string) {
    if (!window.confirm(`Deseja excluir o repertório "${setlistName}"?`)) return

    setError(undefined)
    setDeletingId(setlistId)

    try {
      const result = repository
        ? await deleteSetlist(setlistId, { setlists: repository })
        : await deleteSetlist(setlistId)

      if (!result.success) {
        setError(result.message)
        return
      }

      setSetlists((current) => current.filter((item) => item.id !== setlistId))
    } catch {
      setError('Não foi possível excluir o repertório. Tente novamente.')
    } finally {
      setDeletingId(undefined)
    }
  }

  async function handleDuplicate(setlistId: string) {
    setError(undefined)
    setDuplicatingId(setlistId)

    try {
      const result = repository
        ? await duplicateSetlist(setlistId, { setlists: repository })
        : await duplicateSetlist(setlistId)

      if (!result.success) {
        setError(result.message)
        return
      }

      setSetlists((current) => [result.setlist, ...current])
    } catch {
      setError('Não foi possível duplicar o repertório. Tente novamente.')
    } finally {
      setDuplicatingId(undefined)
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(undefined)
    setSubmitting(true)

    try {
      const result = repository
        ? await createSetlist(name, repository)
        : await createSetlist(name)

      if (!result.success) {
        setError(result.errors[0]?.message ?? 'Não foi possível criar o repertório.')
        return
      }

      setSetlists((current) => [result.setlist, ...current])
      setName('')
      navigate(`/repertoires/${result.setlist.id}`)
    } catch {
      setError('Não foi possível criar o repertório. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <p>Carregando repertórios...</p>
  }

  return (
    <section className="repertoire-page">
      <header className="repertoire-page__header">
        <div>
          <h2>Repertórios</h2>
          <p>Organize suas músicas em sequências para cada momento.</p>
        </div>
      </header>

      <form className="repertoire-create" onSubmit={handleCreate}>
        <label htmlFor="repertoire-name">Novo repertório</label>
        <div className="repertoire-create__row">
          <input
            id="repertoire-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex.: Culto de domingo"
            maxLength={120}
          />
          <button type="submit" disabled={submitting}>
            {submitting ? 'Criando...' : 'Criar repertório'}
          </button>
        </div>
        {error && <p className="repertoire-error" role="alert">{error}</p>}
      </form>

      {setlists.length === 0 ? (
        <div className="repertoire-empty">
          <p>Nenhum repertório cadastrado.</p>
          <p>Crie o primeiro repertório para começar a organizar suas músicas.</p>
        </div>
      ) : (
        <div className="repertoire-list">
          {setlists.map((setlist) => (
            <article className="repertoire-card" key={setlist.id}>
              <div>
                <h3>{setlist.name}</h3>
                <p>Atualizado em {new Date(setlist.updatedAt).toLocaleDateString('pt-BR')}</p>
              </div>
              <div className="repertoire-card__actions">
                <button type="button" onClick={() => navigate(`/repertoires/${setlist.id}`)}>
                  Abrir repertório
                </button>
                <button
                  type="button"
                  disabled={duplicatingId === setlist.id}
                  onClick={() => void handleDuplicate(setlist.id)}
                >
                  {duplicatingId === setlist.id ? 'Duplicando...' : 'Duplicar'}
                </button>
                <button
                  type="button"
                  disabled={deletingId === setlist.id}
                  onClick={() => void handleDelete(setlist.id, setlist.name)}
                >
                  {deletingId === setlist.id ? 'Excluindo...' : 'Excluir'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
