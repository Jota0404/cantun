import { useEffect, useState } from 'react'
import { importPersonalRepertoire, listPersonalRepertoires, type PersonalRepertoireSummary } from '../../application/repertoires/repertoireService'
import { labels } from '../../ui/labels'
import { summarySongs } from './summarySongs'

interface Props {
  organizationId: string
  userId: string
  /** Chamado depois de importar, para a tela recarregar os repertórios do Ministério. */
  onImported: () => void | Promise<void>
}

/** Lista os repertórios pessoais do usuário e copia o escolhido para o Ministério (só online). */
export function ImportPersonalRepertoire({ organizationId, userId, onImported }: Props) {
  const [items, setItems] = useState<PersonalRepertoireSummary[]>()
  const [busyId, setBusyId] = useState<string>()
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void listPersonalRepertoires(userId).then((list) => { if (active) setItems(list) })
    return () => { active = false }
  }, [userId])

  async function run(entry: PersonalRepertoireSummary) {
    setError(''); setMessage(''); setBusyId(entry.repertoire.id)
    const result = await importPersonalRepertoire(entry.repertoire.id, organizationId)
    setBusyId(undefined)
    if (!result.success) { setError(result.errors.join(' ')); return }
    setMessage(`"${result.repertoire.name}" foi importado: ${result.copied} música(s) copiada(s), ${result.reused} já estavam no ${labels.organization}.`)
    await onImported()
  }

  return <div>
    <p>{labels.importPersonalHint}</p>
    {error && <p role="alert" className="organization-error">{error}</p>}
    {message && <p role="status">{message}</p>}
    {items && items.length === 0 && <p>{labels.noPersonalToImport}</p>}
    <div className="organization-list">{items?.map((entry) => <article className="organization-item" key={entry.repertoire.id}>
      <div><strong>{entry.repertoire.name}</strong><p>{summarySongs(entry)}</p></div>
      <button type="button" disabled={busyId !== undefined} aria-label={`Importar ${entry.repertoire.name}`} onClick={() => void run(entry)}>{busyId === entry.repertoire.id ? 'Importando…' : 'Importar'}</button>
    </article>)}</div>
  </div>
}
