import type { ElementKind, Point } from './model'

export const ELEMENT_KINDS: ElementKind[] = ['standardeingang', 'oder', 'und']

export const KIND_NAMES: Record<ElementKind, string> = {
  standardeingang: 'Standardeingang',
  oder: 'ODER-Verknüpfung',
  und: 'UND-Verknüpfung',
}

export const GATE_SIZE = { w: 72, h: 64 }
export const EVENT_SIZE = { w: 56, h: 56 }

export function sizeOf(kind: ElementKind): { w: number; h: number } {
  return kind === 'standardeingang' ? EVENT_SIZE : GATE_SIZE
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

export interface CanvasSize { w: number; h: number }
export interface CanvasItem { kind: ElementKind; label: string; position: Point }

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
): CanvasSize {
  let right = 0
  let bottom = 0
  for (const { kind, label, position } of items) {
    const { w, h } = sizeOf(kind)
    right = Math.max(right, position.x + w + 10 + Array.from(label).length * 14)
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
  return {
    w: Math.ceil(Math.max(viewport.w, Math.max(0, right, rename?.right ?? 0) - origin.x + 2 * CANVAS_PADDING)),
    h: Math.ceil(Math.max(viewport.h, Math.max(0, bottom, rename?.bottom ?? 0) - origin.y + 2 * CANVAS_PADDING)),
  }
}
