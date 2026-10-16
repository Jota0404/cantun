import { useEffect, useRef, useState, type FormEvent } from 'react'
import './InlineNameForm.css'

interface Props {
  label: string
  submitLabel: string
  initialValue?: string
  placeholder?: string
  maxLength?: number
  onSubmit: (name: string) => Promise<void>
  onCancel: () => void
}

/** Formulário de um nome (criar ou renomear), no lugar do `window.prompt` (RN-A1): rótulo, validação e erro em texto. */
export function InlineNameForm({ label, submitLabel, initialValue = '', placeholder, maxLength = 120, onSubmit, onCancel }: Props) {
  const [value, setValue] = useState(initialValue)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => { input.current?.focus() }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    const name = value.trim()
    if (!name) { setError(`Informe o ${label.toLowerCase()}.`); return }
    setError(''); setBusy(true)
    try {
      await onSubmit(name)
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : 'Não foi possível salvar. Tente de novo.')
      setBusy(false)
    }
  }

  return (
    <form className="inline-name-form" onSubmit={(event) => void submit(event)} aria-label={submitLabel}>
      <label>{label}
        <input ref={input} value={value} onChange={(event) => setValue(event.target.value)} maxLength={maxLength} placeholder={placeholder} aria-invalid={error ? true : undefined} />
      </label>
      <button type="submit" disabled={busy}>{busy ? 'Salvando…' : submitLabel}</button>
      <button type="button" onClick={onCancel} disabled={busy}>Cancelar</button>
      {error && <p role="alert" className="inline-name-form__error">{error}</p>}
    </form>
  )
}
