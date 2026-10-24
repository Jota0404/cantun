import { useState, type DragEvent, type ReactNode } from 'react'
import { ActionMenu, type ActionMenuItem } from '../ui/ActionMenu'
import { SERVICE_ITEM_TYPE_LABEL } from './serviceLabels'
import type { ServiceItem } from '../../domain/services/serviceItem'
import './ServiceOrderList.css'

interface Props {
  items: ServiceItem[]
  canEdit: boolean
  itemLabel: (item: ServiceItem) => string
  /** Campo de tom (só músicas). */
  renderKey: (item: ServiceItem) => ReactNode
  onMove: (itemId: string, toIndex: number) => void
  onRemove: (item: ServiceItem) => void
  onReprise: (item: ServiceItem) => void
}

/** Ordem do serviço em cartões compactos; as ações de cada item ficam no menu "⋯". */
export function ServiceOrderList({ items, canEdit, itemLabel, renderKey, onMove, onRemove, onReprise }: Props) {
  const [dragged, setDragged] = useState<string>()

  function dropOn(event: DragEvent, toIndex: number) {
    event.preventDefault()
    if (dragged) onMove(dragged, toIndex)
    setDragged(undefined)
  }

  if (items.length === 0) return <p>Nenhum item na ordem.</p>

  return (
    <ol className="service-order">
      {items.map((item, index) => {
        const name = `${itemLabel(item)}${item.refItemId ? ` (posição ${index + 1})` : ''}`
        const menu: ActionMenuItem[] = [
          ...(index > 0 ? [{ label: `Subir ${name}`, onSelect: () => onMove(item.id, index - 1) }] : []),
          ...(index < items.length - 1 ? [{ label: `Descer ${name}`, onSelect: () => onMove(item.id, index + 1) }] : []),
          ...(item.type === 'song' ? [{ label: `Adicionar reprise/medley a ${itemLabel(item)}`, onSelect: () => onReprise(item) }] : []),
          { label: `Remover ${name}`, danger: true, onSelect: () => onRemove(item) },
        ]
        return (
          <li key={item.id} draggable={canEdit} onDragStart={() => setDragged(item.id)} onDragOver={(event) => canEdit && event.preventDefault()} onDrop={(event) => dropOn(event, index)}>
            <div className="service-order__info">
              <strong>{index + 1}. {itemLabel(item)}</strong>
              <span>{item.refItemId ? `volta da posição ${items.findIndex((other) => other.id === item.refItemId) + 1}` : SERVICE_ITEM_TYPE_LABEL[item.type]}{item.durationMinutes && <> · {item.durationMinutes} min</>}</span>
              {item.notes && <span>{item.notes}</span>}
              {item.type === 'song' && renderKey(item)}
            </div>
            {canEdit && <ActionMenu label={`Mais ações de ${name}`} items={menu} />}
          </li>
        )
      })}
    </ol>
  )
}
