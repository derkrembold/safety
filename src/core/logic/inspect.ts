import type { ComponentId } from '../ids'
import type { LogicExpr } from './expr'
import { childrenOf, isConst, isVar } from './expr'

/** An assignment: the set of component identities that have failed. */
export type Assignment = ReadonlySet<ComponentId>

/** Builds an {@link Assignment} from a record of component identity to failed flag. */
export function assignmentOf(flags: Readonly<Record<string, boolean>>): Assignment {
  const failed = new Set<ComponentId>()
  for (const [id, value] of Object.entries(flags)) {
    if (value) failed.add(id as ComponentId)
  }
  return failed
}

/**
 * Cached variable sets, keyed by expression node.
 *
 * Because {@link ExprBuilder} interns and freezes its nodes, one shared node is one key:
 * the cache therefore makes traversal linear in the number of *DAG* nodes instead of
 * exponential in the number of paths — the same reason sharing exists in the first place.
 */
const variableSetCache = new WeakMap<LogicExpr, ReadonlySet<ComponentId>>()

function variableSet(expr: LogicExpr): ReadonlySet<ComponentId> {
  const cached = variableSetCache.get(expr)
  if (cached !== undefined) return cached

  let result: ReadonlySet<ComponentId>
  if (isVar(expr)) {
    result = new Set([expr.component])
  } else if (isConst(expr)) {
    result = new Set<ComponentId>()
  } else {
    const union = new Set<ComponentId>()
    for (const child of childrenOf(expr)) {
      for (const component of variableSet(child)) union.add(component)
    }
    result = union
  }

  variableSetCache.set(expr, result)
  return result
}

/** All component identities this expression depends on. */
export function variableSetOf(expr: LogicExpr): ReadonlySet<ComponentId> {
  return variableSet(expr)
}

/** All component identities this expression depends on, in a stable order. */
export function variablesOf(expr: LogicExpr): readonly ComponentId[] {
  return [...variableSet(expr)].sort((a, b) => a.localeCompare(b))
}

/** Number of distinct nodes in the expression DAG (shared nodes counted once). */
export function nodeCount(expr: LogicExpr): number {
  const seen = new Set<LogicExpr>()
  const visit = (current: LogicExpr): void => {
    if (seen.has(current)) return
    seen.add(current)
    for (const child of childrenOf(current)) visit(child)
  }
  visit(expr)
  return seen.size
}

/**
 * Component identities that break the independence assumption.
 *
 * A component shows up here when some AND/OR node has it in the variable sets of two or
 * more of its children: the combined sub-events then share a component and are therefore
 * *not* independent. This is the check issue #6 needs in order to decide where simple
 * AND/OR product formulas are still allowed and where the BDD has to do the work
 * (`Konzept.md`, "Systemwahrscheinlichkeiten allgemein").
 */
export function sharedComponents(expr: LogicExpr): readonly ComponentId[] {
  const shared = new Set<ComponentId>()
  const seen = new Set<LogicExpr>()

  const visit = (current: LogicExpr): void => {
    if (seen.has(current)) return
    seen.add(current)

    const children = childrenOf(current)
    const counts = new Map<ComponentId, number>()
    for (const child of children) {
      for (const component of variableSet(child)) {
        counts.set(component, (counts.get(component) ?? 0) + 1)
      }
    }
    for (const [component, count] of counts) {
      if (count > 1) shared.add(component)
    }

    for (const child of children) visit(child)
  }

  visit(expr)
  return [...shared].sort((a, b) => a.localeCompare(b))
}

/**
 * True when the children of this node have pairwise disjoint component sets, i.e. when
 * simple product formulas are admissible at this node.
 */
export function hasIndependentChildren(expr: LogicExpr): boolean {
  const seen = new Set<ComponentId>()
  for (const child of childrenOf(expr)) {
    for (const component of variableSet(child)) {
      if (seen.has(component)) return false
      seen.add(component)
    }
  }
  return true
}

/** True when no node anywhere in the expression combines shared components. */
export function isFullyIndependent(expr: LogicExpr): boolean {
  return sharedComponents(expr).length === 0
}

/**
 * Evaluates the expression: `true` means the system has failed under this assignment.
 *
 * Used as the reference oracle for the BDD evaluation in issue #6, and to enumerate
 * truth tables in tests.
 */
export function evaluate(expr: LogicExpr, failed: Assignment): boolean {
  const cache = new Map<LogicExpr, boolean>()

  const visit = (current: LogicExpr): boolean => {
    const cached = cache.get(current)
    if (cached !== undefined) return cached

    let value: boolean
    if (isVar(current)) {
      value = failed.has(current.component)
    } else if (isConst(current)) {
      value = current.value
    } else if (current.kind === 'and') {
      value = current.children.every(visit)
    } else {
      value = current.children.some(visit)
    }

    cache.set(current, value)
    return value
  }

  return visit(expr)
}

/**
 * Structural equality, independent of which builder produced the expressions.
 *
 * Within one {@link ExprBuilder} reference equality (`===`) already answers this, since
 * equal structures are interned to the same object.
 */
export function structuralEquals(a: LogicExpr, b: LogicExpr): boolean {
  if (a === b) return true
  if (a.kind !== b.kind) return false
  if (isVar(a) && isVar(b)) return a.component === b.component
  if (isConst(a) && isConst(b)) return a.value === b.value

  const left = childrenOf(a)
  const right = childrenOf(b)
  if (left.length !== right.length) return false

  // Children are order-normalised by the builder, but compare order-insensitively so
  // expressions from different builders still match.
  const remaining = [...right]
  for (const child of left) {
    const index = remaining.findIndex((candidate) => structuralEquals(child, candidate))
    if (index === -1) return false
    remaining.splice(index, 1)
  }
  return true
}
