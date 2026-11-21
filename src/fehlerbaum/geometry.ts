import type { ElementKind, Point } from './model'

export const ELEMENT_KINDS: ElementKind[] = ['standardeingang', 'oder', 'und', 'sonde']

export const KIND_NAMES: Record<ElementKind, string> = {
  standardeingang: 'Standardeingang',
  oder: 'ODER-Verknüpfung',
  und: 'UND-Verknüpfung',
  sonde: 'Sonde (Zwischenwert)',
}

export const GATE_SIZE = { w: 72, h: 64 }
export const EVENT_SIZE = { w: 56, h: 56 }
export const PROBE_SIZE = { w: 64, h: 40 }

export function sizeOf(kind: ElementKind): { w: number; h: number } {
  return kind === 'standardeingang' ? EVENT_SIZE : kind === 'sonde' ? PROBE_SIZE : GATE_SIZE
}

/** Ausgang: oben in der Mitte, führt zum übergeordneten Element. */
export function outputAnchor(kind: ElementKind, position: Point): Point {
  return { x: position.x + sizeOf(kind).w / 2, y: position.y }
}

/** Eingang (nur Verknüpfungen): unten in der Mitte. */
export function inputAnchor(kind: ElementKind, position: Point): Point {
  const { w, h } = sizeOf(kind)
  return { x: position.x + w / 2, y: position.y + h }
}

/** Kurve von einem Ausgang (Kind) zu einem Eingang (Eltern). */
export function connectionPath(from: Point, to: Point): string {
  const midY = (from.y + to.y) / 2
  return `M ${from.x} ${from.y} C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${to.y}`
}

/** Space around the model origin and the right/bottom content bounds, including stubs. */
export const CANVAS_PADDING = 24

export const COMMENT_WIDTH = 180
export const COMMENT_MIN_HEIGHT = 56
const COMMENT_LINE_HEIGHT = 18
const COMMENT_CHARS_PER_LINE = 24

/**
 * Nur eine *Schätzung* der Kommentarhöhe: Startwert vor der ersten Messung und Fallback
 * ohne Browser-Layout (jsdom). Im Browser misst der Editor die tatsächlich umbrochene
 * Texthöhe und verwendet diese (Review PR #44) — eine pauschale Zeichenzahl pro Zeile
 * passt zu keinem Font zuverlässig.
 */
export function commentSize(text: string): { w: number; h: number } {
  const lines = text.split('\n').reduce(
    (sum, line) => sum + Math.max(1, Math.ceil(Array.from(line).length / COMMENT_CHARS_PER_LINE)), 0)
  return { w: COMMENT_WIDTH, h: Math.max(COMMENT_MIN_HEIGHT, lines * COMMENT_LINE_HEIGHT + 20) }
}

export interface CanvasSize { w: number; h: number }
export type CanvasItem =
  | { kind: ElementKind; label: string; position: Point }
  | { box: { w: number; h: number }; position: Point }

/**
 * The scroll offset is already included in the moving surface's client rectangle.
 * `origin` is the current top/left-most model coordinate (see `canvasOrigin`) — content
 * above/left of the model's (0,0) shifts the drawing, so client points must follow it too.
 */
export function canvasPoint(client: Point, surfaceOrigin: Point, origin: Point = { x: 0, y: 0 }): Point {
  return {
    x: client.x - surfaceOrigin.x - CANVAS_PADDING + origin.x,
    y: client.y - surfaceOrigin.y - CANVAS_PADDING + origin.y,
  }
}

/** The smallest x/y across all items; (0,0) unless something sits above/left of the model origin. */
export function canvasOrigin(items: readonly { position: Point }[]): Point {
  let x = 0
  let y = 0
  for (const { position } of items) {
    x = Math.min(x, position.x)
    y = Math.min(y, position.y)
  }
  return { x, y }
}

/**
 * Use real SVG bounds when available; the fallback also works without browser layout.
 *
 * `right`/`bottom` start at 0 — the mirror image of `canvasOrigin` starting at 0 — so a
 * lone element dragged far above/left still visibly needs more space: without this floor,
 * the same lone element would define both ends, and its own excursion would cancel out of
 * `right - origin.x` instead of growing it (found live: a single freshly placed element
 * didn't grow the canvas when dragged past the edge, while a second element fixed it).
 */
export function canvasSize(
  items: readonly CanvasItem[],
  viewport: CanvasSize,
  measured?: { right: number; bottom: number },
  rename?: { right: number; bottom: number },
  origin: Point = { x: 0, y: 0 },
  // The actual width/height a scrollbar takes up on the current system (0/0 for none seen
  // yet, or an overlay-scrollbar system). `viewport` itself is the *scrollbar-independent*
  // outer box (see FehlerbaumEditor.tsx's `measure()`, Issue #48) precisely so it cannot
  // oscillate; this is the one place that still needs to know actual scrollbar space, to
  // reserve it on the OTHER axis only when one axis actually scrolls — otherwise the floor
  // below would hand out the full, scrollbar-free `viewport` on both axes even while a real
  // scrollbar on one axis is already eating into the other (Codex review, PR #49: a single
  // element far to one side forced an unneeded scrollbar on the orthogonal axis too).
  scrollbarSize: CanvasSize = { w: 0, h: 0 },
): CanvasSize {
  let right = 0
  let bottom = 0
  for (const item of items) {
    const { position } = item
    if ('box' in item) {
      right = Math.max(right, position.x + item.box.w)
      bottom = Math.max(bottom, position.y + item.box.h)
      continue
    }
    const { w, h } = sizeOf(item.kind)
    right = Math.max(right, position.x + w + 10 + Array.from(item.label).length * 14)
    bottom = Math.max(bottom, position.y + h)
  }
  if (measured) {
    right = measured.right
    bottom = measured.bottom
  }
  // Explicit 0 floor: `rename`, when active, overrides the `?? 0` fallback with its own
  // (possibly negative) bound, and `measured` can likewise replace right/bottom with a real,
  // negative SVG extent — either alone still floors at 0 via the other term, but together
  // neither term does, and the anchor this mirrors from canvasOrigin would silently vanish
  // (Codex review, PR #36).
  const contentW = Math.max(0, right, rename?.right ?? 0) - origin.x + 2 * CANVAS_PADDING
  const contentH = Math.max(0, bottom, rename?.bottom ?? 0) - origin.y + 2 * CANVAS_PADDING
  const scrollsVertically = contentH > viewport.h
  const scrollsHorizontally = contentW > viewport.w
  const widthFloor = scrollsVertically ? viewport.w - scrollbarSize.w : viewport.w
  const heightFloor = scrollsHorizontally ? viewport.h - scrollbarSize.h : viewport.h
  return {
    w: Math.ceil(Math.max(widthFloor, contentW)),
    h: Math.ceil(Math.max(heightFloor, contentH)),
  }
}
