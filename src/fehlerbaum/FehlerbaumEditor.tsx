import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import './FehlerbaumEditor.css'
import { ElementGlyph } from './ElementGlyph'
import {
  CANVAS_PADDING,
  canvasOrigin,
  canvasPoint,
  canvasSize,
  COMMENT_MIN_HEIGHT,
  commentSize,
  connectionPath,
  inputAnchor,
  outputAnchor,
  sizeOf,
  type CanvasItem,
} from './geometry'
import { Standardeingang, type ConnectError, type ElementKind, type FaultTree, type Point } from './model'
import { appLogger } from '../debug/appLogger'
import { COMMENT_DRAG_VALUE, DRAG_MIME, Sidebar } from './Sidebar'
import { ComponentParameters, ProjectParameterPanel } from './ParameterPanels'
import { getComponent } from '../core/registry'
import type { ComponentDefinition, Project, ProjectParameters } from '../project/types'

type StubKind = 'out' | 'in'

type Selection =
  | { type: 'element'; id: string }
  | { type: 'comment'; id: string }
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

/** Log identities separately from diagram occurrences, including before deletion. */
function logContext(tree: FaultTree, nodeIds: readonly string[]) {
  return {
    nodeIds: [...new Set(nodeIds)],
    componentIds: [...new Set(nodeIds.flatMap((id) => {
      const element = tree.get(id)
      return element instanceof Standardeingang ? [element.componentRef] : []
    }))],
  }
}

interface EditorActionResult {
  /** Overrides the identities passed in, e.g. for a just-created element. */
  nodeIds?: readonly string[]
  /** Action-specific parameters a regression test built from the log would need (issue #30). */
  details?: Record<string, unknown>
}

/** Unlike runAction, success is recorded only after a real, successful mutation. */
function editorAction(
  tree: FaultTree,
  action: string,
  nodeIds: readonly string[],
  operation: () => false | EditorActionResult,
) {
  const context = logContext(tree, nodeIds)
  try {
    const result = operation()
    if (result !== false) {
      const loggedContext = result.nodeIds === undefined ? context : logContext(tree, result.nodeIds)
      appLogger.logAction(action, { ...loggedContext, ...(result.details === undefined ? {} : { details: result.details }) })
    }
  } catch (error) {
    appLogger.logError(action, error, context)
    throw error
  }
}

export function FehlerbaumEditor({ tree, onChange, project, onComponentSave, onParametersSave, results }: {
  tree: FaultTree
  onChange?: (tree: FaultTree) => void
  project?: Project
  onComponentSave?: (component: ComponentDefinition) => void
  onParametersSave?: (parameters: ProjectParameters) => void
  results?: React.ReactNode
}) {
  // Der Baum ist ein veränderbares Objekt; nach jeder Änderung neu zeichnen.
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => {
    setRevision((revision) => revision + 1)
    onChange?.(tree)
  }, [tree, onChange])
  const [selection, setSelection] = useState<Selection>(null)
  const selectedElement = selection?.type === 'element' ? tree.get(selection.id) : undefined
  const selectedComponent = project && selectedElement instanceof Standardeingang
    ? getComponent(project.components, selectedElement.componentRef)
    : undefined
  const [pending, setPending] = useState<PendingConnection | null>(null)
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null)
  const [editingComment, setEditingCommentState] = useState<{ id: string; value: string } | null>(null)
  // Spiegel des Entwurfs: ein blur, das beim Entfernen des Textfelds noch mit der alten
  // Closure feuert, darf weder einen per Esc verworfenen Text übernehmen noch doppelt loggen.
  const editingCommentRef = useRef<{ id: string; value: string } | null>(null)
  const setEditingComment = useCallback((next: { id: string; value: string } | null) => {
    editingCommentRef.current = next
    setEditingCommentState(next)
  }, [])
  const [notice, setNotice] = useState<string | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const drawingRef = useRef<SVGGElement>(null)
  const [viewport, setViewport] = useState({ w: 0, h: 0 })
  const [measuredBounds, setMeasuredBounds] = useState<{ right: number; bottom: number }>()
  /** Im Browser gemessene Kommentarhöhen (umbrochener Text bzw. Bearbeitungsfeld) je Kennung. */
  const [commentHeights, setCommentHeights] = useState<ReadonlyMap<string, number>>(() => new Map())
  const updateOnScroll = useRef<(() => void) | null>(null)
  const addCount = useRef(0)
  const cancelTracking = useRef<(() => void) | null>(null)

  const elements = tree.all()
  const connections = tree.connections()
  const comments = [...tree.comments.values()]
  /** Eine Größe für Rahmen, foreignObject, Bearbeitungsfeld und Flächenausdehnung. */
  function commentBox(id: string, text: string): { w: number; h: number } {
    const estimate = commentSize(text)
    const measured = commentHeights.get(id)
    return measured === undefined ? estimate : { w: estimate.w, h: Math.max(COMMENT_MIN_HEIGHT, measured) }
  }
  const items: CanvasItem[] = [
    ...elements.map((element) => ({
      kind: element.kind,
      label: element.label,
      position: tree.layout.get(element.id)!,
    })),
    // Kommentare zählen für Ursprung und Flächengröße mit, nie für die Logik.
    ...comments.map((comment) => ({
      box: commentBox(comment.id, editingComment?.id === comment.id ? editingComment.value : comment.text),
      position: comment.position,
    })),
  ]
  /** Smallest x/y across all elements; content above/left of (0,0) shifts the drawing. */
  const origin = canvasOrigin(items)
  const originRef = useRef(origin)

  /** Beendet ein laufendes Ziehen (Verschieben oder Verbinden), ohne es abzuschließen. */
  const abortTracking = useCallback(() => {
    cancelTracking.current?.()
    cancelTracking.current = null
    updateOnScroll.current = null
    setPending(null)
  }, [])

  function startTracking(
    initialPointer: PointerEvent,
    onMove: (event: PointerEvent) => void,
    onEnd: (event: PointerEvent) => void,
    onCancel: () => void = () => {},
  ) {
    cancelTracking.current?.()
    let lastPointer = initialPointer
    updateOnScroll.current = () => onMove(lastPointer)
    cancelTracking.current = track(
      (event) => { lastPointer = event; onMove(event) },
      (event) => {
        cancelTracking.current = null
        updateOnScroll.current = null
        onEnd(event)
      },
      () => {
        cancelTracking.current = null
        updateOnScroll.current = null
        onCancel()
      },
    )
  }

  useEffect(() => abortTracking, [abortTracking])

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const measure = () => {
      const next = { w: canvas.clientWidth, h: canvas.clientHeight }
      setViewport((previous) => previous.w === next.w && previous.h === next.h ? previous : next)
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure)
    observer?.observe(canvas)
    window.addEventListener('resize', measure)
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure) }
  }, [])

  // Kommentarhöhe aus dem tatsächlich umbrochenen Text messen (Font, Zeichenbreiten,
  // Zeilenumbrüche), statt sie aus einer Zeichenzahl zu schätzen (Review PR #44).
  // Ohne Layout (jsdom) liefert die Messung 0 und die Schätzung bleibt stehen.
  useLayoutEffect(() => {
    const surface = surfaceRef.current
    if (!surface) return
    const measured = new Map<string, number>()
    for (const text of surface.querySelectorAll<HTMLElement>('.ft-comment-text[data-comment-id]')) {
      if (text.offsetHeight > 0) measured.set(text.dataset.commentId!, text.offsetHeight)
    }
    const editor = surface.querySelector<HTMLTextAreaElement>('.ft-comment-edit[data-comment-id]')
    if (editor) {
      // Auf 0 setzen, damit scrollHeight auch beim Kürzen schrumpft, danach sofort zurück.
      const rendered = editor.style.height
      editor.style.height = '0px'
      const border = editor.offsetHeight - editor.clientHeight
      const content = editor.scrollHeight
      editor.style.height = rendered
      if (content > 0) measured.set(editor.dataset.commentId!, content + border)
    }
    setCommentHeights((previous) => {
      const next = new Map(measured)
      for (const [id, height] of previous) {
        // Der gerade bearbeitete Kommentar wird nicht als Text gerendert; Wert behalten.
        if (!next.has(id) && tree.comments.has(id)) next.set(id, height)
      }
      const same = next.size === previous.size && [...next].every(([id, height]) => previous.get(id) === height)
      return same ? previous : next
    })
  }, [tree, revision, editingComment])

  // SVG's actual text metrics include long labels and the chosen/fallback font.
  useLayoutEffect(() => {
    const drawing = drawingRef.current
    if (!drawing?.getBBox) return
    const box = drawing.getBBox()
    const next = { right: box.x + box.width, bottom: box.y + box.height }
    setMeasuredBounds((previous) => previous?.right === next.right && previous.bottom === next.bottom ? previous : next)
  }, [tree, revision, viewport, editingComment?.value, commentHeights])

  // Content growing above/left shifts the drawing by the same amount the surface grows,
  // so without this the viewport would visibly jump; compensate by scrolling along with it.
  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (canvas) {
      canvas.scrollLeft += originRef.current.x - origin.x
      canvas.scrollTop += originRef.current.y - origin.y
    }
    originRef.current = { x: origin.x, y: origin.y }
  }, [origin.x, origin.y])

  useEffect(() => {
    const redraw = () => setRevision((revision) => revision + 1)
    document.fonts?.addEventListener('loadingdone', redraw)
    return () => document.fonts?.removeEventListener('loadingdone', redraw)
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 4000)
    return () => window.clearTimeout(timer)
  }, [notice])

  function toCanvas(clientX: number, clientY: number): Point {
    const rect = surfaceRef.current!.getBoundingClientRect()
    // originRef, not origin: a drag's pointermove callbacks are registered once at
    // pointerdown and keep running across later renders, so reading the render-scoped
    // `origin` would use a stale value once the drag itself shifts it (Codex review, PR #35).
    return canvasPoint({ x: clientX, y: clientY }, { x: rect.left, y: rect.top }, originRef.current)
  }

  function addElement(kind: ElementKind, center?: Point) {
    const { w, h } = sizeOf(kind)
    let position: Point
    if (center) {
      position = { x: center.x - w / 2, y: center.y - h / 2 }
    } else {
      const step = addCount.current++ % 8
      const canvas = canvasRef.current!
      position = { x: canvas.scrollLeft + origin.x + 40 + step * 28, y: canvas.scrollTop + origin.y + 40 + step * 28 }
    }
    editorAction(tree, 'fault-tree-element-created', [], () => {
      const element = tree.create(kind, position)
      setSelection({ type: 'element', id: element.id })
      refresh()
      return { nodeIds: [element.id], details: { kind: element.kind, position } }
    })
  }

  function addComment(center?: Point) {
    const { w, h } = commentSize('')
    let position: Point
    if (center) {
      position = { x: center.x - w / 2, y: center.y - h / 2 }
    } else {
      const step = addCount.current++ % 8
      const canvas = canvasRef.current!
      position = { x: canvas.scrollLeft + origin.x + 40 + step * 28, y: canvas.scrollTop + origin.y + 40 + step * 28 }
    }
    // Kommentare sind keine Knoten: keine nodeIds im Log, die Kennung steht in den Details.
    editorAction(tree, 'fault-tree-comment-created', [], () => {
      const comment = tree.createComment(position)
      setSelection({ type: 'comment', id: comment.id })
      setEditing(null)
      setEditingComment({ id: comment.id, value: '' })
      refresh()
      return { details: { commentId: comment.id, position } }
    })
  }

  function commitComment() {
    const draft = editingCommentRef.current
    if (!draft) return
    const comment = tree.comments.get(draft.id)
    const value = draft.value
    setEditingComment(null)
    if (!comment || comment.text === value) return
    editorAction(tree, 'fault-tree-comment-edited', [], () => {
      comment.text = value
      refresh()
      return { details: { commentId: comment.id, text: value } }
    })
  }

  function startMoveComment(event: React.PointerEvent, id: string) {
    if (event.button !== 0) return
    setSelection({ type: 'comment', id })
    const startPosition = tree.comments.get(id)!.position
    const start = toCanvas(event.clientX, event.clientY)
    startTracking(
      event.nativeEvent,
      (move) => {
        const comment = tree.comments.get(id)
        if (!comment) return
        const point = toCanvas(move.clientX, move.clientY)
        comment.position = { x: startPosition.x + point.x - start.x, y: startPosition.y + point.y - start.y }
        refresh()
      },
      () => {
        const position = tree.comments.get(id)?.position
        if (position && (position.x !== startPosition.x || position.y !== startPosition.y)) {
          editorAction(tree, 'fault-tree-comment-moved', [], () => ({ details: { commentId: id, position } }))
        }
      },
    )
  }

  const deleteSelection = useCallback(() => {
    if (!selection) return
    if (selection.type === 'comment') {
      editorAction(tree, 'fault-tree-comment-deleted', [], () => {
        if (!tree.comments.has(selection.id)) return false
        tree.removeComment(selection.id)
        setSelection(null)
        refresh()
        return { details: { commentId: selection.id } }
      })
      return
    }
    const ids = selection.type === 'element'
      ? [selection.id, ...tree.connections().filter(({ childId, parentId }) =>
          childId === selection.id || parentId === selection.id,
        ).flatMap(({ childId, parentId }) => [childId, parentId])]
      : [selection.childId, selection.parentId]
    editorAction(tree, selection.type === 'element' ? 'fault-tree-element-deleted' : 'fault-tree-disconnected', ids, () => {
      if (selection.type === 'element') {
        if (!tree.get(selection.id)) return false
        tree.remove(selection.id)
        setSelection(null)
        refresh()
        return {}
      }
      if (tree.parentOf(selection.childId)?.id !== selection.parentId) return false
      tree.disconnect(selection.childId, selection.parentId)
      setSelection(null)
      refresh()
      return { details: { childId: selection.childId, parentId: selection.parentId } }
    })
  }, [selection, tree, refresh])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLElement && (
        event.target.closest('input, textarea, select') || event.target.isContentEditable
      )) return
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
    const startPosition = tree.layout.get(id)!
    const start = toCanvas(event.clientX, event.clientY)
    startTracking(
      event.nativeEvent,
      (move) => {
        editorAction(tree, 'fault-tree-element-moved', [id], () => {
          // No lower bound: dragging past the top/left edge grows the canvas in that
          // direction too, same as the already-unbounded growth to the right/bottom.
          tree.layout.set(id, {
            x: startPosition.x + toCanvas(move.clientX, move.clientY).x - start.x,
            y: startPosition.y + toCanvas(move.clientX, move.clientY).y - start.y,
          })
          refresh()
          return false // Pointer movement is not a completed domain action.
        })
      },
      () => {
        const position = tree.layout.get(id)
        if (tree.get(id) && position && (position.x !== startPosition.x || position.y !== startPosition.y)) {
          editorAction(tree, 'fault-tree-element-moved', [id], () => ({ details: { position } }))
        }
      },
    )
  }

  function startConnection(event: React.PointerEvent, elementId: string, stub: StubKind) {
    if (event.button !== 0) return
    event.stopPropagation()
    setSelection(null)
    setPending({ elementId, stub, pointer: toCanvas(event.clientX, event.clientY) })
    startTracking(
      event.nativeEvent,
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
        editorAction(tree, 'fault-tree-connected', [elementId, targetId], () => {
          const [childId, parentId] = stub === 'out' ? [elementId, targetId] : [targetId, elementId]
          const result = tree.connect(childId, parentId)
          if (!result.ok) {
            setNotice(ERROR_TEXT[result.error])
            return false
          }
          refresh()
          return { details: { childId, parentId } }
        })
      },
      () => setPending(null),
    )
  }

  function commitRename() {
    if (!editing) return
    const element = tree.get(editing.id)
    const value = editing.value.trim()
    setEditing(null)
    if (!element || !value || element.label === value) return
    editorAction(tree, 'fault-tree-element-renamed', [element.id], () => {
      element.label = value
      refresh()
      return { details: { label: value } }
    })
  }

  function handleDrop(event: React.DragEvent) {
    const kind = event.dataTransfer.getData(DRAG_MIME)
    if (!kind) return
    event.preventDefault()
    if (kind === COMMENT_DRAG_VALUE) addComment(toCanvas(event.clientX, event.clientY))
    else addElement(kind as ElementKind, toCanvas(event.clientX, event.clientY))
  }

  const editedElement = editing ? tree.get(editing.id) : undefined
  const editedPosition = editing ? tree.layout.get(editing.id) : undefined

  const surfaceSize = canvasSize(
    items,
    viewport,
    measuredBounds,
    editedElement && editedPosition ? {
      right: editedPosition.x + sizeOf(editedElement.kind).w + 6 + 160,
      bottom: editedPosition.y + sizeOf(editedElement.kind).h / 2 + 20,
    } : undefined,
    origin,
  )

  return (
    <div className={results ? 'ft-editor with-results' : 'ft-editor'}>
      <div className="ft-canvas-column">
        <div className="ft-canvas-frame">
          <div
            ref={canvasRef}
            role="region"
            aria-label="Fehlerbaum-Zeichenfläche"
            tabIndex={0}
            onScroll={() => updateOnScroll.current?.()}
            className="ft-canvas"
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes(DRAG_MIME)) event.preventDefault()
            }}
            onDrop={handleDrop}
          >
            <div ref={surfaceRef} className="ft-surface" style={{ width: surfaceSize.w, height: surfaceSize.h }}>
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

                <g ref={drawingRef} transform={`translate(${CANVAS_PADDING - origin.x} ${CANVAS_PADDING - origin.y})`}>
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
                        tabIndex={0}
                        role="button"
                        aria-label={`Element ${element.label} auswählen`}
                        aria-pressed={selected}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            setSelection({ type: 'element', id: element.id })
                          }
                        }}
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

                  {comments.map((comment) => {
                    const hidden = editingComment?.id === comment.id
                    // Während der Bearbeitung wächst der Rahmen mit dem Entwurf, damit die
                    // gemessenen SVG-Grenzen (und damit die Fläche) dem Textfeld folgen.
                    const { w, h } = commentBox(comment.id, hidden ? editingComment.value : comment.text)
                    const selected = selection?.type === 'comment' && selection.id === comment.id
                    const preview = Array.from(comment.text.replace(/\s+/g, ' ').trim()).slice(0, 40).join('')
                    return (
                      <g
                        key={comment.id}
                        className={selected ? 'ft-comment selected' : 'ft-comment'}
                        tabIndex={0}
                        role="button"
                        aria-label={preview ? `Kommentar „${preview}“ auswählen` : 'Leeren Kommentar auswählen'}
                        aria-pressed={selected}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            setSelection({ type: 'comment', id: comment.id })
                            setEditingComment({ id: comment.id, value: comment.text })
                          } else if (event.key === ' ') {
                            event.preventDefault()
                            setSelection({ type: 'comment', id: comment.id })
                          }
                        }}
                        transform={`translate(${comment.position.x} ${comment.position.y})`}
                        onPointerDown={(event) => startMoveComment(event, comment.id)}
                        onDoubleClick={() => setEditingComment({ id: comment.id, value: comment.text })}
                      >
                        <rect className="ft-comment-box" width={w} height={h} rx={4} />
                        {!hidden && (
                          <foreignObject width={w} height={h}>
                            {/* Als Textknoten gerendert (React maskiert), nie als HTML. */}
                            <div className="ft-comment-text" data-comment-id={comment.id}>
                              {comment.text || 'Leerer Kommentar'}
                            </div>
                          </foreignObject>
                        )}
                      </g>
                    )
                  })}

                </g>
                <g transform={`translate(${CANVAS_PADDING - origin.x} ${CANVAS_PADDING - origin.y})`}>
                  {pending && <PendingLine tree={tree} pending={pending} />}
                </g>
              </svg>

              {editing && editedElement && editedPosition && (
                <input
                  className="ft-rename"
                  aria-label="Elementbeschriftung bearbeiten"
                  autoFocus
                  value={editing.value}
                  style={{
                    left: CANVAS_PADDING - origin.x + editedPosition.x + sizeOf(editedElement.kind).w + 6,
                    top: CANVAS_PADDING - origin.y + editedPosition.y + sizeOf(editedElement.kind).h / 2 - 14,
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

              {editingComment && tree.comments.get(editingComment.id) && (() => {
                const position = tree.comments.get(editingComment.id)!.position
                const { w, h } = commentBox(editingComment.id, editingComment.value)
                return (
                  <textarea
                    className="ft-comment-edit"
                    data-comment-id={editingComment.id}
                    aria-label="Kommentartext bearbeiten"
                    autoFocus
                    value={editingComment.value}
                    style={{
                      left: CANVAS_PADDING - origin.x + position.x,
                      top: CANVAS_PADDING - origin.y + position.y,
                      width: w,
                      height: h,
                    }}
                    onChange={(event) => setEditingComment({ id: editingComment.id, value: event.target.value })}
                    onBlur={commitComment}
                    onKeyDown={(event) => {
                      // Enter fügt eine Zeile ein; Strg+Enter übernimmt, Esc verwirft.
                      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) commitComment()
                      else if (event.key === 'Escape') setEditingComment(null)
                    }}
                  />
                )
              })()}

            </div>
            {elements.length === 0 && comments.length === 0 && (
              <p className="ft-empty">Elemente aus der Seitenleiste in dieses Feld ziehen.</p>
            )}
          </div>
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
        {results}
      </div>
      <div className="ft-side-column">
        <Sidebar onAdd={(kind) => addElement(kind)} onAddComment={() => addComment()} />
        {selectedComponent && selectedElement && onComponentSave && (
          <ComponentParameters key={selectedElement.id} component={selectedComponent}
            occurrenceLabel={selectedElement.label} onSave={onComponentSave} />
        )}
        {project && onParametersSave && (
          <ProjectParameterPanel parameters={project.parameters} onSave={onParametersSave} />
        )}
      </div>
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
