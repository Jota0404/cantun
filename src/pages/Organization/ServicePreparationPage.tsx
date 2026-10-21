import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getMemberPreparationView, type MemberPreparationResult } from '../../application/services/memberPreparationView'
import { SERVICE_ITEM_TYPE_LABEL, formatServiceDate } from '../../components/service/serviceLabels'
import './ServicePreparationPage.css'

export function ServicePreparationPage() {
  const { serviceId = '' } = useParams()
  const [loaded, setLoaded] = useState<{ id: string; result?: MemberPreparationResult }>()

  useEffect(() => {
    let active = true
    void (async () => {
      let result: MemberPreparationResult | undefined
      try { result = await getMemberPreparationView(serviceId) } catch { /* mostra erro genérico */ }
      if (active) setLoaded({ id: serviceId, result })
    })()
    return () => { active = false }
  }, [serviceId])

  const back = <Link className="prep__back" to={`/services/${serviceId}`}>Voltar ao serviço</Link>
  if (loaded?.id !== serviceId) return <section className="prep" aria-busy="true">{back}<p role="status">Carregando preparação…</p></section>
  const { result } = loaded
  if (!result) return <section className="prep">{back}<p role="alert">Não foi possível carregar a preparação.</p></section>
  if (!result.success) return <section className="prep">{back}<p role="alert">{result.errors[0]}</p></section>
  const { view } = result

  return (
    <section className="prep">
      {back}
      <h2>{view.serviceName}</h2>
      <p>{formatServiceDate(view.startsAt)}</p>
      <p className="prep__function">{view.myFunction ? `Sua função: ${view.myFunction}` : 'Sem escala neste serviço'}</p>
      <h3 id="prep-order">Ordem do serviço</h3>
      {view.items.length === 0 ? <p>Nenhum item na ordem ainda.</p> : (
        <ol aria-labelledby="prep-order" className="prep__items">
          {view.items.map((item) => (
            <li key={item.id}>
              <strong>{item.type === 'song' && item.songId && item.title !== 'Música indisponível offline'
                ? <Link to={`/songs/${item.songId}`}>{item.title}</Link>
                : item.title || SERVICE_ITEM_TYPE_LABEL[item.type]}</strong>
              {item.type !== 'song' && <span> · {SERVICE_ITEM_TYPE_LABEL[item.type]}</span>}
              {item.refPosition && <span> · volta da posição {item.refPosition}</span>}
              {item.artist && <span> · {item.artist}</span>}
              {item.effectiveKey && <p>Tom: {item.effectiveKey}{item.bpm ? ` · ${item.bpm} BPM` : ''}</p>}
              {!item.effectiveKey && item.bpm ? <p>{item.bpm} BPM</p> : null}
              {item.notes && <p>Observações: {item.notes}</p>}
            </li>
          ))}
        </ol>
      )}
      {view.serviceNotes && <><h3>Observações do serviço</h3><p>{view.serviceNotes}</p></>}
      {view.rehearsals.length > 0 && <h3>Ensaios</h3>}
      {view.materials.length > 0 && <h3>Materiais</h3>}
    </section>
  )
}
