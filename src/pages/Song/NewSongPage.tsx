import { SongForm } from '../../components/song/SongForm'
import './NewSongPage.css'

export function NewSongPage() {
  return (
    <section className="new-song-page">
      <h2>Nova música</h2>
      <p className="new-song-page__subtitle">
        Cadastre sua versão da música: tom, BPM, cifra e observações.
      </p>

      <SongForm />
    </section>
  )
}