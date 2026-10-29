import { ElementGlyph } from './ElementGlyph'
import { ELEMENT_KINDS, KIND_NAMES, sizeOf } from './geometry'
import type { ElementKind } from './model'

export const DRAG_MIME = 'application/x-safety-element-kind'

interface SidebarProps {
  onAdd: (kind: ElementKind) => void
}

export function Sidebar({ onAdd }: SidebarProps) {
  return (
    <aside className="ft-sidebar" aria-label="Verknüpfungselemente">
      <h3>Elemente</h3>
      {ELEMENT_KINDS.map((kind) => {
        const { w, h } = sizeOf(kind)
        return (
          <div
            key={kind}
            className="ft-sidebar-item"
            draggable
            title="In das Feld ziehen oder doppelklicken"
            onDragStart={(event) => {
              event.dataTransfer.setData(DRAG_MIME, kind)
              event.dataTransfer.effectAllowed = 'copy'
            }}
            onDoubleClick={() => onAdd(kind)}
          >
            <svg viewBox={`-3 -3 ${w + 6} ${h + 6}`} width={44} height={44}>
              <ElementGlyph kind={kind} />
            </svg>
            <span>{KIND_NAMES[kind]}</span>
          </div>
        )
      })}
    </aside>
  )
}
