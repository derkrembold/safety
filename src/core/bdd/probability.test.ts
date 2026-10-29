import { describe, expect, it } from 'vitest'
import { asComponentId } from '../ids'
import { createExprBuilder } from '../logic/builder'
import { emptyRegistry, putComponent } from '../registry'
import { buildBdd } from './build'
import {
  bddFailureProbability, instantaneousSystemPfd, systemAvailability,
  systemPfdAvg, systemReliability,
} from './probability'

const ids = ['a', 'b', 'c', 'd'].map(asComponentId)
function fixture(rates = [1e-4, 2e-4], repairRate: number | undefined = 0.1) {
  const builder = createExprBuilder()
  let registry = emptyRegistry()
  rates.forEach((failureRate, i) => {
    registry = putComponent(registry, { id: ids[i], name: ids[i], failureRate,
      ...(repairRate === undefined ? {} : { repairRate }) })
  })
  const variables = rates.map((_, i) => builder.var(ids[i]))
  return { builder, registry, variables, redundant: buildBdd(builder.and(variables)), series: buildBdd(builder.or(variables)) }
}

describe('system probabilities', () => {
  it('computes reliability for series and redundant systems', () => {
    const { registry, redundant, series } = fixture()
    const t = 1000
    const ra = Math.exp(-0.1)
    const rb = Math.exp(-0.2)
    expect(systemReliability(series, registry, t)).toBeCloseTo(ra * rb, 14)
    expect(systemReliability(redundant, registry, t)).toBeCloseTo(1 - (1 - ra) * (1 - rb), 14)
    expect(systemReliability(series, registry, 0)).toBe(1)
  })

  it('computes availability from the stationary component probabilities', () => {
    const { registry, redundant, series } = fixture()
    const aa = 0.1 / (0.1 + 1e-4)
    const ab = 0.1 / (0.1 + 2e-4)
    expect(systemAvailability(series, registry)).toBeCloseTo(aa * ab, 14)
    expect(systemAvailability(redundant, registry)).toBeCloseTo(1 - (1 - aa) * (1 - ab), 14)
  })

  it('retains tiny probabilities without subtraction cancellation', () => {
    const { registry, redundant, series } = fixture([1, 1])
    expect(systemReliability(series, registry, 100)).toBeCloseTo(Math.exp(-200), 95)
    const result = bddFailureProbability(redundant, new Map([[ids[0], 1e-20], [ids[1], 1e-20]]))
    expect(result / 1e-40).toBeCloseTo(1, 14)
  })

  it('handles finite rates whose sum would overflow', () => {
    const { registry, series } = fixture([1e308], 1e308)
    expect(systemAvailability(series, registry)).toBe(0.5)
  })

  it('requires rates only for components remaining after reduction', () => {
    const { builder, registry, variables } = fixture([1e-4])
    const bdd = buildBdd(builder.and([variables[0], builder.or([variables[0], builder.var(ids[1])])]))
    expect(systemReliability(bdd, registry, 1000)).toBeCloseTo(Math.exp(-0.1), 14)
  })

  it('supports constant systems and zero failure or repair rates', () => {
    const { builder } = fixture()
    for (const value of [false, true]) {
      const bdd = buildBdd(builder.constant(value))
      expect(bddFailureProbability(bdd, new Map())).toBe(Number(value))
      expect(systemReliability(bdd, emptyRegistry(), 10)).toBe(Number(!value))
      expect(systemAvailability(bdd, emptyRegistry())).toBe(Number(!value))
      expect(systemPfdAvg(bdd, emptyRegistry(), 10)).toBe(Number(value))
    }
    const ideal = fixture([0], 1)
    expect(systemAvailability(ideal.series, ideal.registry)).toBe(1)
    const noRepair = fixture([1], 0)
    expect(systemAvailability(noRepair.series, noRepair.registry)).toBe(0)
    const undefinedSteadyState = fixture([0], 0)
    expect(() => systemAvailability(undefinedSteadyState.series, undefinedSteadyState.registry)).toThrow(/undefined/)
  })

  it('rejects missing, negative and nonfinite input values', () => {
    const { redundant, series, registry } = fixture()
    expect(() => bddFailureProbability(series, new Map())).toThrow(/probability/)
    for (const q of [-1, 2, NaN, Infinity]) {
      expect(() => bddFailureProbability(series, new Map([[ids[0], q], [ids[1], 0.1]]))).toThrow()
    }
    expect(() => systemReliability(redundant, emptyRegistry(), 100)).toThrow(/Unknown component/)
    for (const t of [-1, NaN, Infinity]) {
      expect(() => systemReliability(series, registry, t)).toThrow()
      expect(() => instantaneousSystemPfd(series, registry, t)).toThrow()
    }
    const invalid = fixture([-1])
    expect(() => systemReliability(invalid.series, invalid.registry, 1)).toThrow(/Failure rate/)
    const noRepair = fixture([0.1], undefined)
    // Explicitly remove repairRate because default parameters substitute undefined.
    const withoutRepair = putComponent(emptyRegistry(), { id: ids[0], name: 'A', failureRate: 0.1 })
    expect(() => systemAvailability(noRepair.series, withoutRepair)).toThrow(/Missing repair/)
  })
})

describe('PFDavg integration', () => {
  it('integrates each component over the project-wide test interval', () => {
    const { registry, series } = fixture([1e-5])
    expect(instantaneousSystemPfd(series, registry, 500)).toBeCloseTo(0.005, 14)
    expect(systemPfdAvg(series, registry, 1000)).toBeCloseTo(0.01 / 2, 14)
  })

  it('gets 1oo2 = lambda²*tau²/3, rather than a product of component means', () => {
    const { registry, redundant } = fixture([1e-5, 1e-5])
    const result = systemPfdAvg(redundant, registry, 1000)
    expect(result).toBeCloseTo(0.01 ** 2 / 3, 14)
    expect(result).not.toBeCloseTo(0.01 ** 2 / 4, 7)
  })

  it('integrates the OR polynomial analytically expected for a series system', () => {
    const { registry, series } = fixture([1e-4, 2e-4])
    expect(systemPfdAvg(series, registry, 1000)).toBeCloseTo((0.1 + 0.2) / 2 - 0.1 * 0.2 / 3, 13)
  })

  it('averages a reused identity once even when it occurs twice', () => {
    const { builder, registry, variables } = fixture([1e-4])
    const graph = buildBdd(builder.and([variables[0], variables[0]]))
    expect(systemPfdAvg(graph, registry, 1000)).toBeCloseTo(0.1 / 2, 14)
  })

  it('splits the integral at clamp breakpoints', () => {
    const single = fixture([2])
    expect(systemPfdAvg(single.series, single.registry, 1)).toBeCloseTo(0.75, 14)
    const dual = fixture([2, 4])
    expect(systemPfdAvg(dual.redundant, dual.registry, 1)).toBeCloseTo(35 / 48, 13)
    expect(instantaneousSystemPfd(dual.redundant, dual.registry, 100)).toBe(1)
  })

  it('keeps relative accuracy for high-order, very rare redundant failures', () => {
    const { registry, redundant } = fixture([1e-8, 1e-8, 1e-8, 1e-8])
    const expected = 1e-32 / 5
    const actual = systemPfdAvg(redundant, registry, 1)
    expect(actual).toBeGreaterThan(0)
    expect(Math.abs(actual / expected - 1)).toBeLessThan(1e-8)
  })

  it('fails explicitly if evaluation or convergence budgets are insufficient', () => {
    const { registry, redundant } = fixture([0.1, 0.2, 0.3, 0.4])
    expect(() => systemPfdAvg(redundant, registry, 1, { maxEvaluations: 5 })).toThrow(/limit/)
    expect(() => systemPfdAvg(redundant, registry, 1, { maxDepth: 1, relativeTolerance: 1e-14 })).toThrow(/depth limit/)
    for (const tau of [0, -1, NaN, Infinity]) expect(() => systemPfdAvg(redundant, registry, tau)).toThrow(/interval/)
    for (const options of [{ relativeTolerance: 0 }, { absoluteTolerance: -1 }, { maxDepth: 0 }, { maxEvaluations: 1 }]) {
      expect(() => systemPfdAvg(redundant, registry, 1, options)).toThrow(/options/)
    }
  })
})
