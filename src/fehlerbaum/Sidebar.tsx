import { ElementGlyph } from './ElementGlyph'
import { ELEMENT_KINDS, KIND_NAMES, sizeOf } from './geometry'
import type { ElementKind } from './model'

export const DRAG_MIME = 'application/x-safety-element-kind'

/** Drag-Nutzlast für den Kommentarblock; kein ElementKind, da er kein Baumelement ist. */
export const COMMENT_DRAG_VALUE = 'kommentar'

interface SidebarProps {
  onAdd: (kind: ElementKind) => void
  onAddComment: () => void
}

export function Sidebar({ onAdd, onAddComment }: SidebarProps) {
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
      <div
        className="ft-sidebar-item"
        draggable
        title="In das Feld ziehen oder doppelklicken"
        onDragStart={(event) => {
          event.dataTransfer.setData(DRAG_MIME, COMMENT_DRAG_VALUE)
          event.dataTransfer.effectAllowed = 'copy'
        }}
        onDoubleClick={onAddComment}
      >
        <svg viewBox="0 0 44 44" width={44} height={44}>
          <rect className="ft-comment-glyph" x={4} y={8} width={36} height={28} rx={3} />
          <path className="ft-comment-lines" d="M 11 17 H 33 M 11 23 H 33 M 11 29 H 25" />
        </svg>
        <span>Kommentar</span>
      </div>
    </aside>
  )
}
