import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import './Tabs.css'

export type TabItem = { value: string; label: string; content: ReactNode }

type TabsProps = { items: TabItem[]; value: string; onChange: (value: string) => void; label: string }

export function Tabs({ items, value, onChange, label }: TabsProps) {
  const baseId = useId()
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const last = items.length - 1
    const target = { ArrowRight: index === last ? 0 : index + 1, ArrowLeft: index === 0 ? last : index - 1, Home: 0, End: last }[event.key]
    if (target === undefined) return
    event.preventDefault()
    refs.current[target]?.focus()
    onChange(items[target].value)
  }

  return (
    <div className="ui-tabs">
      <div role="tablist" aria-label={label} className="ui-tabs__list">
        {items.map((item, index) => {
          const selected = item.value === value
          return (
            <button
              key={item.value}
              ref={(element) => { refs.current[index] = element }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.value}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.value}`}
              tabIndex={selected ? 0 : -1}
              className="ui-tabs__tab"
              onClick={() => onChange(item.value)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              {item.label}
            </button>
          )
        })}
      </div>
      {items.map((item) => (
        <div key={item.value} role="tabpanel" id={`${baseId}-panel-${item.value}`} aria-labelledby={`${baseId}-tab-${item.value}`} hidden={item.value !== value} tabIndex={0}>
          {item.value === value ? item.content : null}
        </div>
      ))}
    </div>
  )
}
