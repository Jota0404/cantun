import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { createSong } from '../../application/songs/createSong'
import type { CreateSongInput } from '../../application/songs/createSong'
import { updateSong } from '../../application/songs/updateSong'
import type { Song } from '../../domain/songs/song'
import { MUSICAL_KEYS } from '../../domain/music/musicalKey'
import type { MusicalKey } from '../../domain/music/musicalKey'
import type { SongValidationField } from '../../domain/songs/validateSong'
import './SongForm.css'

type FieldErrors = Partial<Record<SongValidationField, string>>

interface FormState {
  title: string
  artist: string
  originalKey: MusicalKey | ''
  currentKey: MusicalKey | ''
  bpm: string
  lyrics: string
  notes: string
}

const initialState: FormState = {
  title: '',
  artist: '',
  originalKey: '',
  currentKey: '',
  bpm: '',
  lyrics: '',
  notes: '',
}

type SongFormProps = {
  song?: Song
  onSuccess?: (song: Song) => void
}

function formStateFromSong(song?: Song): FormState {
  if (!song) {
    return initialState
  }

  return {
    title: song.title,
    artist: song.artist ?? '',
    originalKey: song.originalKey,
    currentKey: song.currentKey,
    bpm: song.bpm?.toString() ?? '',
    lyrics: song.lyrics,
    notes: song.notes ?? '',
  }
}

export function SongForm({ song, onSuccess }: SongFormProps) {
  const [form, setForm] = useState<FormState>(() => formStateFromSong(song))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const titleId = useId()
  const artistId = useId()
  const originalKeyId = useId()
  const currentKeyId = useId()
  const bpmId = useId()
  const lyricsId = useId()
  const notesId = useId()

  function updateField<K extends keyof FormState>(
    field: K,
    value: FormState[K],
  ) {
    setForm((prev) => ({ ...prev, [field]: value }))

    setErrors((prev) => {
      if (!prev[field as SongValidationField]) {
        return prev
      }

      const next = { ...prev }
      delete next[field as SongValidationField]
      return next
    })

    setSuccessMessage(null)
    setSubmitError(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSuccessMessage(null)
    setSubmitError(null)
    setSubmitting(true)

    const input: CreateSongInput = {
      title: form.title,
      artist: form.artist.trim() ? form.artist.trim() : undefined,
      originalKey: form.originalKey as MusicalKey,
      currentKey: form.currentKey as MusicalKey,
      bpm: form.bpm.trim() ? Number(form.bpm) : undefined,
      lyrics: form.lyrics,
      notes: form.notes.trim() ? form.notes.trim() : undefined,
    }

    try {
      const result = song
        ? await updateSong({ ...input, id: song.id })
        : await createSong(input)

      if (result.success) {
        setErrors({})
        if (song) {
          setSuccessMessage(`"${result.song.title}" atualizada com sucesso.`)
        } else {
          setForm(initialState)
          setSuccessMessage(`"${result.song.title}" cadastrada com sucesso.`)
        }
        onSuccess?.(result.song)
      } else {
        const nextErrors: FieldErrors = {}

        for (const error of result.errors) {
          nextErrors[error.field] = error.message
        }

        setErrors(nextErrors)
      }
    } catch {
      setSubmitError('Não foi possível salvar a música. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="song-form" onSubmit={handleSubmit} noValidate>
      {successMessage && (
        <p className="song-form__success" role="status">
          {successMessage}
        </p>
      )}
      {submitError && <p role="alert">{submitError}</p>}

      <div className="song-form__field">
        <label htmlFor={titleId}>Título</label>
        <input
          id={titleId}
          type="text"
          value={form.title}
          onChange={(event) => updateField('title', event.target.value)}
          aria-invalid={Boolean(errors.title)}
          aria-describedby={errors.title ? `${titleId}-error` : undefined}
        />
        {errors.title && (
          <span id={`${titleId}-error`} className="song-form__error">
            {errors.title}
          </span>
        )}
      </div>

      <div className="song-form__field">
        <label htmlFor={artistId}>Artista</label>
        <input
          id={artistId}
          type="text"
          value={form.artist}
          onChange={(event) => updateField('artist', event.target.value)}
        />
      </div>

      <div className="song-form__row">
        <div className="song-form__field">
          <label htmlFor={originalKeyId}>Tom original</label>
          <select
            id={originalKeyId}
            value={form.originalKey}
            onChange={(event) =>
              updateField(
                'originalKey',
                event.target.value as MusicalKey | '',
              )
            }
            aria-invalid={Boolean(errors.originalKey)}
            aria-describedby={
              errors.originalKey ? `${originalKeyId}-error` : undefined
            }
          >
            <option value="">Selecione</option>
            {MUSICAL_KEYS.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>

          {errors.originalKey && (
            <span id={`${originalKeyId}-error`} className="song-form__error">
              {errors.originalKey}
            </span>
          )}
        </div>

        <div className="song-form__field">
          <label htmlFor={currentKeyId}>Tom atual</label>
          <select
            id={currentKeyId}
            value={form.currentKey}
            onChange={(event) =>
              updateField(
                'currentKey',
                event.target.value as MusicalKey | '',
              )
            }
            aria-invalid={Boolean(errors.currentKey)}
            aria-describedby={
              errors.currentKey ? `${currentKeyId}-error` : undefined
            }
          >
            <option value="">Selecione</option>
            {MUSICAL_KEYS.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>

          {errors.currentKey && (
            <span id={`${currentKeyId}-error`} className="song-form__error">
              {errors.currentKey}
            </span>
          )}
        </div>
      </div>

      <div className="song-form__field">
        <label htmlFor={bpmId}>BPM</label>
        <input
          id={bpmId}
          type="text"
          inputMode="numeric"
          value={form.bpm}
          onChange={(event) => updateField('bpm', event.target.value)}
          aria-invalid={Boolean(errors.bpm)}
          aria-describedby={errors.bpm ? `${bpmId}-error` : undefined}
        />
        {errors.bpm && (
          <span id={`${bpmId}-error`} className="song-form__error">
            {errors.bpm}
          </span>
        )}
      </div>

      <div className="song-form__field">
        <label htmlFor={lyricsId}>Cifra/letra</label>
        <textarea
          id={lyricsId}
          rows={10}
          value={form.lyrics}
          onChange={(event) => updateField('lyrics', event.target.value)}
          aria-invalid={Boolean(errors.lyrics)}
          aria-describedby={errors.lyrics ? `${lyricsId}-error` : undefined}
        />
        {errors.lyrics && (
          <span id={`${lyricsId}-error`} className="song-form__error">
            {errors.lyrics}
          </span>
        )}
      </div>

      <div className="song-form__field">
        <label htmlFor={notesId}>Observações</label>
        <textarea
          id={notesId}
          rows={3}
          value={form.notes}
          onChange={(event) => updateField('notes', event.target.value)}
        />
      </div>

      <button type="submit" disabled={submitting}>
        {submitting ? 'Salvando…' : song ? 'Salvar alterações' : 'Salvar música'}
      </button>
    </form>
  )
}
