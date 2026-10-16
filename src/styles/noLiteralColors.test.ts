import { describe, expect, it } from 'vitest'

// Vitest esvazia imports de CSS e o projeto não tem @types/node: lê pelos módulos do Node.
const nodeFs = 'node:fs'
const { readdirSync, readFileSync } = await import(/* @vite-ignore */ nodeFs)

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry: { name: string; isDirectory: () => boolean }) => {
    const path = `${dir}/${entry.name}`
    return entry.isDirectory() ? cssFiles(path) : entry.name.endsWith('.css') ? [path] : []
  })
}

// Fora do teste: os tokens e o Modo Palco (escuro fixo, D6).
const EXEMPT = [
  'src/styles/tokens.css',
  'src/pages/Stage/StagePage.css',
  'src/pages/Stage/ServiceStagePage.css',
  'src/pages/Stage/ServiceStageMusicianPage.css',
  'src/components/stage/BandStagePresencePanel.css',
]
const LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/

describe('CSS fora dos tokens e do Palco', () => {
  it('não usa cor literal (usa var(--color-*) para valer nos dois temas)', () => {
    const offenders = cssFiles('src')
      .filter((file) => !EXEMPT.includes(file))
      .flatMap((file) => (readFileSync(file, 'utf8') as string).split('\n').flatMap((line, index) => LITERAL.test(line) ? [`${file}:${index + 1}`] : []))
    expect(offenders).toEqual([])
  })
})
