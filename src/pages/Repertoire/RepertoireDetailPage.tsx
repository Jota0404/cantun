import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { addSongToSetlist } from '../../application/repertoires/addSongToSetlist'
import { getSetlistById } from '../../application/repertoires/getSetlistById'
import { listSetlistSongs } from '../../application/repertoires/listSetlistSongs'
import { removeSongFromSetlist } from '../../application/repertoires/removeSongFromSetlist'
import { renameSetlist } from '../../application/repertoires/renameSetlist'
import { reorderSetlist } from '../../application/repertoires/reorderSetlist'
import { listSongs } from '../../application/songs/listSongs'
import type { Setlist } from '../../domain/repertoires/setlist'
import type { SetlistSong } from '../../domain/repertoires/setlistSong'
import type { Song } from '../../domain/songs/song'
import type { SetlistRepository } from '../../db/repositories/setlistRepository'
import type { SetlistSongRepository } from '../../db/repositories/setlistSongRepository'
import type { SongRepository } from '../../db/repositories/songRepository'
import './RepertoirePage.css'

type RepertoireDetailPageProps = {
  setlistRepository?: SetlistRepository
  setlistSongRepository?: SetlistSongRepository
  songRepository?: SongRepository
}

export function RepertoireDetailPage({
  setlistRepository,
  setlistSongRepository,
  songRepository,
}: RepertoireDetailPageProps) {
  const { repertoireId } = useParams<{ repertoireId: string }>()
  const navigate = useNavigate()
  const [setlist, setSetlist] = useState<Setlist | undefined>()
  const [songs, setSongs] = useState<Song[]>([])
  const [entries, setEntries] = useState<SetlistSong[]>([])
  const [loading, setLoading] = useState(true)
  const [actionError, setActionError] = useState<string | undefined>()
  const [busySongId, setBusySongId] = useState<string | undefined>()
  const [editingName, setEditingName] = useState(false)
  const [name, setName] = useState('')
  const [renaming, setRenaming] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!repertoireId) {
        setLoading(false)
        return
      }

      const [loadedSetlist, loadedEntries, loadedSongs] = await Promise.all([
        setlistRepository ? getSetlistById(repertoireId, setlistRepository) : getSetlistById(repertoireId),
        setlistSongRepository
          ? listSetlistSongs(repertoireId, setlistSongRepository)
          : listSetlistSongs(repertoireId),
        songRepository ? listSongs(songRepository) : listSongs(),
      ])

      if (!cancelled) {
        setSetlist(loadedSetlist)
        setEntries(loadedEntries)
        setSongs(loadedSongs)
        setName(loadedSetlist?.name ?? '')
        setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [repertoireId, setlistRepository, setlistSongRepository, songRepository])

  const songsById = useMemo(
    () => new Map(songs.map((song) => [song.id, song])),
    [songs],
  )

  const includedSongIds = useMemo(
    () => new Set(entries.map((entry) => entry.songId)),
    [entries],
  )

  const orderedSongs = entries
    .map((entry) => ({ entry, song: songsById.get(entry.songId) }))
    .filter((item): item is { entry: SetlistSong; song: Song } => Boolean(item.song))

  const availableSongs = songs.filter((song) => !includedSongIds.has(song.id))

  async function handleAdd(songId: string) {
    if (!repertoireId) return
    setActionError(undefined)
    setBusySongId(songId)

    try {
      const dependencies = { setlists: setlistRepository, setlistSongs: setlistSongRepository }
      const result = await addSongToSetlist(repertoireId, songId, dependencies)
      if (!result.success) {
        setActionError(result.message)
        return
      }
      setEntries((current) => [...current, result.entry])
    } catch {
      setActionError('Não foi possível adicionar a música. Tente novamente.')
    } finally {
      setBusySongId(undefined)
    }
  }

  async function handleRemove(songId: string) {
    if (!repertoireId) return
    setActionError(undefined)
    setBusySongId(songId)

    try {
      const dependencies = { setlists: setlistRepository, setlistSongs: setlistSongRepository }
      const result = await removeSongFromSetlist(repertoireId, songId, dependencies)
      if (!result.success) {
        setActionError(result.message)
        return
      }
      const next = entries
        .filter((entry) => entry.songId !== songId)
        .map((entry) => (entry.position > (entries.find((item) => item.songId === songId)?.position ?? -1)
          ? { ...entry, position: entry.position - 1 }
          : entry))
      setEntries(next)
    } catch {
      setActionError('Não foi possível remover a música. Tente novamente.')
    } finally {
      setBusySongId(undefined)
    }
  }

  async function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!repertoireId) return

    setActionError(undefined)
    setRenaming(true)

    try {
      const result = setlistRepository
        ? await renameSetlist(repertoireId, name, setlistRepository)
        : await renameSetlist(repertoireId, name)

      if (!result.success) {
        setActionError(result.errors[0]?.message ?? result.message ?? 'Não foi possível renomear o repertório.')
        return
      }

      setSetlist(result.setlist)
      setName(result.setlist.name)
      setEditingName(false)
    } catch {
      setActionError('Não foi possível renomear o repertório. Tente novamente.')
    } finally {
      setRenaming(false)
    }
  }

  async function handleReorder(fromPosition: number, toPosition: number) {
    if (!repertoireId) return
    setActionError(undefined)

    try {
      const dependencies = { setlists: setlistRepository, setlistSongs: setlistSongRepository }
      const result = await reorderSetlist(repertoireId, fromPosition, toPosition, dependencies)
      if (!result.success) {
        setActionError(result.message)
        return
      }
      setEntries(result.entries)
    } catch {
      setActionError('Não foi possível reordenar as músicas. Tente novamente.')
    }
  }

  if (loading) {
    return <p>Carregando repertório...</p>
  }

  if (!setlist) {
    return (
      <section className="repertoire-page">
        <h2>Repertório não encontrado.</h2>
        <button type="button" onClick={() => navigate('/repertoires')}>
          Voltar aos repertórios
        </button>
      </section>
    )
  }

  return (
    <section className="repertoire-page">
      <header className="repertoire-page__header">
        <div>
          <button type="button" onClick={() => navigate('/repertoires')}>
            ← Repertórios
          </button>
          {editingName ? (
            <form className="repertoire-rename" onSubmit={handleRename}>
              <label htmlFor="repertoire-edit-name">Nome do repertório</label>
              <div className="repertoire-create__row">
                <input
                  id="repertoire-edit-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={120}
                  autoFocus
                />
                <button type="submit" disabled={renaming}>
                  {renaming ? 'Salvando...' : 'Salvar'}
                </button>
                <button type="button" disabled={renaming} onClick={() => {
                  setName(setlist.name)
                  setEditingName(false)
                }}>
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <div className="repertoire-title-row">
              <h2>{setlist.name}</h2>
              <button type="button" onClick={() => setEditingName(true)}>
                Renomear
              </button>
            </div>
          )}
          <p>{orderedSongs.length} música{orderedSongs.length === 1 ? '' : 's'}</p>
        </div>
        <button
          type="button"
          disabled={orderedSongs.length === 0}
          onClick={() => navigate(`/stage/setlist/${setlist.id}`)}
        >
          Iniciar Modo Palco
        </button>
      </header>

      {actionError && <p className="repertoire-error" role="alert">{actionError}</p>}

      <section className="repertoire-section" aria-labelledby="repertoire-songs-title">
        <h3 id="repertoire-songs-title">Músicas do repertório</h3>
        {orderedSongs.length === 0 ? (
          <div className="repertoire-empty">
            <p>Nenhuma música adicionada ainda.</p>
          </div>
        ) : (
          <div className="repertoire-list">
            {orderedSongs.map(({ entry, song }, index) => (
              <article className="repertoire-card" key={entry.id}>
                <div>
                  <span className="repertoire-card__position">{index + 1}</span>
                  <div>
                    <h4>{song.title}</h4>
                    {song.artist && <p>{song.artist}</p>}
                    <p>Tom: {song.currentKey}</p>
                  </div>
                </div>
                <div className="repertoire-card__actions">
                  <button
                    type="button"
                    disabled={index === 0 || busySongId === song.id}
                    onClick={() => void handleReorder(index, index - 1)}
                  >
                    ↑ Subir
                  </button>
                  <button
                    type="button"
                    disabled={index === orderedSongs.length - 1 || busySongId === song.id}
                    onClick={() => void handleReorder(index, index + 1)}
                  >
                    ↓ Descer
                  </button>
                  <button type="button" onClick={() => navigate(`/stage/song/${song.id}`)}>
                    Modo Palco
                  </button>
                  <button type="button" onClick={() => navigate(`/songs/${song.id}`)}>
                    Abrir música
                  </button>
                  <button
                    type="button"
                    disabled={busySongId === song.id}
                    onClick={() => void handleRemove(song.id)}
                  >
                    {busySongId === song.id ? 'Removendo...' : 'Remover'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="repertoire-section" aria-labelledby="available-songs-title">
        <h3 id="available-songs-title">Adicionar músicas</h3>
        {availableSongs.length === 0 ? (
          <p>Todas as músicas da biblioteca já estão neste repertório.</p>
        ) : (
          <div className="repertoire-list">
            {availableSongs.map((song) => (
              <article className="repertoire-card" key={song.id}>
                <div>
                  <h4>{song.title}</h4>
                  {song.artist && <p>{song.artist}</p>}
                </div>
                <button
                  type="button"
                  disabled={busySongId === song.id}
                  onClick={() => void handleAdd(song.id)}
                >
                  {busySongId === song.id ? 'Adicionando...' : 'Adicionar'}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  )
}
