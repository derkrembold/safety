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

function maxDefined(...values: (number | undefined)[]): number {
  return values.reduce<number>((max, value) => value === undefined ? max : Math.max(max, value), -Infinity)
}

/** Use real SVG bounds when available; the fallback also works without browser layout. */
export function canvasSize(
  items: readonly CanvasItem[],
  viewport: CanvasSize,
  measured?: { right: number; bottom: number },
  rename?: { right: number; bottom: number },
  origin: Point = { x: 0, y: 0 },
): CanvasSize {
  let right = -Infinity
  let bottom = -Infinity
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
    w: Math.ceil(Math.max(viewport.w, maxDefined(right, rename?.right) - origin.x + 2 * CANVAS_PADDING)),
    h: Math.ceil(Math.max(viewport.h, maxDefined(bottom, rename?.bottom) - origin.y + 2 * CANVAS_PADDING)),
  }
}
