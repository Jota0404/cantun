export type IconName = 'home' | 'services' | 'music' | 'bands' | 'profile' | 'more' | 'back' | 'add' | 'play'

const PATHS: Record<IconName, string> = {
  home: 'M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6',
  services: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  music: 'M9 18V5l11-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zM20 16a3 3 0 11-6 0 3 3 0 016 0z',
  bands: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6M16 4.3a3.5 3.5 0 010 6.4M18 14.3c2 .7 3.5 2.6 3.5 5.7',
  profile: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 3.5-7 8-7s8 3 8 7',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  back: 'M15 5l-7 7 7 7',
  add: 'M12 5v14M5 12h14',
  play: 'M7 4.5v15l12-7.5z',
}

export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  )
}
