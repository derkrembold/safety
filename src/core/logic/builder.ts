import type { ComponentId } from '../ids'
import type { LogicExpr } from './expr'
import { childrenOf, isAnd, isConst, isOr } from './expr'

/**
 * Builds {@link LogicExpr} nodes with hash-consing.
 *
 * Two guarantees matter:
 *
 * 1. `builder.var(c)` returns the *same object* for the same component identity, every
 *    time. A component used in several places is therefore literally one shared node —
 *    the model cannot accidentally treat it as two independent copies.
 * 2. Structurally equal sub-expressions are interned, so `and([x, y]) === and([y, x])`
 *    and reference equality can be used as (cheap) structural equality.
 *
 * Normalisation applied while building: nested connectives of the same kind are
 * flattened, duplicate children are dropped (idempotence), neutral and absorbing
 * constants are folded away, and children are sorted by their interning key so argument
 * order does not matter. Absorption (`x AND (x OR y) = x`) is deliberately *not* applied
 * — full canonicalisation is the ROBDD's job in issue #6.
 *
 * Interning keys are JSON-encoded tuples rather than concatenated strings. Component ids
 * are arbitrary strings after an import, so a separator-joined key would let an id that
 * contains the separator collide with a different expression — and interning would then
 * hand back the wrong node, silently changing the system's logic. JSON encoding escapes
 * the parts, which makes the key injective for any id.
 */
export class ExprBuilder {
  private readonly interned = new Map<string, LogicExpr>()
  private readonly keys = new WeakMap<LogicExpr, string>()

  /** The constant "system failed". */
  readonly TRUE: LogicExpr = this.constant(true)
  /** The constant "system intact". */
  readonly FALSE: LogicExpr = this.constant(false)

  constant(value: boolean): LogicExpr {
    return this.intern(JSON.stringify(['const', value]), { kind: 'const', value })
  }

  /** The variable "component `component` has failed". */
  var(component: ComponentId): LogicExpr {
    return this.intern(JSON.stringify(['var', component]), { kind: 'var', component })
  }

  /** Failure of all children at once. */
  and(children: readonly LogicExpr[]): LogicExpr {
    return this.connective('and', children)
  }

  /** Failure of at least one child. */
  or(children: readonly LogicExpr[]): LogicExpr {
    return this.connective('or', children)
  }

  /** The interning key of an expression built by this builder. */
  keyOf(expr: LogicExpr): string {
    const key = this.keys.get(expr)
    if (key === undefined) {
      throw new Error('Expression was not built by this ExprBuilder')
    }
    return key
  }

  private connective(kind: 'and' | 'or', children: readonly LogicExpr[]): LogicExpr {
    const neutral = kind === 'and'
    const flattened: LogicExpr[] = []

    for (const child of children) {
      // Flatten a nested connective of the same kind: AND(a, AND(b, c)) -> AND(a, b, c).
      const sameKind = kind === 'and' ? isAnd(child) : isOr(child)
      if (sameKind) {
        flattened.push(...childrenOf(child))
        continue
      }
      if (isConst(child)) {
        // AND absorbs false, OR absorbs true; the other constant is neutral and dropped.
        if (child.value !== neutral) return this.constant(child.value)
        continue
      }
      flattened.push(child)
    }

    const byKey = new Map<string, LogicExpr>()
    for (const child of flattened) {
      byKey.set(this.keyOf(child), child)
    }

    const sortedKeys = [...byKey.keys()].sort()
    if (sortedKeys.length === 0) return this.constant(neutral)

    const first = sortedKeys[0]
    if (sortedKeys.length === 1 && first !== undefined) {
      const only = byKey.get(first)
      if (only !== undefined) return only
    }

    const sorted = sortedKeys.map((key) => byKey.get(key) as LogicExpr)
    return this.intern(JSON.stringify([kind, sortedKeys]), {
      kind,
      children: sorted,
    } as LogicExpr)
  }

  private intern(key: string, candidate: LogicExpr): LogicExpr {
    const existing = this.interned.get(key)
    if (existing !== undefined) return existing
    const frozen = Object.freeze(candidate)
    this.interned.set(key, frozen)
    this.keys.set(frozen, key)
    return frozen
  }
}

/** Convenience factory, so callers do not have to write `new`. */
export function createExprBuilder(): ExprBuilder {
  return new ExprBuilder()
}
