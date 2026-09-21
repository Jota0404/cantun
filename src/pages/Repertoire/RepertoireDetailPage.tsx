import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { repertoireRepository } from '../../db/repositories/repertoireRepository'
import { repertoireItemRepository } from '../../db/repositories/repertoireItemRepository'
import { songRepository } from '../../db/repositories/songRepository'
import { addSongToRepertoire } from '../../application/repertoires/repertoireService'
import type { Repertoire } from '../../domain/repertoires/repertoire'
import type { RepertoireItem } from '../../domain/repertoires/repertoireItem'
import type { Song } from '../../domain/songs/song'
import './RepertoirePage.css'

export function RepertoireDetailPage() {
  const { repertoireId = '' } = useParams()
  const navigate = useNavigate()
  const [repertoire, setRepertoire] = useState<Repertoire>()
  const [items, setItems] = useState<RepertoireItem[]>([])
  const [songs, setSongs] = useState<Song[]>([])
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const current = await repertoireRepository.getById(repertoireId)
      if (!current) { setError('Repertório não encontrado.'); return }
      const [entries, allSongs] = await Promise.all([repertoireItemRepository.listByRepertoireId(repertoireId), songRepository.list()])
      setRepertoire(current); setItems(entries); setSongs(allSongs)
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível carregar o repertório.') }
  }, [repertoireId])

  useEffect(() => { void load() }, [load])

  async function addSong() {
    const songId = window.prompt('ID da música')
    if (!songId?.trim()) return
    try { await addSongToRepertoire(repertoireId, songId.trim()); await load() }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível adicionar a música.') }
  }

  if (!repertoire) return <main className="repertoire-page"><p>{error || 'Carregando repertório…'}</p></main>

  return <main className="repertoire-page">
    <header className="repertoire-page__header">
      <div><Link to="/repertoires">← Repertórios</Link><h2>{repertoire.name}</h2><p>{items.length} música(s)</p></div>
      <button type="button" onClick={addSong}>Adicionar música</button>
    </header>
    {error && <p className="repertoire-error" role="alert">{error}</p>}
    <div className="repertoire-list">
      {items.map((item) => <article className="repertoire-card" key={item.id}>
        <div><span className="repertoire-card__position">{item.position + 1}</span><div><h4>{songs.find((song) => song.id === item.songId)?.title ?? item.songId}</h4>{songs.find((song) => song.id === item.songId)?.artist && <p>{songs.find((song) => song.id === item.songId)?.artist}</p>}</div></div>
        <button type="button" onClick={() => navigate(`/songs/${item.songId}`)}>Abrir música</button>
      </article>)}
    </div>
  </main>
}
