import { useState } from 'react'
import { filterSongs } from '../../domain/songs/filterSongs'
import type { Song } from '../../domain/songs/song'
import { useOnline } from '../schedule/useOnline'
import { labels } from '../../ui/labels'
import './SongPicker.css'

const MAX_RESULTS = 50

interface Props {
  /** Músicas do destino (a biblioteca, ou as do Ministério quando `personalSongs` existe). */
  songs: Song[]
  /** Contexto de Ministério (RN-A3): biblioteca pessoal em uma segunda seção; escolher uma copia para o Ministério. */
  personalSongs?: Song[]
  /** Escolher copia a música para o Ministério (só online): sem rede, avisa já ao abrir. */
  requiresOnline?: boolean
  /** Músicas que já estão no destino: não aparecem para escolher. */
  excludeSongIds?: ReadonlySet<string>
  label?: string
  onPick: (song: Song) => Promise<void>
}

/** Seletor com busca por título e artista (RN-A2): ninguém digita ID. */
export function SongPicker({ songs, personalSongs, requiresOnline, excludeSongIds, label = 'Buscar música', onPick }: Props) {
  const online = useOnline()
  const [query, setQuery] = useState('')
  const [personalOpen, setPersonalOpen] = useState(false)
  const [busyId, setBusyId] = useState<string>()
  const [error, setError] = useState('')

  async function pick(song: Song) {
    setError(''); setBusyId(song.id)
    try { await onPick(song) } catch (cause) { setError(cause instanceof Error && cause.message ? cause.message : 'Não foi possível adicionar a música.') }
    finally { setBusyId(undefined) }
  }

  function renderList(source: Song[], exclude: ReadonlySet<string> | undefined, emptyText: string) {
    const matches = filterSongs(source, query, exclude)
    const visible = matches.slice(0, MAX_RESULTS)
    return (
      <>
        {matches.length === 0
          ? <p>{source.length === 0 ? emptyText : 'Nenhuma música encontrada para esta busca.'}</p>
          : <ul>
              {visible.map((song) => (
                <li key={song.id}>
                  <span><strong>{song.title}</strong>{song.artist && <> · {song.artist}</>}</span>
                  <button type="button" disabled={busyId !== undefined} aria-label={`Adicionar ${song.title}`} onClick={() => void pick(song)}>Adicionar</button>
                </li>
              ))}
            </ul>}
        {matches.length > visible.length && <p>Mostrando {visible.length} de {matches.length}: refine a busca para ver as outras.</p>}
      </>
    )
  }

  const emptyText = 'Você ainda não tem músicas. Cadastre ou importe na tela Músicas.'

  return (
    <section className="song-picker" aria-label="Adicionar música">
      <label>{label}
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Título ou artista" />
      </label>
      {error && <p role="alert" className="song-picker__error">{error}</p>}
      {personalSongs === undefined ? (requiresOnline && !online ? <p role="alert">{labels.offlineCopy}</p> : renderList(songs, excludeSongIds, emptyText)) : <>
        <section aria-labelledby="song-picker-org">
          <h4 id="song-picker-org">{labels.fromOrganization}</h4>
          {renderList(songs, excludeSongIds, 'O Ministério ainda não tem músicas. Adicione da sua biblioteca.')}
        </section>
        <section aria-labelledby="song-picker-personal">
          <h4 id="song-picker-personal">{labels.fromMyLibrary}</h4>
          <button type="button" aria-expanded={personalOpen} onClick={() => setPersonalOpen(!personalOpen)}>{personalOpen ? 'Ocultar minha biblioteca' : 'Mostrar minha biblioteca'}</button>
          {personalOpen && (online
            ? <><p>{labels.copyNotice}</p>{renderList(personalSongs, undefined, emptyText)}</>
            : <p role="alert">{labels.offlineCopy}</p>)}
        </section>
      </>}
    </section>
  )
}
