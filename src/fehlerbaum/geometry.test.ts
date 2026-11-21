import { describe, expect, it } from 'vitest'
import { CANVAS_PADDING, canvasOrigin, canvasPoint, canvasSize, commentSize } from './geometry'

describe('Kommentarblöcke in der Flächenausdehnung', () => {
  it('wachsen mit ihrem Text, und die Zeichenfläche umfasst sie', () => {
    expect(commentSize('a\nb\nc\nd\ne').h).toBeGreaterThan(commentSize('a').h)
    const box = commentSize('')
    const size = canvasSize([{ box, position: { x: 900, y: 700 } }], { w: 100, h: 100 })
    expect(size.w).toBeGreaterThanOrEqual(900 + box.w)
    expect(size.h).toBeGreaterThanOrEqual(700 + box.h)
    expect(canvasOrigin([{ position: { x: -50, y: -30 } }])).toEqual({ x: -50, y: -30 })
  })
})

describe('scrollable canvas geometry', () => {
  it('uses the surface rectangle, including border and scroll offsets, exactly once', () => {
    expect(canvasPoint({ x: 225, y: 175 }, { x: -199, y: -149 })).toEqual({ x: 400, y: 300 })
  })

  it('shifts canvas points by the current origin when content grows above/left of it', () => {
    expect(canvasPoint({ x: 225, y: 175 }, { x: -199, y: -149 }, { x: -50, y: -30 })).toEqual({ x: 350, y: 270 })
  })

  describe('canvasOrigin', () => {
    it('stays at the model origin when nothing sits above or left of it', () => {
      expect(canvasOrigin([])).toEqual({ x: 0, y: 0 })
      expect(canvasOrigin([{ position: { x: 40, y: 40 } }])).toEqual({ x: 0, y: 0 })
    })

    it('tracks the smallest coordinate across all items, independently per axis', () => {
      expect(canvasOrigin([
        { position: { x: 40, y: -20 } },
        { position: { x: -70, y: 40 } },
      ])).toEqual({ x: -70, y: -20 })
    })
  })

  it('fits a small tree without artificial overflow', () => {
    expect(canvasSize([{ kind: 'oder', label: 'TOP', position: { x: 40, y: 40 } }], { w: 800, h: 600 }))
      .toEqual({ w: 800, h: 600 })
  })

  it('expands each axis independently and leaves room for labels and stubs', () => {
    const small = { kind: 'standardeingang' as const, label: 'Sensor', position: { x: 1000, y: 40 } }
    expect(canvasSize([small], { w: 800, h: 600 })).toEqual({ w: 1000 + 56 + 10 + 6 * 14 + 2 * CANVAS_PADDING, h: 600 })
    expect(canvasSize([{ ...small, position: { x: 40, y: 1000 } }], { w: 800, h: 600 }).h)
      .toBe(1000 + 56 + 2 * CANVAS_PADDING)
  })

  it('uses measured SVG text bounds and includes an active rename input', () => {
    expect(canvasSize([], { w: 200, h: 200 }, { right: 1600.5, bottom: 900 }, { right: 1800, bottom: 800 }))
      .toEqual({ w: 1848, h: 948 })
  })

  it('grows for content above/left of the model origin too, symmetrically to the right/bottom', () => {
    const items = [
      { kind: 'standardeingang' as const, label: 'Sensor', position: { x: -1000, y: 40 } },
      { kind: 'oder' as const, label: 'TOP', position: { x: 40, y: 40 } },
    ]
    const origin = canvasOrigin(items)
    expect(origin).toEqual({ x: -1000, y: 0 })
    expect(canvasSize(items, { w: 800, h: 600 }, undefined, undefined, origin).w)
      .toBe(40 + 72 + 10 + 3 * 14 - origin.x + 2 * CANVAS_PADDING)
  })

  it('still grows for a single element dragged far above/left, not just when a second one anchors the other side', () => {
    // Regression: right/bottom must float a fixed floor at 0, mirroring canvasOrigin's
    // ceiling at 0 — otherwise a lone item is both ends of the span, right - origin.x stays
    // roughly constant (its own footprint), and the canvas never appears to need to grow.
    const items = [{ kind: 'oder' as const, label: 'TOP', position: { x: -2000, y: -2000 } }]
    const origin = canvasOrigin(items)
    expect(origin).toEqual({ x: -2000, y: -2000 })
    const size = canvasSize(items, { w: 800, h: 600 }, undefined, undefined, origin)
    expect(size.w).toBeGreaterThan(800)
    expect(size.h).toBeGreaterThan(600)
  })

  it('keeps the 0 floor even when real SVG bounds and an active rename are both negative (Codex-Regression PR #36)', () => {
    // Measured bounds (real getBBox, browser-only) and an active rename's own bound can each
    // be negative for a lone far-left/up element; only jsdom's unmeasured fallback happened
    // to stay nonnegative, so this combination slipped past the prior tests.
    const items = [{ kind: 'oder' as const, label: 'TOP', position: { x: -2000, y: -2000 } }]
    const origin = canvasOrigin(items)
    const measured = { right: -1876, bottom: -1936 }
    const rename = { right: -1762, bottom: -1948 } // matches the editor's rename-input bounds formula
    expect(canvasSize(items, { w: 800, h: 600 }, measured, undefined, origin)).toEqual({ w: 2048, h: 2048 })
    expect(canvasSize(items, { w: 800, h: 600 }, measured, rename, origin)).toEqual({ w: 2048, h: 2048 })
  })

  describe('reserviert Scrollbalken-Platz nur auf der jeweils anderen Achse (Issue #48/Codex-Review PR #49)', () => {
    const scrollbar = { w: 15, h: 15 }

    it('ohne angegebene Scrollbalkengröße verhält es sich wie zuvor (kein Reservieren)', () => {
      const far = { kind: 'standardeingang' as const, label: 'X', position: { x: 2000, y: 0 } }
      expect(canvasSize([far], { w: 800, h: 600 })).toEqual({ w: 2000 + 56 + 10 + 1 * 14 + 2 * CANVAS_PADDING, h: 600 })
    })

    it('bleibt beim leeren Baum unberührt, egal wie groß der Scrollbalken ist', () => {
      expect(canvasSize([], { w: 800, h: 600 }, undefined, undefined, undefined, scrollbar))
        .toEqual({ w: 800, h: 600 })
    })

    it('reserviert Höhe für den horizontalen Scrollbalken, wenn nur die Breite überläuft', () => {
      // Nur x überläuft (ein Element weit rechts, y bleibt klein): ohne Reservierung würde
      // die Fläche trotzdem auf die volle Höhe gesetzt, obwohl der dann erscheinende
      // horizontale Scrollbalken real weniger Höhe übrig lässt -- das erzeugte laut Codex
      // einen unnötigen zweiten (vertikalen) Scrollbalken, obwohl der Inhalt vertikal
      // vollständig hineinpasst.
      const far = { kind: 'standardeingang' as const, label: 'X', position: { x: 2000, y: 0 } }
      const size = canvasSize([far], { w: 800, h: 600 }, undefined, undefined, undefined, scrollbar)
      expect(size.w).toBe(2000 + 56 + 10 + 1 * 14 + 2 * CANVAS_PADDING)
      expect(size.h).toBe(600 - scrollbar.h)
    })

    it('reserviert Breite für den vertikalen Scrollbalken, wenn nur die Höhe überläuft', () => {
      const far = { kind: 'standardeingang' as const, label: 'X', position: { x: 40, y: 2000 } }
      const size = canvasSize([far], { w: 800, h: 600 }, undefined, undefined, undefined, scrollbar)
      expect(size.w).toBe(800 - scrollbar.w)
      expect(size.h).toBe(2000 + 56 + 2 * CANVAS_PADDING)
    })

    it('reserviert auf keiner Achse, wenn beide ohnehin schon überlaufen', () => {
      const far = { kind: 'standardeingang' as const, label: 'X', position: { x: 2000, y: 2000 } }
      const size = canvasSize([far], { w: 800, h: 600 }, undefined, undefined, undefined, scrollbar)
      expect(size.w).toBe(2000 + 56 + 10 + 1 * 14 + 2 * CANVAS_PADDING)
      expect(size.h).toBe(2000 + 56 + 2 * CANVAS_PADDING)
    })
  })
})
