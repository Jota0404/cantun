import { useState, type FormEvent } from 'react'
import { Button } from '../ui/Button'

export interface ServiceInfoValues { name: string; startsAt: string; location: string; notes: string }

interface Props { initial: ServiceInfoValues; onSave: (values: ServiceInfoValues) => void; onCancel: () => void }

export function ServiceInfoForm({ initial, onSave, onCancel }: Props) {
  const [info, setInfo] = useState(initial)
  const set = (field: keyof ServiceInfoValues) => (event: { target: { value: string } }) => setInfo({ ...info, [field]: event.target.value })
  return (
    <form className="service-form" onSubmit={(event: FormEvent) => { event.preventDefault(); onSave(info) }}>
      <label>Nome<input value={info.name} onChange={set('name')} required pattern=".*\S.*" /></label>
      <label>Data e hora<input type="datetime-local" value={info.startsAt} onChange={set('startsAt')} required /></label>
      <label>Local<input value={info.location} onChange={set('location')} /></label>
      <label>Observações<textarea rows={3} value={info.notes} onChange={set('notes')} /></label>
      <div className="service-actions"><Button type="submit" variant="primary">Salvar</Button><Button onClick={onCancel}>Cancelar edição</Button></div>
    </form>
  )
}
