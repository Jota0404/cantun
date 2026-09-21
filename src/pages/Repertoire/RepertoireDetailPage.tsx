import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { repertoireRepository } from '../../db/repositories/repertoireRepository'
import { repertoireItemRepository } from '../../db/repositories/repertoireItemRepository'
import { songRepository } from '../../db/repositories/songRepository'
import { addSongToRepertoire, deleteRepertoire, duplicateRepertoire, removeSongFromRepertoire, renameRepertoire, reorderRepertoire } from '../../application/repertoires/repertoireService'
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

  async function rename() { const name = window.prompt('Novo nome', repertoire?.name); if (!name?.trim()) return; try { await renameRepertoire(repertoireId, name); await load() } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível renomear o repertório.') } }
  async function duplicate() { try { const copy = await duplicateRepertoire(repertoireId); navigate(`/repertoires/${copy.id}`) } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível duplicar o repertório.') } }
  async function remove() { if (!window.confirm('Excluir este repertório?')) return; try { await deleteRepertoire(repertoireId); navigate('/repertoires') } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível excluir o repertório.') } }
  async function removeSong(itemId: string) { try { await removeSongFromRepertoire(repertoireId, itemId); await load() } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível remover a música.') } }
  async function move(itemId: string, direction: -1 | 1) { const index = items.findIndex((item) => item.id === itemId); const target = index + direction; if (index < 0 || target < 0 || target >= items.length) return; const ids = items.map((item) => item.id); [ids[index], ids[target]] = [ids[target], ids[index]]; try { await reorderRepertoire(repertoireId, ids); await load() } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível reordenar o repertório.') } }

  async function addSong() {
    const songId = window.prompt('ID da música')
    if (!songId?.trim()) return
    try { await addSongToRepertoire(repertoireId, songId.trim()); await load() }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível adicionar a música.') }
  }

  if (!repertoire) return <main className="repertoire-page"><p>{error || 'Carregando repertório…'}</p></main>

  return <main className="repertoire-page">
    <header className="repertoire-page__header">
      <div><Link to={`/organizations/${repertoire.organizationId}`}>← Organização</Link><h2>{repertoire.name}</h2><p>{items.length} música(s)</p></div>
      <div><button type="button" onClick={addSong}>Adicionar música</button><button type="button" onClick={rename}>Renomear</button><button type="button" onClick={duplicate}>Duplicar</button><button type="button" onClick={remove}>Excluir</button></div>
    </header>
    {error && <p className="repertoire-error" role="alert">{error}</p>}
    <div className="repertoire-list">
      {items.map((item) => <article className="repertoire-card" key={item.id}>
        <div><span className="repertoire-card__position">{item.position + 1}</span><div><h4>{songs.find((song) => song.id === item.songId)?.title ?? item.songId}</h4>{songs.find((song) => song.id === item.songId)?.artist && <p>{songs.find((song) => song.id === item.songId)?.artist}</p>}</div></div>
        <div><button type="button" onClick={() => void move(item.id, -1)} disabled={item.position === 0}>↑</button><button type="button" onClick={() => void move(item.id, 1)} disabled={item.position === items.length - 1}>↓</button><button type="button" onClick={() => void removeSong(item.id)}>Remover</button><button type="button" onClick={() => navigate(`/songs/${item.songId}`)}>Abrir música</button></div>
      </article>)}
    </div>
  </main>
}
