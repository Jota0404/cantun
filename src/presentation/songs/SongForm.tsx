import { useState, type FormEvent } from 'react'
import {
  createSong,
  type CreateSongInput,
} from '../../application/songs/createSong'
import type { MusicalKey } from '../../domain/music/musicalKey'
import type { SongValidationError } from '../../domain/songs/validateSong'

type FormState = Omit<CreateSongInput, 'originalKey' | 'currentKey'> & {
  originalKey: MusicalKey | ''
  currentKey: MusicalKey | ''
}

const initialForm: FormState = {
  title: '',
  originalKey: '',
  currentKey: '',
  lyrics: '',
  bpm: undefined,
}

const keys: MusicalKey[] = [
  'C',
  'C#',
  'Db',
  'D',
  'D#',
  'Eb',
  'E',
  'F',
  'F#',
  'Gb',
  'G',
  'G#',
  'Ab',
  'A',
  'A#',
  'Bb',
  'B',
]

export function SongForm() {
  const [form, setForm] = useState<FormState>(initialForm)
  const [errors, setErrors] = useState<SongValidationError[]>([])
  const [success, setSuccess] = useState(false)

  function updateField<K extends keyof FormState>(
    field: K,
    value: FormState[K],
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }))
    setSuccess(false)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setErrors([])
    setSuccess(false)

    const input = {
      ...form,
      originalKey: form.originalKey as MusicalKey,
      currentKey: form.currentKey as MusicalKey,
    }

    const result = await createSong(input)

    if (!result.success) {
      setErrors(result.errors)
      return
    }

    setForm(initialForm)
    setSuccess(true)
  }

  function errorFor(field: SongValidationError['field']) {
    return errors.find((error) => error.field === field)?.message
  }

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label htmlFor="song-title">Título</label>
        <input
          id="song-title"
          value={form.title}
          onChange={(event) => updateField('title', event.target.value)}
        />
        {errorFor('title') && <p>{errorFor('title')}</p>}
      </div>

      <div>
        <label htmlFor="song-original-key">Tom original</label>
        <select
          id="song-original-key"
          value={form.originalKey}
          onChange={(event) =>
            updateField(
              'originalKey',
              event.target.value as MusicalKey | '',
            )
          }
        >
          <option value="">Selecione</option>
          {keys.map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </select>
        {errorFor('originalKey') && <p>{errorFor('originalKey')}</p>}
      </div>

      <div>
        <label htmlFor="song-current-key">Tom atual</label>
        <select
          id="song-current-key"
          value={form.currentKey}
          onChange={(event) =>
            updateField(
              'currentKey',
              event.target.value as MusicalKey | '',
            )
          }
        >
          <option value="">Selecione</option>
          {keys.map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </select>
        {errorFor('currentKey') && <p>{errorFor('currentKey')}</p>}
      </div>

      <div>
        <label htmlFor="song-lyrics">Cifra/letra</label>
        <textarea
          id="song-lyrics"
          value={form.lyrics}
          onChange={(event) => updateField('lyrics', event.target.value)}
        />
        {errorFor('lyrics') && <p>{errorFor('lyrics')}</p>}
      </div>

      <div>
        <label htmlFor="song-bpm">BPM</label>
        <input
          id="song-bpm"
          type="number"
          min={1}
          max={999}
          step={1}
          value={form.bpm ?? ''}
          onChange={(event) => {
            const value = event.target.value

            updateField(
              'bpm',
              value === '' ? undefined : Number(value),
            )
          }}
        />
        {errorFor('bpm') && <p>{errorFor('bpm')}</p>}
      </div>

      <button type="submit">Salvar música</button>

      {success && (
        <p role="status">Música cadastrada com sucesso.</p>
      )}
    </form>
  )
}