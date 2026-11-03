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

/** The scroll offset is already included in the moving surface's client rectangle. */
export function canvasPoint(client: Point, surfaceOrigin: Point): Point {
  return {
    x: client.x - surfaceOrigin.x - CANVAS_PADDING,
    y: client.y - surfaceOrigin.y - CANVAS_PADDING,
  }
}

/** Model coordinates never depend on viewport size. */
export function nonnegativePosition(position: Point): Point {
  return { x: Math.max(0, position.x), y: Math.max(0, position.y) }
}

/** Use real SVG bounds when available; the fallback also works without browser layout. */
export function canvasSize(
  items: readonly CanvasItem[],
  viewport: CanvasSize,
  measured?: { right: number; bottom: number },
  rename?: { right: number; bottom: number },
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
  return {
    w: Math.ceil(Math.max(viewport.w, Math.max(right, rename?.right ?? 0) + 2 * CANVAS_PADDING)),
    h: Math.ceil(Math.max(viewport.h, Math.max(bottom, rename?.bottom ?? 0) + 2 * CANVAS_PADDING)),
  }
}
