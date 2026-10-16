import { describe, expect, it } from 'vitest'

// Vitest esvazia imports de CSS e o projeto não tem @types/node: lê o arquivo pelo módulo do Node, a partir da raiz.
const nodeFs = 'node:fs'
const { readFileSync } = await import(/* @vite-ignore */ nodeFs)
const css: string = readFileSync('src/styles/tokens.css', 'utf8')

function block(header: string): Record<string, string> {
  const start = css.indexOf(header)
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start))
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((match) => [match[1], match[2]]))
}

function luminance(hex: string) {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

function contrast(a: string, b: string) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

// [primeiro plano, fundo, mínimo]: 4,5 para texto; 3 para bordas de controle e foco.
const PAIRS: Array<[string, string, number]> = [
  ['color-text', 'color-bg', 4.5],
  ['color-text', 'color-surface', 4.5],
  ['color-text', 'color-surface-raised', 4.5],
  ['color-text-muted', 'color-bg', 4.5],
  ['color-text-muted', 'color-surface', 4.5],
  ['color-on-primary', 'color-primary', 4.5],
  ['color-on-primary', 'color-primary-strong', 4.5],
  ['color-primary-strong', 'color-bg', 4.5],
  ['color-primary-strong', 'color-surface', 4.5],
  ['color-danger', 'color-surface', 4.5],
  ['color-danger', 'color-danger-surface', 4.5],
  ['color-warning', 'color-surface', 4.5],
  ['color-success', 'color-surface', 4.5],
  ['color-success', 'color-success-surface', 4.5],
  ['color-info', 'color-surface', 4.5],
  ['color-border-control', 'color-bg', 3],
  ['color-border-control', 'color-surface', 3],
  ['color-focus', 'color-bg', 3],
  ['color-focus', 'color-surface', 3],
]

describe.each([
  ['dark', ":root,\n:root[data-theme='dark']"],
  ['light', ":root[data-theme='light']"],
])('tokens.css contrast (%s)', (_theme, header) => {
  const tokens = block(header)

  it.each(PAIRS)('%s on %s ≥ %s:1', (foreground, background, minimum) => {
    expect(tokens[foreground], foreground).toBeDefined()
    expect(tokens[background], background).toBeDefined()
    expect(contrast(tokens[foreground], tokens[background])).toBeGreaterThanOrEqual(minimum)
  })
})

describe('tokens.css', () => {
  it('defines the touch-target tokens', () => {
    expect(css).toMatch(/--size-touch-min:\s*44px/)
    expect(css).toMatch(/--size-touch-stage:\s*48px/)
  })
})
