import type { ReactNode } from 'react'
import './Badge.css'

export type BadgeTone = 'neutral' | 'success' | 'attention' | 'danger'

// RN-12: estado nunca só por cor. Todo badge tem texto; os de atenção e perigo também têm forma.
const SHAPE: Record<BadgeTone, string> = { neutral: '○', success: '✓', attention: '▲', danger: '✕' }

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className={`badge badge--${tone}`}>
      <span aria-hidden="true" className="badge__shape">{SHAPE[tone]}</span>
      {children}
    </span>
  )
}
