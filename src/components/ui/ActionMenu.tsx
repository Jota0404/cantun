import { useEffect, useId, useRef, useState } from 'react'
import { Icon } from './Icon'
import './ActionMenu.css'

export type ActionMenuItem = { label: string; onSelect: () => void; danger?: boolean }

type ActionMenuProps = { label: string; items: ActionMenuItem[] }

export function ActionMenu({ label, items }: ActionMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  // Ações de perigo por último, separadas.
  const ordered = [...items.filter((item) => !item.danger), ...items.filter((item) => item.danger)]
  const firstDanger = ordered.findIndex((item) => item.danger)

  const menuItems = () => [...(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]

  useEffect(() => {
    if (!open) return
    menuItems()[0]?.focus()
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const onBlur = (event: React.FocusEvent) => {
    // relatedTarget nulo (ex.: Safari não foca botões ao clicar) fica com o pointerdown fora.
    const next = event.relatedTarget as Node | null
    if (open && next && !rootRef.current?.contains(next)) setOpen(false)
  }

  const close = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); return }
    const list = menuItems()
    const current = list.indexOf(document.activeElement as HTMLElement)
    const move = { ArrowDown: (current + 1) % list.length, ArrowUp: (current - 1 + list.length) % list.length, Home: 0, End: list.length - 1 }[event.key]
    if (move === undefined) return
    event.preventDefault()
    list[move]?.focus()
  }

  return (
    <div className="action-menu" ref={rootRef} onBlur={onBlur}>
      <button
        ref={triggerRef}
        type="button"
        className="action-menu__trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="more" />
      </button>
      {open && (
        <div id={menuId} role="menu" tabIndex={-1} aria-label={label} onKeyDown={onKeyDown} className="action-menu__list">
          {ordered.map((item, index) => (
            <button
              key={`${index}-${item.label}`}
              tabIndex={-1}
              type="button"
              role="menuitem"
              className={`action-menu__item${item.danger ? ' action-menu__item--danger' : ''}${index === firstDanger && index > 0 ? ' action-menu__item--separated' : ''}`}
              onClick={() => { item.onSelect(); close() }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
