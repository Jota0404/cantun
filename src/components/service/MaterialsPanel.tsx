import { useEffect, useRef, useState, type FormEvent } from 'react'
import { addMaterial, deleteMaterial, listMaterials, updateMaterial, type MaterialOwner, type MaterialView } from '../../application/services/materialService'
import { onRemoteDataApplied } from '../../application/sync/remoteData'
import './MaterialsPanel.css'

type Props = { owner: MaterialOwner; title?: string; final?: boolean }
type Draft = { id?: string; title: string; url: string; notes: string }

export function MaterialLink({ material }: { material: MaterialView }) {
  let valid = Boolean(material.domain)
  try { new URL(material.url) } catch { valid = false }
  return <>
    {valid
      ? <a href={material.url} target="_blank" rel="noopener noreferrer">{material.title}<span className="materials-panel__sr"> (abre em nova aba)</span></a>
      : <span>{material.title}</span>}
    <span> {valid ? `(${material.domain})` : '(link inválido)'}</span>
    {material.notes && <p>{material.notes}</p>}
  </>
}

export function MaterialsHint() {
  return <p className="materials-panel__hint">O conteúdo abre online; o CANTUM não guarda o arquivo.</p>
}

export function MaterialsPanel({ owner, title = 'Materiais', final = false }: Props) {
  const [materials, setMaterials] = useState<MaterialView[]>([])
  const [canManage, setCanManage] = useState(false)
  const [draft, setDraft] = useState<Draft>()
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const reload = () => setVersion((v) => v + 1)
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
        const r = await listMaterials({ type: owner.type, id: owner.id })
        if (active && r.success) { setMaterials(r.materials); setCanManage(r.canManage) }
      } catch { /* lista é opcional */ }
    }
    void load()
    const off = onRemoteDataApplied(() => { void load() })
    return () => { active = false; off() }
  }, [owner.type, owner.id, version])

  const controls = canManage && !final
  if (!controls && materials.length === 0) return null
  const heading = `${title.replace(/\s+/g, '-').toLowerCase()}-${owner.type}-${owner.id}`

  const open = (m?: MaterialView) => {
    opener.current = document.activeElement as HTMLElement | null
    setError('')
    setDraft(m ? { id: m.id, title: m.title, url: m.url, notes: m.notes ?? '' } : { title: '', url: '', notes: '' })
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!draft) return
    setError('')
    const input = { title: draft.title.trim(), url: draft.url.trim(), notes: draft.notes.trim() || undefined }
    try {
      const r = draft.id ? await updateMaterial(draft.id, input) : await addMaterial(owner, input)
      if (!r.success) { setError(r.errors.join(' ')); return }
      setDraft(undefined)
      reload()
    } catch { setError('Não foi possível salvar o link. Tente novamente.') }
  }

  async function remove(m: MaterialView) {
    if (!window.confirm(`Excluir o link "${m.title}"?`)) return
    setError('')
    try {
      const r = await deleteMaterial(m.id)
      if (!r.success) { setError(r.errors.join(' ')); return }
      reload()
    } catch { setError('Não foi possível excluir o link. Tente novamente.') }
  }

  return <section aria-labelledby={heading} className="materials-panel">
    <h4 id={heading}>{title}</h4>
    {materials.length > 0 && <ul>
      {materials.map((m) => <li key={m.id}>
        <MaterialLink material={m} />
        {controls && <div className="materials-panel__actions">
          <button type="button" aria-label={`Editar link ${m.title}`} onClick={() => open(m)}>Editar</button>
          <button type="button" aria-label={`Excluir link ${m.title}`} onClick={() => void remove(m)}>Excluir</button>
        </div>}
      </li>)}
    </ul>}
    {materials.length > 0 && <MaterialsHint />}
    {controls && !draft && <button ref={addBtn} type="button" onClick={() => open()}>Adicionar link</button>}
    {controls && draft && <form ref={formRef} className="service-form" aria-label={draft.id ? 'Editar link' : 'Adicionar link'} noValidate onSubmit={(e) => void save(e)}>
      <label>Título do link<input value={draft.title} maxLength={120} onChange={(e) => setDraft({ ...draft, title: e.target.value })} required /></label>
      <label>Endereço (URL)<input type="url" inputMode="url" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} required /></label>
      <label>Observações do link<textarea rows={2} maxLength={500} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>
      <div className="materials-panel__actions"><button type="submit">Salvar link</button><button type="button" onClick={() => setDraft(undefined)}>Cancelar</button></div>
    </form>}
    {error && <p role="alert">{error}</p>}
  </section>
}
