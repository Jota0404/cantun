import axe from 'axe-core'

// jsdom não calcula cor nem layout: contraste e alvo de toque são verificados no navegador (QA).
const JSDOM_UNSUPPORTED = { 'color-contrast': { enabled: false }, 'target-size': { enabled: false } }

/** Violações de acessibilidade (axe-core, WCAG 2.x A/AA) no elemento, formatadas para o `expect`. */
export async function axeViolations(element: Element): Promise<string[]> {
  const results = await axe.run(element, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    rules: JSDOM_UNSUPPORTED,
  })
  return results.violations.map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.length})`)
}
