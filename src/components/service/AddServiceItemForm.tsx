import { useState, type FormEvent } from 'react'
import { SERVICE_ITEM_TYPES, type ServiceItemType } from '../../domain/services/serviceItem'
import type { Song } from '../../domain/songs/song'
import { labels } from '../../ui/labels'
import { Button } from '../ui/Button'
import { SERVICE_ITEM_TYPE_LABEL } from './serviceLabels'

export interface NewItemInput { type: ServiceItemType; songId?: string; title?: string; notes?: string; durationMinutes?: number }

interface Props {
  organizationSongs: Song[]
  personalSongs: Song[]
  /** Devolve `true` quando o item foi adicionado (o formulário então se fecha). */
  onSubmit: (input: NewItemInput) => Promise<boolean>
}

export function AddServiceItemForm({ organizationSongs, personalSongs, onSubmit }: Props) {
  const [itemType, setItemType] = useState<ServiceItemType>('song')
  const [songId, setSongId] = useState('')
  const [title, setTitle] = useState('')
  const [minutes, setMinutes] = useState('')
  const [notes, setNotes] = useState('')

  function submit(event: FormEvent) {
    event.preventDefault()
    void onSubmit({
      type: itemType,
      songId: itemType === 'song' ? songId || undefined : undefined,
      title: itemType === 'song' ? undefined : title,
      notes: notes || undefined,
      durationMinutes: minutes ? Number(minutes) : undefined,
    })
  }

  return (
    <form className="service-form" onSubmit={submit} aria-label="Adicionar item">
      <label>Tipo
        <select value={itemType} onChange={(event) => setItemType(event.target.value as ServiceItemType)}>
          {SERVICE_ITEM_TYPES.filter((type) => type !== 'reprise' && type !== 'medley').map((type) => <option key={type} value={type}>{SERVICE_ITEM_TYPE_LABEL[type]}</option>)}
        </select>
      </label>
      {itemType === 'song'
        ? <label>Música<select value={songId} onChange={(event) => setSongId(event.target.value)} required>
            <option value="">Escolha a música</option>
            <optgroup label={labels.fromOrganization}>{organizationSongs.map((song) => <option key={song.id} value={song.id}>{song.title}</option>)}</optgroup>
            <optgroup label={`${labels.fromMyLibrary} (será copiada para o Ministério)`}>{personalSongs.filter((song) => !organizationSongs.some((copy) => copy.sourceSongId === song.id)).map((song) => <option key={song.id} value={song.id}>{song.title}</option>)}</optgroup>
          </select></label>
        : <label>Título<input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={120} /></label>}
      <label>Duração em minutos (opcional)<input type="number" min={1} max={600} value={minutes} onChange={(event) => setMinutes(event.target.value)} /></label>
      <label>Observações do item (opcional)<input value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
      <Button type="submit" variant="primary">Adicionar item</Button>
    </form>
  )
}
