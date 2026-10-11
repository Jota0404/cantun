export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'cantum-theme'

/** RN-07: escuro por padrão; só `light` salvo muda isso. */
export function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Storage indisponível: o tema vale só nesta sessão.
  }
}
