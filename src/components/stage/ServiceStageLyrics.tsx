type Props = {
  title: string
  lyrics: string
  notes?: string
  readMode: 'scroll' | 'pages'
  fontSize: number
  fontLabel?: string
  onReadMode: (mode: 'scroll' | 'pages') => void
  onFontSize: (size: number) => void
}

export function ServiceStageLyrics(p: Props) {
  return (
    <section className="service-stage-content" aria-label={`Letra de ${p.title}`}>
      <div className="service-stage-content__toolbar">
        <div>
          <button type="button" aria-pressed={p.readMode === 'scroll'} onClick={() => p.onReadMode('scroll')}>Rolagem</button>
          <button type="button" aria-pressed={p.readMode === 'pages'} onClick={() => p.onReadMode('pages')}>Páginas</button>
        </div>
        <label>
          Tamanho{' '}
          <input
            aria-label={p.fontLabel}
            type="range"
            min="16"
            max="36"
            value={p.fontSize}
            onChange={(event) => p.onFontSize(Number(event.target.value))}
          />
        </label>
      </div>
      <article className={`service-stage-lyrics service-stage-lyrics--${p.readMode}`}>
        {p.lyrics.split('\n').map((line, index) => <div key={`${index}-${line}`}>{line || '\u00a0'}</div>)}
        {p.notes && <aside><strong>Observações</strong><p>{p.notes}</p></aside>}
      </article>
    </section>
  )
}
