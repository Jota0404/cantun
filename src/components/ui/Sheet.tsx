import { useEffect, useId, useRef, type ReactNode } from 'react'
import './Sheet.css'

type SheetProps = { open: boolean; title: string; onClose: () => void; children: ReactNode }

/** Folha de baixo no celular e diálogo central no desktop, sobre <dialog> nativo (focus trap e Esc do navegador). */
export function Sheet({ open, title, onClose, children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="ui-sheet"
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onClose() }}
    >
      {open && (
        <div className="ui-sheet__body">
          <header className="ui-sheet__header">
            <h2 id={titleId}>{title}</h2>
            <button type="button" onClick={onClose}>Fechar</button>
          </header>
          {children}
        </div>
      )}
    </dialog>
  )
}
