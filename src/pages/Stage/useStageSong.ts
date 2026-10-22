import { useEffect, useMemo, useState } from 'react'
import { getStageSong } from '../../application/stage/getStageSong'
import {
  getSemitoneDistance,
  transposeSongLyrics,
} from '../../domain/music/transpose'
import type { SongRepository } from '../../db/repositories/songRepository'
import type { Song } from '../../domain/songs/song'

export function useStageSong(
  songId: string | undefined,
  repository?: SongRepository,
  onLoaded?: () => void,
) {
  const [song, setSong] = useState<Song | undefined>()
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setError(undefined)
      setLoading(true)

      if (songId) {
        const loaded = await getStageSong(songId, repository)

        if (!cancelled) {
          setSong(loaded)
          onLoaded?.()
          setLoading(false)
        }

        return
      }

      if (!cancelled) {
        setError('Música não informada.')
        setLoading(false)
      }
    }

    void load().catch(() => {
      if (!cancelled) {
        setError('Não foi possível carregar o Modo Palco.')
        setLoading(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [repository, songId, onLoaded])

  const displayedLyrics = useMemo(() => {
    if (!song) return ''

    const semitones = getSemitoneDistance(song.originalKey, song.currentKey)

    return transposeSongLyrics(song.lyrics, semitones, song.currentKey)
  }, [song])

  return { song, error, loading, displayedLyrics }
}
