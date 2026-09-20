import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { repertoireRepository, repertoireItemRepository } from '../../db/repositories/repertoireRepository'
import { songRepository } from '../../db/repositories/songRepository'
import { addSongToRepertoire } from '../../application/repertoires/repertoireService'
import type { Repertoire } from '../../domain/repertoires/repertoire'
import type { RepertoireItem } from '../../domain/repertoires/repertoireItem'
import type { Song } from '../../domain/songs/song'
import './OrganizationPage.css'

export function TargetRepertoireDetailPage() {
  const { repertoireId = '' } = useParams()
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

  if (!repertoire) return <main className="organization-page"><p>{error || 'Carregando repertório…'}</p></main>

  return <main className="organization-page"><section className="organization-card">
    <header><Link to={`/organizations/${repertoire.organizationId}`}>← Organização</Link><span>REPERTÓRIO</span><h2>{repertoire.name}</h2><p>{items.length} música(s)</p></header>
    {error && <p role="alert" className="organization-error">{error}</p>}
    <button type="button" onClick={() => void addSong()}>Adicionar música</button>
    <div className="organization-list">{items.map((item) => <article className="organization-item" key={item.id}><strong>{item.position + 1}. {songs.find((song) => song.id === item.songId)?.title ?? item.songId}</strong></article>)}</div>
  </section></main>
}
