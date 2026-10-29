import type { ComponentId } from '../ids'

/** Terminal 0 = system works; terminal 1 = system failed. */
export interface BddTerminal {
  readonly kind: 'terminal'
  readonly value: 0 | 1
}

export interface BddDecision {
  readonly kind: 'decision'
  readonly component: ComponentId
  /** Component works. */
  readonly low: number
  /** Component has failed. */
  readonly high: number
}

export type BddNode = BddTerminal | BddDecision

/**
 * An immutable reduced ordered BDD. Node IDs are indices in `nodes`; 0 and 1
 * are the terminals. Children precede their parents, enabling linear evaluation.
 * Only reachable decisions are retained. The variable order may include skipped
 * variables that disappeared through reduction.
 */
export interface Bdd {
  readonly root: number
  readonly nodes: readonly BddNode[]
  readonly variableOrder: readonly ComponentId[]
}

export interface BddBuildOptions {
  /** Defaults to a deterministic lexicographic order of component identities. */
  readonly variableOrder?: readonly ComponentId[]
  /** Limit on temporary and final nodes; BDD size can be exponential. */
  readonly maxNodes?: number
}

export class BddError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BddError'
  }
}
