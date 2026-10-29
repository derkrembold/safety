import { useCallback, useEffect, useRef, useState } from 'react'
import './FehlerbaumEditor.css'
import { ElementGlyph } from './ElementGlyph'
import {
  clampPosition,
  connectionPath,
  inputAnchor,
  outputAnchor,
  sizeOf,
} from './geometry'
import type { ConnectError, ElementKind, FaultTree, Point } from './model'
import { DRAG_MIME, Sidebar } from './Sidebar'

type StubKind = 'out' | 'in'

type Selection =
  | { type: 'element'; id: string }
  | { type: 'connection'; childId: string; parentId: string }
  | null

interface PendingConnection {
  elementId: string
  stub: StubKind
  pointer: Point
}

const ERROR_TEXT: Record<ConnectError, string> = {
  'unknown-element': 'Das Element existiert nicht mehr.',
  'same-element': 'Ein Element kann nicht mit sich selbst verbunden werden.',
  'no-inputs': 'Ein Standardeingang hat keine Eingänge.',
  'output-taken': 'Dieser Ausgang ist bereits mit einem anderen Element verbunden.',
  'already-connected': 'Diese Verbindung existiert bereits.',
  cycle: 'Die Verbindung würde einen Zyklus erzeugen.',
}

/**
 * Verfolgt eine Mausbewegung über das ganze Fenster. `onEnd` läuft beim
 * Loslassen, `onCancel` bei pointercancel. Die zurückgegebene Funktion beendet
 * das Verfolgen, ohne einen der beiden Callbacks aufzurufen.
 */
function track(
  onMove: (event: PointerEvent) => void,
  onEnd: (event: PointerEvent) => void,
  onCancel: () => void,
): () => void {
  function stop() {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', handleUp)
    window.removeEventListener('pointercancel', handleCancel)
  }
  function handleUp(event: PointerEvent) {
    stop()
    onEnd(event)
  }
  function handleCancel() {
    stop()
    onCancel()
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', handleUp)
  window.addEventListener('pointercancel', handleCancel)
  return stop
}

export function FehlerbaumEditor({ tree }: { tree: FaultTree }) {
  // Der Baum ist ein veränderbares Objekt; nach jeder Änderung neu zeichnen.
  const [, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision((revision) => revision + 1), [])
  const [selection, setSelection] = useState<Selection>(null)
  const [pending, setPending] = useState<PendingConnection | null>(null)
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const addCount = useRef(0)
  const cancelTracking = useRef<(() => void) | null>(null)

  /** Beendet ein laufendes Ziehen (Verschieben oder Verbinden), ohne es abzuschließen. */
  const abortTracking = useCallback(() => {
    cancelTracking.current?.()
    cancelTracking.current = null
    setPending(null)
  }, [])

  function startTracking(
    onMove: (event: PointerEvent) => void,
    onEnd: (event: PointerEvent) => void,
    onCancel: () => void = () => {},
  ) {
    cancelTracking.current?.()
    cancelTracking.current = track(
      onMove,
      (event) => {
        cancelTracking.current = null
        onEnd(event)
      },
      () => {
        cancelTracking.current = null
        onCancel()
      },
    )
  }

  useEffect(() => abortTracking, [abortTracking])

  function canvasBounds() {
    const canvas = canvasRef.current
    return { w: canvas?.clientWidth ?? 0, h: canvas?.clientHeight ?? 0 }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || typeof ResizeObserver === 'undefined') return
    // Bei kleiner werdender Zeichenfläche Elemente zurückholen, die sonst unerreichbar wären.
    const observer = new ResizeObserver(() => {
      const bounds = { w: canvas.clientWidth, h: canvas.clientHeight }
      for (const element of tree.all()) {
        const position = tree.layout.get(element.id)!
        tree.layout.set(element.id, clampPosition(element.kind, position, bounds))
      }
      refresh()
    })
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [tree, refresh])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 4000)
    return () => window.clearTimeout(timer)
  }, [notice])

  function toCanvas(clientX: number, clientY: number): Point {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  function addElement(kind: ElementKind, center?: Point) {
    const { w, h } = sizeOf(kind)
    let position: Point
    if (center) {
      position = { x: Math.max(0, center.x - w / 2), y: Math.max(0, center.y - h / 2) }
    } else {
      const step = addCount.current++ % 8
      position = { x: 40 + step * 28, y: 40 + step * 28 }
    }
    const element = tree.create(kind, clampPosition(kind, position, canvasBounds()))
    setSelection({ type: 'element', id: element.id })
    refresh()
  }

  const deleteSelection = useCallback(() => {
    if (!selection) return
    if (selection.type === 'element') tree.remove(selection.id)
    else tree.disconnect(selection.childId, selection.parentId)
    setSelection(null)
    refresh()
  }, [selection, tree, refresh])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement) return
      if (event.key === 'Delete' || event.key === 'Backspace') {
        deleteSelection()
      } else if (event.key === 'Escape') {
        setSelection(null)
        abortTracking()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [deleteSelection, abortTracking])

  function startMove(event: React.PointerEvent, id: string) {
    if (event.button !== 0) return
    setSelection({ type: 'element', id })
    const origin = tree.layout.get(id)!
    const kind = tree.get(id)!.kind
    const startX = event.clientX
    const startY = event.clientY
    startTracking(
      (move) => {
        tree.layout.set(
          id,
          clampPosition(
            kind,
            { x: origin.x + move.clientX - startX, y: origin.y + move.clientY - startY },
            canvasBounds(),
          ),
        )
        refresh()
      },
      () => {},
    )
  }

  function startConnection(event: React.PointerEvent, elementId: string, stub: StubKind) {
    if (event.button !== 0) return
    event.stopPropagation()
    setSelection(null)
    setPending({ elementId, stub, pointer: toCanvas(event.clientX, event.clientY) })
    startTracking(
      (move) => {
        setPending({ elementId, stub, pointer: toCanvas(move.clientX, move.clientY) })
      },
      (end) => {
        setPending(null)
        const target = document
          .elementFromPoint(end.clientX, end.clientY)
          ?.closest<SVGElement>('[data-stub]')
        if (!target) return
        const targetStub = target.dataset.stub as StubKind
        const targetId = target.dataset.elementId!
        if (targetStub === stub) {
          if (targetId !== elementId) {
            setNotice('Ein Ausgang kann nur mit einem Eingang verbunden werden.')
          }
          return
        }
        const result =
          stub === 'out' ? tree.connect(elementId, targetId) : tree.connect(targetId, elementId)
        if (result.ok) refresh()
        else setNotice(ERROR_TEXT[result.error])
      },
      () => setPending(null),
    )
  }

  function commitRename() {
    if (!editing) return
    const element = tree.get(editing.id)
    const value = editing.value.trim()
    if (element && value) element.label = value
    setEditing(null)
    refresh()
  }

  function handleDrop(event: React.DragEvent) {
    const kind = event.dataTransfer.getData(DRAG_MIME) as ElementKind
    if (!kind) return
    event.preventDefault()
    addElement(kind, toCanvas(event.clientX, event.clientY))
  }

  const elements = tree.all()
  const connections = tree.connections()
  const editedElement = editing ? tree.get(editing.id) : undefined
  const editedPosition = editing ? tree.layout.get(editing.id) : undefined

  return (
    <div className="ft-editor">
      <div className="ft-canvas-column">
        <div
          ref={canvasRef}
          className="ft-canvas"
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes(DRAG_MIME)) event.preventDefault()
          }}
          onDrop={handleDrop}
        >
          <svg className="ft-svg">
            <rect
              className="ft-background"
              width="100%"
              height="100%"
              onPointerDown={() => {
                setSelection(null)
                setEditing(null)
              }}
            />

            {connections.map(({ childId, parentId }) => {
              const child = tree.get(childId)!
              const parent = tree.get(parentId)!
              const path = connectionPath(
                outputAnchor(child.kind, tree.layout.get(childId)!),
                inputAnchor(parent.kind, tree.layout.get(parentId)!),
              )
              const selected =
                selection?.type === 'connection' &&
                selection.childId === childId &&
                selection.parentId === parentId
              return (
                <g
                  key={`${childId}>${parentId}`}
                  onPointerDown={(event) => {
                    event.stopPropagation()
                    setSelection({ type: 'connection', childId, parentId })
                  }}
                >
                  <path className="ft-connection-hit" d={path} />
                  <path className={selected ? 'ft-connection selected' : 'ft-connection'} d={path} />
                </g>
              )
            })}

            {elements.map((element) => {
              const position = tree.layout.get(element.id)!
              const { w, h } = sizeOf(element.kind)
              const selected = selection?.type === 'element' && selection.id === element.id
              const hasParent = tree.parentOf(element.id) !== undefined
              const isOtherThanPending = pending !== null && pending.elementId !== element.id
              return (
                <g
                  key={element.id}
                  className={selected ? 'ft-element selected' : 'ft-element'}
                  transform={`translate(${position.x} ${position.y})`}
                  onPointerDown={(event) => startMove(event, element.id)}
                  onDoubleClick={() => setEditing({ id: element.id, value: element.label })}
                >
                  <ElementGlyph kind={element.kind} />
                  <text className="ft-label" x={w + 10} y={h / 2} dominantBaseline="middle">
                    {element.label}
                  </text>
                  <Stub
                    x={w / 2}
                    y={0}
                    elementId={element.id}
                    stub="out"
                    used={hasParent}
                    candidate={isOtherThanPending && pending.stub === 'in'}
                    onPointerDown={startConnection}
                  />
                  {element.acceptsInputs && (
                    <Stub
                      x={w / 2}
                      y={h}
                      elementId={element.id}
                      stub="in"
                      used={element.nodes.length > 0}
                      candidate={isOtherThanPending && pending.stub === 'out'}
                      onPointerDown={startConnection}
                    />
                  )}
                </g>
              )
            })}

            {pending && <PendingLine tree={tree} pending={pending} />}
          </svg>

          {editing && editedElement && editedPosition && (
            <input
              className="ft-rename"
              autoFocus
              value={editing.value}
              style={{
                left: editedPosition.x + sizeOf(editedElement.kind).w + 6,
                top: editedPosition.y + sizeOf(editedElement.kind).h / 2 - 14,
              }}
              onChange={(event) => setEditing({ id: editing.id, value: event.target.value })}
              onFocus={(event) => event.target.select()}
              onBlur={commitRename}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitRename()
                else if (event.key === 'Escape') setEditing(null)
              }}
            />
          )}

          {elements.length === 0 && (
            <p className="ft-empty">Elemente aus der Seitenleiste in dieses Feld ziehen.</p>
          )}
          {notice && (
            <div className="ft-notice" role="status">
              {notice}
            </div>
          )}
        </div>
        <p className="ft-hints">
          <kbd>Ziehen</kbd> verschieben · <kbd>Stub ziehen</kbd> verbinden ·{' '}
          <kbd>Doppelklick</kbd> umbenennen · <kbd>Entf</kbd> löschen · <kbd>Esc</kbd> abwählen
        </p>
      </div>
      <Sidebar onAdd={(kind) => addElement(kind)} />
    </div>
  )
}

interface StubProps {
  x: number
  y: number
  elementId: string
  stub: StubKind
  used: boolean
  candidate: boolean
  onPointerDown: (event: React.PointerEvent, elementId: string, stub: StubKind) => void
}

function Stub({ x, y, elementId, stub, used, candidate, onPointerDown }: StubProps) {
  const className = ['ft-stub', used ? 'used' : '', candidate ? 'candidate' : '']
    .filter(Boolean)
    .join(' ')
  return (
    <g className={className}>
      <circle
        className="ft-stub-hit"
        cx={x}
        cy={y}
        r={12}
        data-stub={stub}
        data-element-id={elementId}
        onPointerDown={(event) => onPointerDown(event, elementId, stub)}
      />
      <circle className="ft-stub-dot" cx={x} cy={y} r={5} />
    </g>
  )
}

function PendingLine({ tree, pending }: { tree: FaultTree; pending: PendingConnection }) {
  const element = tree.get(pending.elementId)
  const position = tree.layout.get(pending.elementId)
  if (!element || !position) return null
  const anchor =
    pending.stub === 'out'
      ? outputAnchor(element.kind, position)
      : inputAnchor(element.kind, position)
  const path =
    pending.stub === 'out'
      ? connectionPath(anchor, pending.pointer)
      : connectionPath(pending.pointer, anchor)
  return <path className="ft-connection pending" d={path} />
}
