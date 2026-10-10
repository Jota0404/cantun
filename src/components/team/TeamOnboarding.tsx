import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { createOrganization } from '../../application/organizations/organizationService'
import { createTeam } from '../../application/teams/teamService'
import { buildOrganizationInviteUrl, createOrganizationInvite } from '../../application/organizations/organizationInviteService'
import { setMyTeamMusicalFunctions } from '../../application/teams/musicalFunctionService'
import { MUSICAL_FUNCTIONS } from './musicalFunctions'
import './TeamOnboarding.css'

const STEPS = ['Organização', 'Equipe principal', 'Convidar', 'Suas funções', 'Pronto']

/** Onboarding de quem ainda não tem organização (RN-11: uma organização principal por conta). */
export function TeamOnboarding({ onFinished }: { onFinished?: () => void }) {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [organizationId, setOrganizationId] = useState('')
  const [teamId, setTeamId] = useState('')
  const [value, setValue] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')
  const [functions, setFunctions] = useState<string[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function attempt(action: () => Promise<void>) {
    setError(''); setBusy(true)
    try { await action() } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível concluir este passo.') }
    finally { setBusy(false) }
  }

  const next = () => { setValue(''); setStep((current) => current + 1) }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (step === 0) void attempt(async () => { setOrganizationId((await createOrganization(value.trim())).id); next() })
    if (step === 1) void attempt(async () => { setTeamId((await createTeam(organizationId, value.trim())).id); next() })
    if (step === 2) void attempt(async () => { setInviteUrl(buildOrganizationInviteUrl((await createOrganizationInvite(organizationId, teamId, 'member', value)).token)) })
    if (step === 3) void attempt(async () => { await setMyTeamMusicalFunctions(teamId, functions); next() })
  }

  const finish = () => { onFinished?.(); navigate(`/organizations/${organizationId}/teams/${teamId}`) }

  return (
    <section className="team-onboarding" aria-labelledby="onboarding-title">
      <h2 id="onboarding-title">Vamos preparar sua equipe</h2>
      <ol className="team-onboarding__steps">
        {STEPS.map((label, index) => <li key={label} aria-current={index === step ? 'step' : undefined}>{label}</li>)}
      </ol>
      <p className="team-onboarding__progress">Passo {step + 1} de {STEPS.length}: {STEPS[step]}</p>
      <form className="team-onboarding__form" onSubmit={submit}>
        {step === 0 && <label>Nome da organização<input value={value} onChange={(event) => setValue(event.target.value)} required pattern=".*\S.*" placeholder="Ex.: Igreja Esperança" /></label>}
        {step === 1 && <label>Nome da equipe principal<input value={value} onChange={(event) => setValue(event.target.value)} required pattern=".*\S.*" placeholder="Ex.: Louvor domingo" /></label>}
        {step === 2 && <>
          <label>E-mail da pessoa (opcional)<input type="email" value={value} onChange={(event) => setValue(event.target.value)} /></label>
          {inviteUrl && <label>Link do convite<input readOnly value={inviteUrl} /></label>}
        </>}
        {step === 3 && <fieldset>
          <legend>Que funções você exerce?</legend>
          {MUSICAL_FUNCTIONS.map((item) => (
            <label key={item.value}>
              <input type="checkbox" checked={functions.includes(item.value)} onChange={() => setFunctions((current) => current.includes(item.value) ? current.filter((v) => v !== item.value) : [...current, item.value])} />
              {item.label}
            </label>
          ))}
        </fieldset>}
        {step === 4 && <p role="status">Tudo pronto. Sua equipe já pode ser usada.</p>}
        {error && <p role="alert" className="organization-error">{error}</p>}
        <div className="team-onboarding__actions">
          {step < 4 && <button type="submit" disabled={busy}>{step === 2 ? 'Gerar convite' : 'Continuar'}</button>}
          {(step === 2 || step === 3) && <button type="button" onClick={next}>{step === 2 && inviteUrl ? 'Continuar' : 'Pular'}</button>}
          {step === 4 && <button type="button" onClick={finish}>Abrir equipe</button>}
        </div>
      </form>
    </section>
  )
}
