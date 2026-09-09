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
      if (!repertoireId) { setLoading(false); return }
      const [loadedSetlist, loadedEntries, loadedSongs] = await Promise.all([
        setlistRepository ? getSetlistById(repertoireId, setlistRepository) : getSetlistById(repertoireId),
        setlistSongRepository ? listSetlistSongs(repertoireId, setlistSongRepository) : listSetlistSongs(repertoireId),
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
    return () => { cancelled = true }
  }, [repertoireId, setlistRepository, setlistSongRepository, songRepository])

  const songsById = useMemo(() => new Map(songs.map((song) => [song.id, song])), [songs])
  const includedSongIds = useMemo(() => new Set(entries.map((entry) => entry.songId)), [entries])
  const orderedSongs = entries.map((entry) => ({ entry, song: songsById.get(entry.songId) })).filter((item): item is { entry: SetlistSong; song: Song } => Boolean(item.song))
  const availableSongs = songs.filter((song) => !includedSongIds.has(song.id))

  async function handleAdd(songId: string) {
    if (!repertoireId) return
    setActionError(undefined); setBusySongId(songId)
    try {
      const result = await addSongToSetlist(repertoireId, songId, { setlists: setlistRepository, setlistSongs: setlistSongRepository })
      if (!result.success) { setActionError(result.message); return }
      setEntries((current) => [...current, result.entry])
    } catch { setActionError('Não foi possível adicionar a música. Tente novamente.') }
    finally { setBusySongId(undefined) }
  }

  async function handleRemove(songId: string) {
    if (!repertoireId) return
    setActionError(undefined); setBusySongId(songId)
    try {
      const result = await removeSongFromSetlist(repertoireId, songId, { setlists: setlistRepository, setlistSongs: setlistSongRepository })
      if (!result.success) { setActionError(result.message); return }
      const position = entries.find((item) => item.songId === songId)?.position ?? -1
      setEntries(entries.filter((entry) => entry.songId !== songId).map((entry) => entry.position > position ? { ...entry, position: entry.position - 1 } : entry))
    } catch { setActionError('Não foi possível remover a música. Tente novamente.') }
    finally { setBusySongId(undefined) }
  }

  async function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!repertoireId) return
    setActionError(undefined); setRenaming(true)
    try {
      const result = setlistRepository ? await renameSetlist(repertoireId, name, setlistRepository) : await renameSetlist(repertoireId, name)
      if (!result.success) { setActionError(result.errors[0]?.message ?? result.message ?? 'Não foi possível renomear o repertório.'); return }
      setSetlist(result.setlist); setName(result.setlist.name); setEditingName(false)
    } catch { setActionError('Não foi possível renomear o repertório. Tente novamente.') }
    finally { setRenaming(false) }
  }

  async function handleReorder(fromPosition: number, toPosition: number) {
    if (!repertoireId) return
    setActionError(undefined)
    try {
      const result = await reorderSetlist(repertoireId, fromPosition, toPosition, { setlists: setlistRepository, setlistSongs: setlistSongRepository })
      if (!result.success) { setActionError(result.message); return }
      setEntries(result.entries)
    } catch { setActionError('Não foi possível reordenar as músicas. Tente novamente.') }
  }

  if (loading) return <p>Carregando repertório...</p>
  if (!setlist) return <p>Repertório não encontrado.</p>

  return (
    <main className="repertoire-page">
      <section className="repertoire-card">
        <header className="repertoire-heading">
          <span>REPERTÓRIO</span>
          {editingName ? (
            <form onSubmit={(event) => void handleRename(event)}>
              <input aria-label="Nome do repertório" value={name} onChange={(event) => setName(event.target.value)} disabled={renaming} />
              <button type="submit" disabled={renaming}>Salvar</button>
            </form>
          ) : (
            <>
              <h2>{setlist.name}</h2>
              <button type="button" onClick={() => setEditingName(true)}>Renomear</button>
            </>
          )}
        </header>
        {actionError && <p className="repertoire-error" role="alert">{actionError}</p>}
        <section>
          <h3>Músicas</h3>
          <ul>{orderedSongs.map(({ entry, song }) => <li key={entry.songId}><span>{song.title}</span><button type="button" onClick={() => void handleRemove(song.id)} disabled={busySongId === song.id}>Remover</button></li>)}</ul>
        </section>
        <section>
          <h3>Adicionar</h3>
          <ul>{availableSongs.map((song) => <li key={song.id}><span>{song.title}</span><button type="button" onClick={() => void handleAdd(song.id)} disabled={busySongId === song.id}>Adicionar</button></li>)}</ul>
        </section>
        {orderedSongs.length > 1 && <button type="button" onClick={() => void handleReorder(1, 0)}>Reordenar</button>}
      </section>
    </main>
  )
}
