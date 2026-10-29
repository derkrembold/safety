import { describe, expect, it } from 'vitest'
import {
  availability,
  failureProbability,
  instantaneousPfd,
  mttf,
  mttr,
  reliability,
} from './component'
import { SENSOR, component } from './fixtures'

describe('component-level formulas', () => {
  const repairable = component(SENSOR, 'Sensor', 1e-4, 0.05)
  const nonRepairable = component(SENSOR, 'Sensor', 1e-4)

  it('derives MTTF and MTTR from the rates', () => {
    expect(mttf(repairable)).toBeCloseTo(10_000, 6)
    expect(mttr(repairable)).toBeCloseTo(20, 6)
    expect(mttr(nonRepairable)).toBeUndefined()
  })

  it('computes reliability as an exponential distribution', () => {
    expect(reliability(repairable, 0)).toBe(1)
    expect(reliability(repairable, 8760)).toBeCloseTo(Math.exp(-0.876), 12)
    expect(failureProbability(repairable, 8760)).toBeCloseTo(1 - Math.exp(-0.876), 12)
  })

  it('computes steady-state availability as mu / (lambda + mu)', () => {
    expect(availability(repairable)).toBeCloseTo(0.05 / (1e-4 + 0.05), 12)
    // Equivalent to MTTF / (MTTF + MTTR).
    expect(availability(repairable)).toBeCloseTo(10_000 / (10_000 + 20), 12)
    expect(availability(nonRepairable)).toBeUndefined()
  })

  it('clamps the instantaneous PFD to [0, 1]', () => {
    expect(instantaneousPfd(repairable, 0)).toBe(0)
    expect(instantaneousPfd(repairable, 4380)).toBeCloseTo(0.438, 12)
    // The linear approximation leaves the valid range for large lambda * t.
    expect(instantaneousPfd(repairable, 100_000)).toBe(1)
    expect(instantaneousPfd(repairable, -5)).toBe(0)
  })
})
