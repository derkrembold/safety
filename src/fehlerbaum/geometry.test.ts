import { describe, expect, it } from 'vitest'
import { CANVAS_PADDING, canvasOrigin, canvasPoint, canvasSize } from './geometry'

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
})
