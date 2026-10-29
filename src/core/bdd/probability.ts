import type { ComponentDefinition } from '../component'
import type { ComponentId } from '../ids'
import type { ComponentRegistry } from '../registry'
import { requireComponent } from '../registry'
import type { Bdd } from './types'
import { BddError } from './types'

interface Weights { readonly working: number; readonly failed: number }

function nonnegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) throw new BddError(`${name} must be finite and nonnegative.`)
}

function componentsOf(bdd: Bdd, registry: ComponentRegistry): Map<ComponentId, ComponentDefinition> {
  const result = new Map<ComponentId, ComponentDefinition>()
  for (const node of bdd.nodes) {
    if (node.kind !== 'decision' || result.has(node.component)) continue
    const component = requireComponent(registry, node.component)
    if (component.id !== node.component) throw new BddError(`Inconsistent component identity: ${node.component}`)
    nonnegative(component.failureRate, `Failure rate of ${node.component}`)
    result.set(node.component, component)
  }
  return result
}

function weighted(bdd: Bdd, weights: ReadonlyMap<ComponentId, Weights>, success = false): number {
  const values = new Float64Array(bdd.nodes.length)
  values[0] = success ? 1 : 0
  values[1] = success ? 0 : 1
  for (let id = 2; id < bdd.nodes.length; id++) {
    const node = bdd.nodes[id]
    if (node.kind !== 'decision') throw new BddError('Invalid BDD: unexpected terminal.')
    const probability = weights.get(node.component)
    if (probability === undefined) throw new BddError(`Missing probability for ${node.component}.`)
    values[id] = probability.working * values[node.low] + probability.failed * values[node.high]
  }
  return Math.max(0, Math.min(1, values[bdd.root]))
}

/** Shannon evaluation; component probabilities are indexed by identity, not occurrence. */
export function bddFailureProbability(bdd: Bdd, probabilities: ReadonlyMap<ComponentId, number>): number {
  const weights = new Map<ComponentId, Weights>()
  for (const node of bdd.nodes) {
    if (node.kind !== 'decision' || weights.has(node.component)) continue
    const q = probabilities.get(node.component)
    if (q === undefined || !Number.isFinite(q) || q < 0 || q > 1) {
      throw new BddError(`Failure probability for ${node.component} must be in [0, 1].`)
    }
    weights.set(node.component, { working: 1 - q, failed: q })
  }
  return weighted(bdd, weights)
}

export function systemReliability(bdd: Bdd, registry: ComponentRegistry, missionTimeHours: number): number {
  nonnegative(missionTimeHours, 'Mission time')
  const weights = new Map<ComponentId, Weights>()
  for (const [id, component] of componentsOf(bdd, registry)) {
    const exponent = -component.failureRate * missionTimeHours
    // Calculate both branches directly: 1-exp(x) loses small failure probabilities,
    // while 1-q loses small reliability values once q rounds to one.
    weights.set(id, { working: Math.exp(exponent), failed: -Math.expm1(exponent) })
  }
  return weighted(bdd, weights, true)
}

export function systemAvailability(bdd: Bdd, registry: ComponentRegistry): number {
  const weights = new Map<ComponentId, Weights>()
  for (const [id, component] of componentsOf(bdd, registry)) {
    const lambda = component.failureRate
    const mu = component.repairRate
    if (mu === undefined) throw new BddError(`Missing repair rate for ${id}.`)
    nonnegative(mu, `Repair rate of ${id}`)
    if (lambda === 0 && mu === 0) throw new BddError(`Steady-state availability is undefined for two zero rates (${id}).`)
    // Ratios avoid overflow in lambda+mu and retain both tails without subtraction.
    const ratio = lambda <= mu ? lambda / mu : mu / lambda
    const small = ratio / (1 + ratio)
    const large = 1 / (1 + ratio)
    weights.set(id, lambda <= mu ? { working: large, failed: small } : { working: small, failed: large })
  }
  return weighted(bdd, weights, true)
}

/** q_i(t) = clamp(lambda_i * t, 0, 1); synchronous perfect proof tests are assumed. */
export function instantaneousSystemPfd(bdd: Bdd, registry: ComponentRegistry, elapsedHours: number): number {
  nonnegative(elapsedHours, 'Elapsed time')
  const probabilities = new Map<ComponentId, number>()
  for (const [id, component] of componentsOf(bdd, registry)) {
    probabilities.set(id, Math.min(1, component.failureRate * elapsedHours))
  }
  return bddFailureProbability(bdd, probabilities)
}

export interface PfdIntegrationOptions {
  /** Relative error target, including very small probabilities. Default 1e-8. */
  readonly relativeTolerance?: number
  /** Absolute error target; defaults to zero so rare events retain relative accuracy. */
  readonly absoluteTolerance?: number
  readonly maxEvaluations?: number
  readonly maxDepth?: number
}

/**
 * PFDavg = integral_0^1 Q_system(tau*u) du. Adaptive Simpson integration is split
 * at each clamp breakpoint. Component means are never multiplied together.
 * A convergence/budget failure throws rather than returning an unchecked value.
 */
export function systemPfdAvg(
  bdd: Bdd,
  registry: ComponentRegistry,
  testIntervalHours: number,
  options: PfdIntegrationOptions = {},
): number {
  if (!Number.isFinite(testIntervalHours) || testIntervalHours <= 0) throw new BddError('Test interval must be finite and positive.')
  const relative = options.relativeTolerance ?? 1e-8
  const absolute = options.absoluteTolerance ?? 0
  const maxEvaluations = options.maxEvaluations ?? 100_000
  const maxDepth = options.maxDepth ?? 24
  if (!Number.isFinite(relative) || relative <= 0 || relative >= 1
    || !Number.isFinite(absolute) || absolute < 0
    || !Number.isSafeInteger(maxEvaluations) || maxEvaluations < 5
    || !Number.isSafeInteger(maxDepth) || maxDepth < 1 || maxDepth > 60) {
    throw new BddError('Invalid PFD integration options.')
  }
  const coefficients = new Map<ComponentId, number>()
  const breakpoints = new Set([0, 1])
  for (const [id, component] of componentsOf(bdd, registry)) {
    const coefficient = component.failureRate * testIntervalHours
    if (!Number.isFinite(coefficient)) throw new BddError(`Failure rate times test interval overflows for ${id}.`)
    coefficients.set(id, coefficient)
    if (coefficient > 1) breakpoints.add(1 / coefficient)
  }
  const cache = new Map<number, number>()
  function value(u: number): number {
    const known = cache.get(u)
    if (known !== undefined) return known
    if (cache.size >= maxEvaluations) throw new BddError('PFD integration evaluation limit exceeded.')
    const weights = new Map<ComponentId, Weights>()
    for (const [id, coefficient] of coefficients) {
      const q = Math.min(1, coefficient * u)
      weights.set(id, { working: 1 - q, failed: q })
    }
    const result = weighted(bdd, weights)
    cache.set(u, result)
    return result
  }
  const simpson = (a: number, b: number, fa: number, fm: number, fb: number) => (b - a) / 6 * (fa + 4 * fm + fb)
  function integrate(a: number, b: number, fa: number, fm: number, fb: number, whole: number, budget: number, depth: number): { value: number; error: number } {
    const mid = (a + b) / 2
    const leftMid = value((a + mid) / 2)
    const rightMid = value((mid + b) / 2)
    const left = simpson(a, mid, fa, leftMid, fm)
    const right = simpson(mid, b, fm, rightMid, fb)
    const refined = left + right
    const delta = refined - whole
    const error = Math.abs(delta) / 15
    if (error <= Math.max(budget, Number.MIN_VALUE)) return { value: refined + delta / 15, error }
    if (depth === 0 || mid === a || mid === b) throw new BddError('PFD integration did not converge within the depth limit.')
    const lhs = integrate(a, mid, fa, leftMid, fm, left, budget / 2, depth - 1)
    const rhs = integrate(mid, b, fm, rightMid, fb, right, budget / 2, depth - 1)
    return { value: lhs.value + rhs.value, error: lhs.error + rhs.error }
  }
  const points = [...breakpoints].sort((a, b) => a - b)
  const intervals = points.slice(1).map((b, i) => {
    const a = points[i]
    const fa = value(a)
    const fm = value((a + b) / 2)
    const fb = value(b)
    return { a, b, fa, fm, fb, whole: simpson(a, b, fa, fm, fb) }
  })
  let estimate = intervals.reduce((sum, interval) => sum + interval.whole, 0)
  // Use a GLOBAL error budget. A purely local relative test cannot converge on
  // the first interval of u^4 near zero, even when its total contribution is tiny.
  for (let attempt = 0; attempt < 8; attempt++) {
    const budget = Math.max(absolute, relative * Math.abs(estimate), Number.MIN_VALUE) / 2
    let total = 0
    let error = 0
    for (const { a, b, fa, fm, fb, whole } of intervals) {
      const result = integrate(a, b, fa, fm, fb, whole, budget * (b - a), maxDepth)
      total += result.value
      error += result.error
    }
    if (error <= Math.max(absolute, relative * Math.abs(total), Number.MIN_VALUE)) {
      return Math.max(0, Math.min(1, total))
    }
    estimate = total
  }
  throw new BddError('PFD integration did not reach the requested error target.')
}
