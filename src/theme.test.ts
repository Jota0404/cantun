import { beforeEach, describe, expect, it } from 'vitest'
import { applyTheme, getInitialTheme, saveTheme } from './theme'

// O Node recente expõe um `localStorage` próprio que atrapalha o do jsdom: usa um armazenamento em memória.
const data = new Map<string, string>()
const memoryStorage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } }

describe('theme', () => {
  beforeEach(() => {
    data.clear()
    Object.defineProperty(window, 'localStorage', { value: memoryStorage, configurable: true })
    delete document.documentElement.dataset.theme
  })

  it('opens dark when nothing was saved', () => {
    expect(getInitialTheme()).toBe('dark')
  })

  it('respects a saved choice', () => {
    window.localStorage.setItem('cantum-theme', 'light')
    expect(getInitialTheme()).toBe('light')
    window.localStorage.setItem('cantum-theme', 'dark')
    expect(getInitialTheme()).toBe('dark')
  })

  it('ignores unknown saved values', () => {
    window.localStorage.setItem('cantum-theme', 'sepia')
    expect(getInitialTheme()).toBe('dark')
  })

  it('applying does not save: "no saved choice" stays distinguishable', () => {
    applyTheme('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(window.localStorage.getItem('cantum-theme')).toBeNull()
  })

  it('saving applies and persists the user choice', () => {
    saveTheme('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(window.localStorage.getItem('cantum-theme')).toBe('light')
  })
})
