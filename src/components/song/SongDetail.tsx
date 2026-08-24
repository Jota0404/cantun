import type { Song } from '../../domain/songs/song'
import './SongDetail.css'

type SongDetailProps = {
  song: Song
  onEdit?: () => void
  onDelete?: () => void
  isDeleting?: boolean
}

export function SongDetail({ song, onEdit, onDelete, isDeleting = false }: SongDetailProps) {
  return (
    <article className="song-detail">
      <header className="song-detail__header">
        <div>
          <h2>{song.title}</h2>
          {song.artist && <p className="song-detail__artist">{song.artist}</p>}
        </div>
        {song.isFavorite && (
          <span className="song-detail__favorite" aria-label="Música favorita">★</span>
        )}
      </header>

      <div className="song-detail__metadata">
        <p>Tom atual: {song.currentKey}</p>
        <p>Tom original: {song.originalKey}</p>
        {song.bpm !== undefined && <p>BPM: {song.bpm}</p>}
      </div>

      <section className="song-detail__section" aria-labelledby="song-lyrics">
        <h3 id="song-lyrics">Cifra/letra</h3>
        <pre>{song.lyrics}</pre>
      </section>

      {song.notes && (
        <section className="song-detail__section" aria-labelledby="song-notes">
          <h3 id="song-notes">Observações</h3>
          <p>{song.notes}</p>
        </section>
      )}

      <div className="song-detail__actions">
        {onEdit && (
          <button type="button" className="song-detail__edit" onClick={onEdit}>
            Editar
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            className="song-detail__delete"
            onClick={onDelete}
            disabled={isDeleting}
          >
            {isDeleting ? 'Excluindo...' : 'Excluir'}
          </button>
        )}
      </div>
    </article>
  )
}
