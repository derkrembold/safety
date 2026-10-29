import type { ComponentId } from './ids'

/**
 * A component identity, defined exactly once per project.
 *
 * Failure and repair rate live here and *only* here. Diagram nodes reference a component
 * by {@link ComponentDefinition.id} and never carry rates of their own, so changing a
 * rate automatically affects every occurrence in every tab.
 */
export interface ComponentDefinition {
  readonly id: ComponentId
  /** Display name. Purely cosmetic — renaming never changes the identity. */
  readonly name: string
  /** Failure rate lambda in 1/h. Constant (exponential distribution). */
  readonly failureRate: number
  /** Repair rate mu in 1/h. Only needed for availability, hence optional. */
  readonly repairRate?: number
  readonly note?: string
}

/**
 * Component-level formulas.
 *
 * These deliberately stop at the component boundary: combining them into system values
 * is *not* done here, because shared component identities make naive AND/OR product
 * formulas wrong. System probabilities are computed over the BDD instead (issue #6, see
 * `Konzept.md`, "Systemwahrscheinlichkeiten allgemein").
 */

/** Mean time to failure MTTF = 1/lambda, in hours. */
export function mttf(component: ComponentDefinition): number {
  return 1 / component.failureRate
}

/** Mean time to repair MTTR = 1/mu, in hours; undefined without a repair rate. */
export function mttr(component: ComponentDefinition): number | undefined {
  return component.repairRate === undefined ? undefined : 1 / component.repairRate
}

/** Reliability R(t) = exp(-lambda * t) of this single component. */
export function reliability(component: ComponentDefinition, missionTimeHours: number): number {
  return Math.exp(-component.failureRate * missionTimeHours)
}

/** Failure probability F(t) = 1 - R(t) of this single component. */
export function failureProbability(
  component: ComponentDefinition,
  missionTimeHours: number,
): number {
  return 1 - reliability(component, missionTimeHours)
}

/**
 * Steady-state availability A = mu / (lambda + mu) = MTTF / (MTTF + MTTR).
 * Undefined without a repair rate.
 */
export function availability(component: ComponentDefinition): number | undefined {
  const { failureRate, repairRate } = component
  if (repairRate === undefined) return undefined
  return repairRate / (failureRate + repairRate)
}

/**
 * Instantaneous probability of failure on demand q(t) = lambda_DU * t, clamped to [0, 1].
 *
 * `t` runs over one test interval (0 <= t <= tau). The linear form is the approximation
 * agreed in `Konzept.md` ("System-PFDavg-Berechnung"), which also fixes lambda_DU =
 * lambda. Averaging happens at *system* level after combining q(t) over the BDD — never
 * by combining per-component averages, which would understate redundant structures.
 */
export function instantaneousPfd(component: ComponentDefinition, t: number): number {
  const q = component.failureRate * t
  return q < 0 ? 0 : q > 1 ? 1 : q
}
