import type { Song } from '../../domain/songs/song'
import { getSemitoneDistance, transposeSongLyrics } from '../../domain/music/transpose'
import './SongDetail.css'

type SongDetailProps = {
  song: Song
  onEdit?: () => void
  onDelete?: () => void
  onToggleFavorite?: () => void
  onTranspose?: (semitones: number) => void
  onStage?: () => void
  isDeleting?: boolean
  isUpdatingFavorite?: boolean
  isTransposing?: boolean
}

type ParsedSongLinePart = {
  type: 'text' | 'chord'
  value: string
}

function parseSongLine(line: string): ParsedSongLinePart[] {
  if (!line) return [{ type: 'text', value: '' }]

  const parts: ParsedSongLinePart[] = []
  let cursor = 0
  const chordPattern = /\[([^\]]+)\]/g
  let match = chordPattern.exec(line)

  while (match) {
    if (match.index > cursor) {
      parts.push({ type: 'text', value: line.slice(cursor, match.index) })
    }

    parts.push({ type: 'chord', value: match[1] })
    cursor = match.index + match[0].length
    match = chordPattern.exec(line)
  }

  if (cursor < line.length) {
    parts.push({ type: 'text', value: line.slice(cursor) })
  }

  return parts.length > 0 ? parts : [{ type: 'text', value: line }]
}

function SongLyrics({ lyrics }: { lyrics: string }) {
  return (
    <div className="song-detail__lyrics" aria-label="Cifra e letra">
      {lyrics.split('\n').map((line, index) => (
        <div className="song-detail__lyrics-line" key={`${index}-${line}`}>
          {parseSongLine(line).map((part, partIndex) =>
            part.type === 'chord' ? (
              <span
                className="song-detail__chord"
                key={`${index}-${partIndex}-${part.value}`}
              >
                {part.value}
              </span>
            ) : (
              <span key={`${index}-${partIndex}-${part.value}`}>{part.value}</span>
            ),
          )}
        </div>
      ))}
    </div>
  )
}

export function SongDetail({
  song,
  onEdit,
  onDelete,
  onToggleFavorite,
  onTranspose,
  onStage,
  isDeleting = false,
  isUpdatingFavorite = false,
  isTransposing = false,
}: SongDetailProps) {
  const semitones = getSemitoneDistance(song.originalKey, song.currentKey)
  const displayedLyrics = transposeSongLyrics(song.lyrics, semitones, song.currentKey)

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

      {onTranspose && (
        <div className="song-detail__transpose" aria-label="Transposição">
          <button type="button" onClick={() => onTranspose(-1)} disabled={isTransposing}>
            Tom anterior
          </button>
          <span aria-live="polite">Tom: {song.currentKey}</span>
          <button type="button" onClick={() => onTranspose(1)} disabled={isTransposing}>
            Próximo tom
          </button>
        </div>
      )}

      <section className="song-detail__section" aria-labelledby="song-lyrics">
        <h3 id="song-lyrics">Cifra/letra</h3>
        <SongLyrics lyrics={displayedLyrics} />
      </section>

      {song.notes && (
        <section className="song-detail__section" aria-labelledby="song-notes">
          <h3 id="song-notes">Observações</h3>
          <p>{song.notes}</p>
        </section>
      )}

      <div className="song-detail__actions">
        {onStage && (
          <button type="button" onClick={onStage}>
            Modo Palco
          </button>
        )}
        {onToggleFavorite && (
          <button
            type="button"
            onClick={onToggleFavorite}
            disabled={isUpdatingFavorite}
            aria-pressed={song.isFavorite}
          >
            {isUpdatingFavorite
              ? 'Salvando...'
              : song.isFavorite
                ? 'Remover dos favoritos'
                : 'Adicionar aos favoritos'}
          </button>
        )}
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
