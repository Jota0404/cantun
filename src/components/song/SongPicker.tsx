import { useState } from 'react'
import { filterSongs } from '../../domain/songs/filterSongs'
import type { Song } from '../../domain/songs/song'
import './SongPicker.css'

const MAX_RESULTS = 50

interface Props {
  songs: Song[]
  /** Músicas que já estão no destino: não aparecem para escolher. */
  excludeSongIds?: ReadonlySet<string>
  label?: string
  onPick: (song: Song) => Promise<void>
}

/** Seletor com busca por título e artista (RN-A2): ninguém digita ID. */
export function SongPicker({ songs, excludeSongIds, label = 'Buscar música', onPick }: Props) {
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState<string>()
  const [error, setError] = useState('')

  const matches = filterSongs(songs, query, excludeSongIds)
  const visible = matches.slice(0, MAX_RESULTS)

  async function pick(song: Song) {
    setError(''); setBusyId(song.id)
    try { await onPick(song) } catch (cause) { setError(cause instanceof Error && cause.message ? cause.message : 'Não foi possível adicionar a música.') }
    finally { setBusyId(undefined) }
  }

  return (
    <section className="song-picker" aria-label="Adicionar música">
      <label>{label}
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Título ou artista" />
      </label>
      {error && <p role="alert" className="song-picker__error">{error}</p>}
      {matches.length === 0
        ? <p>{songs.length === 0 ? 'Você ainda não tem músicas. Cadastre ou importe na tela Músicas.' : 'Nenhuma música encontrada para esta busca.'}</p>
        : <ul>
            {visible.map((song) => (
              <li key={song.id}>
                <span><strong>{song.title}</strong>{song.artist && <> · {song.artist}</>}</span>
                <button type="button" disabled={busyId !== undefined} aria-label={`Adicionar ${song.title}`} onClick={() => void pick(song)}>Adicionar</button>
              </li>
            ))}
          </ul>}
      {matches.length > visible.length && <p>Mostrando {visible.length} de {matches.length}: refine a busca para ver as outras.</p>}
    </section>
  )
}
