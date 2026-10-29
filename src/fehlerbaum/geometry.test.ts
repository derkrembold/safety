import { describe, expect, it } from 'vitest'
import { clampPosition, EVENT_SIZE, GATE_SIZE } from './geometry'

const bounds = { w: 200, h: 200 }

describe('clampPosition', () => {
  it('lässt Positionen innerhalb der Fläche unverändert', () => {
    expect(clampPosition('oder', { x: 50, y: 60 }, bounds)).toEqual({ x: 50, y: 60 })
  })

  it('begrenzt links und oben auf 0', () => {
    expect(clampPosition('und', { x: -30, y: -5 }, bounds)).toEqual({ x: 0, y: 0 })
  })

  it('begrenzt rechts und unten unter Berücksichtigung der Elementgröße', () => {
    expect(clampPosition('oder', { x: 500, y: 500 }, bounds)).toEqual({
      x: bounds.w - GATE_SIZE.w,
      y: bounds.h - GATE_SIZE.h,
    })
    expect(clampPosition('standardeingang', { x: 500, y: 500 }, bounds)).toEqual({
      x: bounds.w - EVENT_SIZE.w,
      y: bounds.h - EVENT_SIZE.h,
    })
  })

  it('hält Elemente bei zu kleiner Fläche bei 0', () => {
    expect(clampPosition('und', { x: 40, y: 40 }, { w: 30, h: 30 })).toEqual({ x: 0, y: 0 })
  })

  it('begrenzt nur links/oben, solange die Fläche nicht vermessen ist', () => {
    expect(clampPosition('und', { x: 500, y: -1 }, { w: 0, h: 0 })).toEqual({ x: 500, y: 0 })
  })
})
