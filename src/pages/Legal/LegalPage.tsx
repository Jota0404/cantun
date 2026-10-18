import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import privacyPolicy from '../../../docs/privacy/privacy-policy.md?raw'
import terms from '../../../docs/privacy/terms.md?raw'
import { CONSENT_VERSION, type ConsentDocument } from '../../domain/privacy/consent'
import './LegalPage.css'

const TEXTS: Record<ConsentDocument, string> = { privacy: privacyPolicy, terms }

// Markdown mínimo dos arquivos de docs/privacy: "# ", "## ", "- ", "> " e parágrafos.
function render(markdown: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let items: string[] = []
  const flush = () => {
    if (items.length) nodes.push(<ul key={`ul${nodes.length}`}>{items.map((item) => <li key={item}>{item}</li>)}</ul>)
    items = []
  }
  for (const line of markdown.split('\n')) {
    if (line.startsWith('- ')) { items.push(line.slice(2)); continue }
    flush()
    if (line.startsWith('## ')) nodes.push(<h2 key={nodes.length}>{line.slice(3)}</h2>)
    else if (line.startsWith('> ')) nodes.push(<p key={nodes.length} className="legal-page__draft" role="note">{line.slice(2)}</p>)
    else if (line.trim() && !line.startsWith('# ')) nodes.push(<p key={nodes.length}>{line}</p>)
  }
  flush()
  return nodes
}

export function LegalPage({ document }: { document: ConsentDocument }) {
  const text = TEXTS[document]
  const title = /^# (.+)$/m.exec(text)?.[1] ?? ''
  const [year, month, day] = CONSENT_VERSION.split('-')
  return (
    <main className="legal-page">
      <h1>{title}</h1>
      <p className="legal-page__version">Versão {CONSENT_VERSION} · atualizada em {day}/{month}/{year}</p>
      {render(text)}
      <nav aria-label="Documentos legais">
        <Link to={document === 'privacy' ? '/termos' : '/privacidade'}>{document === 'privacy' ? 'Termos de Uso' : 'Política de Privacidade'}</Link>
        {' · '}
        <Link to="/">Voltar ao CANTUM</Link>
      </nav>
    </main>
  )
}
