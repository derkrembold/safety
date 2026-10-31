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
 * constants are folded away, and children are sorted by their builder-local node ID so argument
 * order does not matter. Absorption (`x AND (x OR y) = x`) is deliberately *not* applied
 * — full canonicalisation is the ROBDD's job in issue #6.
 *
 * Interning keys are JSON-encoded tuples. Variables encode their component ID once;
 * connectives encode only sorted builder-local child IDs, never whole child keys.
 * This keeps key storage proportional to component-ID lengths and DAG edges (with
 * logarithmic-width node IDs), rather than exponentially escaping nested JSON strings.
 * Structured tuples keep arbitrary imported component IDs collision-free. Child IDs and
 * connective keys are local to this builder; they are not a portable structural hash.
 */
export class ExprBuilder {
  private readonly interned = new Map<string, LogicExpr>()
  private readonly nodes = new WeakMap<LogicExpr, { id: number; key: string }>()

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

  /** The interning key, valid only within this builder (not across builders). */
  keyOf(expr: LogicExpr): string {
    return this.nodeOf(expr).key
  }

  private nodeOf(expr: LogicExpr): { id: number; key: string } {
    const node = this.nodes.get(expr)
    if (node === undefined) {
      throw new Error('Expression was not built by this ExprBuilder')
    }
    return node
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

    const byId = new Map<number, LogicExpr>()
    for (const child of flattened) {
      byId.set(this.nodeOf(child).id, child)
    }

    const sortedIds = [...byId.keys()].sort((a, b) => a - b)
    if (sortedIds.length === 0) return this.constant(neutral)

    const first = sortedIds[0]
    if (sortedIds.length === 1 && first !== undefined) {
      const only = byId.get(first)
      if (only !== undefined) return only
    }

    const sorted = sortedIds.map((key) => byId.get(key) as LogicExpr)
    return this.intern(JSON.stringify([kind, sortedIds]), {
      kind,
      children: sorted,
    } as LogicExpr)
  }

  private intern(key: string, candidate: LogicExpr): LogicExpr {
    const existing = this.interned.get(key)
    if (existing !== undefined) return existing
    const frozen = Object.freeze(candidate)
    this.interned.set(key, frozen)
    this.nodes.set(frozen, { id: this.interned.size, key })
    return frozen
  }
}

/** Convenience factory, so callers do not have to write `new`. */
export function createExprBuilder(): ExprBuilder {
  return new ExprBuilder()
}
