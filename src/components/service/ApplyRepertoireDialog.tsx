import { useEffect, useState } from 'react'
import { applyRepertoireToService, listApplicableRepertoires } from '../../application/services/applyRepertoire'
import { getRepertoireDetail } from '../../application/repertoires/repertoireService'
import type { Repertoire } from '../../domain/repertoires/repertoire'
import type { ServiceItem } from '../../domain/services/serviceItem'
import { ConfirmModal } from '../ui/ConfirmModal'
import './ApplyRepertoireDialog.css'

interface Row { songId: string; title: string; checked: boolean; inOrder: boolean; missing: boolean }

interface Props {
  serviceId: string
  items: ServiceItem[]
  itemLabel: (item: ServiceItem) => string
  onClose: () => void
  onApplied: () => void
}

/** RN-02/03: escolhe o repertório, marca e reordena as músicas e define onde inserir. */
export function ApplyRepertoireDialog({ serviceId, items, itemLabel, onClose, onApplied }: Props) {
  const [repertoires, setRepertoires] = useState<Repertoire[]>([])
  const [repertoireId, setRepertoireId] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [afterItemId, setAfterItemId] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    listApplicableRepertoires(serviceId).then(setRepertoires).catch(() => setError('Não foi possível carregar os repertórios.')).finally(() => setLoaded(true))
  }, [serviceId])

  async function choose(id: string) {
    setRepertoireId(id)
    setError('')
    const detail = id ? await getRepertoireDetail(id) : undefined
    const inOrder = new Set(items.flatMap((item) => item.type === 'song' && item.songId ? [item.songId] : []))
    setRows((detail?.items ?? []).map((item) => ({ songId: item.songId, title: item.song?.title ?? 'Música indisponível', missing: !item.song, inOrder: inOrder.has(item.songId), checked: !inOrder.has(item.songId) && Boolean(item.song) })))
  }

  function move(index: number, direction: -1 | 1) {
    setRows((current) => {
      const next = [...current]
      ;[next[index], next[index + direction]] = [next[index + direction], next[index]]
      return next
    })
  }

  async function apply() {
    setBusy(true)
    setError('')
    try {
      const result = await applyRepertoireToService(serviceId, { repertoireId, songIds: rows.filter((row) => row.checked && !row.inOrder && !row.missing).map((row) => row.songId), afterItemId: afterItemId || undefined })
      if (!result.success) { setError(result.errors.join(' ')); return }
      onApplied()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível aplicar o repertório.')
    } finally {
      setBusy(false)
    }
  }

  return <ConfirmModal open title="Aplicar repertório" message="Escolha o repertório e as músicas que entram na ordem do serviço. O repertório original não muda." confirmLabel="Aplicar"
    confirmDisabled={busy || !rows.some((row) => row.checked && !row.inOrder)} onConfirm={() => void apply()} onCancel={onClose}>
    <div className="apply-repertoire">
      {loaded && repertoires.length === 0 && !error && <p>Nenhum repertório do Ministério.</p>}
      <label>Repertório
        <select value={repertoireId} onChange={(event) => void choose(event.target.value)}>
          <option value="">Escolha o repertório</option>
          {repertoires.map((repertoire) => <option key={repertoire.id} value={repertoire.id}>{repertoire.name}</option>)}
        </select>
      </label>
      {rows.length > 0 && <>
        <ol className="apply-repertoire__list" aria-label="Músicas do repertório">
          {rows.map((row, index) => <li key={row.songId}>
            <label><input type="checkbox" checked={row.checked} disabled={row.inOrder || row.missing} onChange={(event) => setRows((current) => current.map((r) => r.songId === row.songId ? { ...r, checked: event.target.checked } : r))} />
              {row.title}{row.inOrder && <small> — já está na ordem</small>}{row.missing && <small> — indisponível neste aparelho</small>}</label>
            <button type="button" aria-label={`Subir ${row.title}`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
            <button type="button" aria-label={`Descer ${row.title}`} disabled={index === rows.length - 1} onClick={() => move(index, 1)}>↓</button>
          </li>)}
        </ol>
        <label>Inserir
          <select value={afterItemId} onChange={(event) => setAfterItemId(event.target.value)}>
            <option value="">No fim da ordem</option>
            {items.map((item, index) => <option key={item.id} value={item.id}>Depois de {index + 1}. {itemLabel(item)}</option>)}
          </select>
        </label>
      </>}
      {error && <p role="alert">{error}</p>}
    </div>
  </ConfirmModal>
}
