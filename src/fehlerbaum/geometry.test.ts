import { describe, expect, it } from 'vitest'
import { CANVAS_PADDING, canvasPoint, canvasSize, nonnegativePosition } from './geometry'

describe('scrollable canvas geometry', () => {
  it('uses the surface rectangle, including border and scroll offsets, exactly once', () => {
    expect(canvasPoint({ x: 225, y: 175 }, { x: -199, y: -149 })).toEqual({ x: 400, y: 300 })
  })

  it('keeps model positions nonnegative without restricting them to a viewport', () => {
    expect(nonnegativePosition({ x: 5000, y: 4000 })).toEqual({ x: 5000, y: 4000 })
    expect(nonnegativePosition({ x: -30, y: -5 })).toEqual({ x: 0, y: 0 })
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
})
