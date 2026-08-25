import { useState } from 'react'
import type { ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { SongForm } from '../../components/song/SongForm'
import { parseSongText } from '../../domain/songs/parseSongText'
import type { CreateSongInput } from '../../application/songs/createSong'
import './ImportSongPage.css'

export function ImportSongPage() {
  const [songData, setSongData] = useState<CreateSongInput | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const navigate = useNavigate()

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    setSongData(null)
    setFileError(null)

    if (!file) return

    if (!file.name.toLocaleLowerCase().endsWith('.txt')) {
      setFileError('Selecione um arquivo .txt.')
      return
    }

    try {
      const text = await file.text()
      const result = parseSongText(text)

      if (!result.success) {
        setFileError(result.errors.join(' '))
        return
      }

      setSongData(result.data)
    } catch {
      setFileError('Não foi possível ler o arquivo. Tente novamente.')
    }
  }

  return (
    <section className="import-song-page">
      <h2>Importar música</h2>
      <p className="import-song-page__subtitle">
        Selecione um arquivo .txt no formato do CANTUM. Revise os dados antes de salvar.
      </p>

      <div className="import-song-page__file-field">
        <label htmlFor="song-txt-file">Arquivo .txt</label>
        <input
          id="song-txt-file"
          type="file"
          accept=".txt,text/plain"
          onChange={handleFileChange}
        />
      </div>

      {fileError && (
        <p className="import-song-page__error" role="alert">
          {fileError}
        </p>
      )}

      {songData && (
        <div className="import-song-page__preview">
          <h3>Revisão</h3>
          <p>Confira e edite os dados antes de salvar.</p>
          <SongForm initialValues={songData} onSuccess={() => navigate('/songs')} />
        </div>
      )}
    </section>
  )
}
