import type { ServiceStageSong } from '../../application/stage/getServiceStageSongs'

type Props = {
  songs: ServiceStageSong[]
  activeIndex: number
  label: string
  /** Presente só para o MD: torna a ordem navegável. */
  onSelect?: (song: ServiceStageSong) => void
  disabled?: boolean
}

export function ServiceStageOrder({ songs, activeIndex, label, onSelect, disabled }: Props) {
  return (
    <aside className="service-stage-order" aria-label={label}>
      <div className="service-stage-order__header"><strong>{label}</strong><span>{songs.length}</span></div>
      {songs.map((song, index) => {
        const active = index === activeIndex ? 'is-active' : ''
        const body = <><span>{index + 1}</span><strong>{song.title}</strong></>
        if (!onSelect) {
          return <div key={song.songId} className={active} aria-current={active ? 'true' : undefined}>{body}</div>
        }
        return (
          <button key={song.songId} type="button" className={active} onClick={() => onSelect(song)} disabled={disabled}>
            {body}
          </button>
        )
      })}
    </aside>
  )
}
