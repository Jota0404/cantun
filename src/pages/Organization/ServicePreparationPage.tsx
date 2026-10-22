import { useEffect, useState } from 'react'
import { onRemoteDataApplied } from '../../application/sync/remoteData'
import { Link, useParams } from 'react-router-dom'
import { getMemberPreparationView, type MemberPreparationResult } from '../../application/services/memberPreparationView'
import { MaterialLink, MaterialsHint } from '../../components/service/MaterialsPanel'
import { SERVICE_ITEM_TYPE_LABEL, formatServiceDate } from '../../components/service/serviceLabels'
import { getPreparationSummary, setPreparation, type PreparationSummary } from '../../application/services/servicePreparationService'
import { musicalFunctionLabel } from '../../components/team/musicalFunctions'
import './ServicePreparationPage.css'

export function ServicePreparationPage() {
  const { serviceId = '' } = useParams()
  const [loaded, setLoaded] = useState<{ id: string; result?: MemberPreparationResult; summary?: PreparationSummary }>()
  const [prepared, setPrepared] = useState<boolean>()
  const [prepError, setPrepError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    const load = async () => {
      let result: MemberPreparationResult | undefined
      let summary: PreparationSummary | undefined
      try { result = await getMemberPreparationView(serviceId) } catch { /* mostra erro genérico */ }
      try {
        const s = await getPreparationSummary(serviceId)
        if (s.success && s.summary.canSeeTeam) summary = s.summary
      } catch { /* resumo é opcional */ }
      if (active) { setLoaded({ id: serviceId, result, summary }); setPrepared(result?.success ? result.view.prepared : undefined) }
    }
    void load()
    const off = onRemoteDataApplied(() => { void load() })
    return () => { active = false; off() }
  }, [serviceId])

  const back = <Link className="prep__back" to={`/services/${serviceId}`}>Voltar ao serviço</Link>
  if (loaded?.id !== serviceId) return <section className="prep" aria-busy="true">{back}<p role="status">Carregando preparação…</p></section>
  const { result } = loaded
  if (!result) return <section className="prep">{back}<p role="alert">Não foi possível carregar a preparação.</p></section>
  if (!result.success) return <section className="prep">{back}<p role="alert">{result.errors[0]}</p></section>
  const { view } = result
  const isPrepared = prepared ?? view.prepared
  const toggle = async () => {
    setBusy(true)
    setPrepError('')
    try {
      const r = await setPreparation(serviceId, !isPrepared)
      if (!r.success) { setPrepError(r.errors[0]); return }
      setPrepared(!isPrepared)
      const s = await getPreparationSummary(serviceId)
      if (s.success && s.summary.canSeeTeam) setLoaded({ ...loaded, summary: s.summary })
    } catch { setPrepError('Não foi possível salvar. Tente novamente.') } finally { setBusy(false) }
  }
  const team = loaded.summary

  return (
    <section className="prep">
      {back}
      <h2>{view.serviceName}</h2>
      <p>{formatServiceDate(view.startsAt)}</p>
      <p className="prep__function">{view.myFunction ? `Sua função: ${musicalFunctionLabel(view.myFunction)}` : 'Sem escala neste serviço'}</p>
      <button type="button" className="prep__done" aria-pressed={isPrepared} aria-describedby={view.canPrepare ? undefined : "prep-unavailable"} disabled={busy || !view.canPrepare} onClick={() => void toggle()}><span aria-hidden="true">{isPrepared ? '✓ ' : ''}</span>Preparado</button>
      {!view.canPrepare && <p id="prep-unavailable" role="note">Preparação indisponível: serviço encerrado ou você não está na equipe.</p>}
      <p className="prep__status">{isPrepared ? 'Você já marcou como preparado' : 'Ainda não marcado'}</p>
      {prepError && <p role="alert">{prepError}</p>}
      {team && (
        <section aria-labelledby="prep-team">
          <h3 id="prep-team">Preparação da equipe</h3>
          <p>{team.preparedCount} de {team.totalCount} preparados</p>
          <ul className="prep__team">
            {team.people.map((p) => <li key={p.userId}>{p.name} · {p.prepared ? 'preparado' : 'ainda não'}</li>)}
          </ul>
        </section>
      )}
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
      {view.rehearsals.length > 0 && <section aria-labelledby="prep-rehearsals">
        <h3 id="prep-rehearsals">Ensaio</h3>
        <ul className="prep__team">
          {view.rehearsals.map((r) => <li key={r.id}>
            <strong>{formatServiceDate(r.startsAt)}</strong>{r.location && <span> · {r.location}</span>}
            {r.notes && <p>{r.notes}</p>}
            {r.songs.length > 0 && <p>Músicas em foco: {r.songs.map((s) => s.title).join(', ')}</p>}
          </li>)}
        </ul>
      </section>}
      {view.materials.length > 0 && <section aria-labelledby="prep-materials" className="materials-panel">
        <h3 id="prep-materials">Materiais</h3>
        <ul>{view.materials.map((m) => <li key={m.id}><MaterialLink material={m} /></li>)}</ul>
        <MaterialsHint />
      </section>}
    </section>
  )
}
