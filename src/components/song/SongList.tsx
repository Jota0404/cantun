import type { Song } from '../../domain/songs/song'
import './SongList.css'

type SongListProps = {
  songs: Song[]
}

export function SongList({ songs }: SongListProps) {
  if (songs.length === 0) {
    return (
      <div className="song-list__empty">
        <p>Nenhuma música cadastrada.</p>
      </div>
    )
  }

  return (
    <div className="song-list">
      {songs.map((song) => (
        <article className="song-list__item" key={song.id}>
          <div className="song-list__content">
            <h3>{song.title}</h3>

            <p>
              Tom: {song.currentKey}
              {song.originalKey !== song.currentKey &&
                ` (original: ${song.originalKey})`}
            </p>

            <p>BPM: {song.bpm}</p>
          </div>

          {song.isFavorite && (
            <span
              className="song-list__favorite"
              aria-label="Música favorita"
            >
              ★
            </span>
          )}
        </article>
      ))}
    </div>
  )
}