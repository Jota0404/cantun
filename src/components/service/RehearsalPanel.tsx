import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createRehearsal, deleteRehearsal, listRehearsals, updateRehearsal, type RehearsalView } from '../../application/services/rehearsalService'
import { onRemoteDataApplied } from '../../application/sync/remoteData'
import type { ServiceItem } from '../../domain/services/serviceItem'
import { MaterialsPanel } from './MaterialsPanel'
import { formatServiceDate, toLocalInput } from './serviceLabels'
import './RehearsalPanel.css'

type Props = { serviceId: string; items: ServiceItem[]; itemLabel: (item: ServiceItem) => string; final: boolean }
type Draft = { id?: string; startsAt: string; location: string; notes: string; itemIds: string[] }

export function RehearsalPanel({ serviceId, items, itemLabel, final }: Props) {
  const [rehearsals, setRehearsals] = useState<RehearsalView[]>([])
  const [canManage, setCanManage] = useState(false)
  const [draft, setDraft] = useState<Draft>()
  const [error, setError] = useState('')

  const [version, setVersion] = useState(0)
  const reload = () => setVersion((v) => v + 1)
  const itemsKey = items.map((i) => i.id).join(',')
  const opener = useRef<HTMLElement | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const addBtn = useRef<HTMLButtonElement>(null)
  const wasOpen = useRef(false)
  const isOpen = Boolean(draft)

  useEffect(() => {
    if (isOpen) formRef.current?.querySelector('input')?.focus()
    else if (wasOpen.current) (opener.current?.isConnected ? opener.current : addBtn.current)?.focus()
    wasOpen.current = isOpen
  }, [isOpen])

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const r = await listRehearsals(serviceId)
        if (active && r.success) { setRehearsals(r.rehearsals); setCanManage(r.canManage) }
      } catch { /* lista é opcional */ }
    }
    void load()
    const off = onRemoteDataApplied(() => { void load() })
    return () => { active = false; off() }
  }, [serviceId, version, itemsKey])

  const controls = canManage && !final
  const songs = items.filter((item) => item.type === 'song')
  if (!controls && rehearsals.length === 0) return null

  const open = (r?: RehearsalView) => {
    opener.current = document.activeElement as HTMLElement | null
    setError('')
    setDraft(r
      ? { id: r.id, startsAt: toLocalInput(r.startsAt), location: r.location ?? '', notes: r.notes ?? '', itemIds: r.songs.map((s) => s.serviceItemId) }
      : { startsAt: '', location: '', notes: '', itemIds: [] })
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!draft) return
    setError('')
    const input = {
      startsAt: new Date(draft.startsAt).toISOString(),
      location: draft.location.trim() || undefined,
      notes: draft.notes.trim() || undefined,
      serviceItemIds: songs.filter((s) => draft.itemIds.includes(s.id)).map((s) => s.id),
    }
    try {
      const r = draft.id ? await updateRehearsal(draft.id, input) : await createRehearsal(serviceId, input)
      if (!r.success) { setError(r.errors.join(' ')); return }
      setDraft(undefined)
      reload()
    } catch { setError('Não foi possível salvar o ensaio. Tente novamente.') }
  }

  async function remove(r: RehearsalView) {
    if (!window.confirm(`Excluir o ensaio de ${formatServiceDate(r.startsAt)}?`)) return
    setError('')
    try {
      const res = await deleteRehearsal(r.id)
      if (!res.success) { setError(res.errors.join(' ')); return }
      reload()
    } catch { setError('Não foi possível excluir o ensaio. Tente novamente.') }
  }

  const toggle = (id: string) => setDraft((d) => d && ({ ...d, itemIds: d.itemIds.includes(id) ? d.itemIds.filter((x) => x !== id) : [...d.itemIds, id] }))

  return <section aria-labelledby="rehearsals-title" className="rehearsal-panel">
    <h3 id="rehearsals-title">Ensaios</h3>
    {rehearsals.length > 0 && <ul>
      {rehearsals.map((r) => <li key={r.id}>
        <strong>{formatServiceDate(r.startsAt)}</strong>
        {r.location && <span> · {r.location}</span>}
        {r.notes && <p>{r.notes}</p>}
        {r.songs.length > 0 && <p>Em foco: {r.songs.map((s) => s.title).join(', ')}</p>}
        <MaterialsPanel owner={{ type: 'rehearsal', id: r.id }} title="Materiais do ensaio" final={final} />
        {controls && <div className="rehearsal-panel__actions">
          <button type="button" aria-label={`Editar ensaio de ${formatServiceDate(r.startsAt)}`} onClick={() => open(r)}>Editar</button>
          <button type="button" aria-label={`Excluir ensaio de ${formatServiceDate(r.startsAt)}`} onClick={() => void remove(r)}>Excluir</button>
        </div>}
      </li>)}
    </ul>}
    {controls && !draft && <button ref={addBtn} type="button" onClick={() => open()}>Marcar ensaio</button>}
    {controls && draft && <form ref={formRef} className="service-form" aria-label={draft.id ? 'Editar ensaio' : 'Marcar ensaio'} onSubmit={(e) => void save(e)}>
      <label>Data e hora do ensaio<input type="datetime-local" value={draft.startsAt} onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })} required /></label>
      <label>Local do ensaio<input value={draft.location} maxLength={120} onChange={(e) => setDraft({ ...draft, location: e.target.value })} /></label>
      <label>Observações do ensaio<textarea rows={3} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>
      {songs.length > 0 && <fieldset><legend>Músicas em foco</legend>
        {songs.map((s) => <label key={s.id} className="rehearsal-panel__check"><input type="checkbox" checked={draft.itemIds.includes(s.id)} onChange={() => toggle(s.id)} />{itemLabel(s)}</label>)}
      </fieldset>}
      <div className="rehearsal-panel__actions"><button type="submit">Salvar ensaio</button><button type="button" onClick={() => setDraft(undefined)}>Cancelar</button></div>
    </form>}
    {error && <p role="alert">{error}</p>}
  </section>
}
