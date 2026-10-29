import type { ComponentId } from '../ids'
import type { LogicExpr } from '../logic/expr'
import { childrenOf } from '../logic/expr'
import type { Bdd, BddBuildOptions, BddNode } from './types'
import { BddError } from './types'

type Operation = 'and' | 'or'
interface Pair { a: number; b: number; expanded?: boolean }

/** Iterative postorder also rejects cycles in externally assembled logic objects. */
function postorder(root: LogicExpr): LogicExpr[] {
  const result: LogicExpr[] = []
  const state = new Map<LogicExpr, number>()
  const stack: { expr: LogicExpr; expanded: boolean }[] = [{ expr: root, expanded: false }]
  while (stack.length) {
    const { expr, expanded } = stack.pop()!
    if (expanded) { state.set(expr, 2); result.push(expr); continue }
    if (state.get(expr) === 2) continue
    if (state.get(expr) === 1) throw new BddError('The logic expression contains a cycle.')
    if (!['var', 'const', 'and', 'or'].includes(expr.kind)) throw new BddError('Unsupported logic node.')
    state.set(expr, 1)
    stack.push({ expr, expanded: true })
    const children = childrenOf(expr)
    for (let i = children.length - 1; i >= 0; i--) stack.push({ expr: children[i], expanded: false })
  }
  return result
}

/**
 * Shannon apply with memoisation and a unique table. Keys contain only integer
 * node/rank IDs, never separator-joined component names. No truth-table expansion.
 */
class Manager {
  readonly nodes: BddNode[] = [{ kind: 'terminal', value: 0 }, { kind: 'terminal', value: 1 }]
  private readonly unique = new Map<string, number>()
  private readonly memo = new Map<string, number>()
  private readonly ranks: Map<ComponentId, number>
  private readonly limit: number
  readonly order: readonly ComponentId[]

  constructor(order: readonly ComponentId[], limit: number) {
    this.order = order
    this.ranks = new Map(order.map((id, rank) => [id, rank]))
    this.limit = limit
  }

  rank(id: number): number {
    const node = this.nodes[id]
    return node.kind === 'terminal' ? Infinity : this.ranks.get(node.component)!
  }

  make(rank: number, low: number, high: number): number {
    if (low === high) return low
    const key = `${rank}:${low}:${high}`
    const existing = this.unique.get(key)
    if (existing !== undefined) return existing
    if (this.nodes.length >= this.limit) throw new BddError(`BDD node limit (${this.limit}) exceeded.`)
    const id = this.nodes.length
    this.nodes.push({ kind: 'decision', component: this.order[rank], low, high })
    this.unique.set(key, id)
    return id
  }

  variable(component: ComponentId): number { return this.make(this.ranks.get(component)!, 0, 1) }

  apply(op: Operation, left: number, right: number): number {
    const keyOf = (a: number, b: number) => `${op}:${Math.min(a, b)}:${Math.max(a, b)}`
    const rootKey = keyOf(left, right)
    const stack: Pair[] = [{ a: left, b: right }]
    while (stack.length) {
      const { a, b, expanded } = stack.pop()!
      const key = keyOf(a, b)
      if (this.memo.has(key)) continue
      const absorbing = op === 'and' ? 0 : 1
      const neutral = 1 - absorbing
      if (a === b) { this.memo.set(key, a); continue }
      if (a === absorbing || b === absorbing) { this.memo.set(key, absorbing); continue }
      if (a === neutral || b === neutral) { this.memo.set(key, a === neutral ? b : a); continue }

      const rank = Math.min(this.rank(a), this.rank(b))
      const aNode = this.nodes[a]
      const bNode = this.nodes[b]
      const aLow = this.rank(a) === rank && aNode.kind === 'decision' ? aNode.low : a
      const aHigh = this.rank(a) === rank && aNode.kind === 'decision' ? aNode.high : a
      const bLow = this.rank(b) === rank && bNode.kind === 'decision' ? bNode.low : b
      const bHigh = this.rank(b) === rank && bNode.kind === 'decision' ? bNode.high : b
      if (expanded) {
        this.memo.set(key, this.make(rank, this.memo.get(keyOf(aLow, bLow))!, this.memo.get(keyOf(aHigh, bHigh))!))
      } else {
        stack.push({ a, b, expanded: true }, { a: aHigh, b: bHigh }, { a: aLow, b: bLow })
      }
    }
    return this.memo.get(rootKey)!
  }

  finish(root: number): Bdd {
    const reachable = new Set<number>([0, 1])
    const pending = [root]
    while (pending.length) {
      const id = pending.pop()!
      if (reachable.has(id)) continue
      reachable.add(id)
      const node = this.nodes[id]
      if (node.kind === 'decision') pending.push(node.low, node.high)
    }
    const ids = [...reachable].sort((a, b) => a - b)
    const remap = new Map(ids.map((id, index) => [id, index]))
    const nodes = ids.map(id => {
      const node = this.nodes[id]
      return Object.freeze(node.kind === 'terminal' ? { ...node } : {
        ...node, low: remap.get(node.low)!, high: remap.get(node.high)!,
      })
    })
    return Object.freeze({ root: remap.get(root)!, nodes: Object.freeze(nodes), variableOrder: Object.freeze([...this.order]) })
  }
}

export function buildBdd(expression: LogicExpr, options: BddBuildOptions = {}): Bdd {
  const expressions = postorder(expression)
  const used = new Set(expressions.filter(expr => expr.kind === 'var').map(expr => expr.component))
  const order = options.variableOrder ? [...options.variableOrder] : [...used].sort()
  if (new Set(order).size !== order.length || order.length !== used.size || order.some(id => !used.has(id))) {
    throw new BddError('The variable order must contain each referenced component exactly once.')
  }
  const limit = options.maxNodes ?? 100_000
  if (!Number.isSafeInteger(limit) || limit < 2) throw new BddError('maxNodes must be an integer >= 2.')
  const manager = new Manager(order, limit)
  const compiled = new Map<LogicExpr, number>()
  for (const expr of expressions) {
    if (expr.kind === 'var') compiled.set(expr, manager.variable(expr.component))
    else if (expr.kind === 'const') compiled.set(expr, expr.value ? 1 : 0)
    else {
      // A left fold repeatedly copies a growing ordered prefix (quadratic even
      // for a simple large AND). Balanced application bounds that intermediate work.
      let layer = expr.children.map(child => compiled.get(child)!)
      while (layer.length > 1) {
        const next: number[] = []
        for (let i = 0; i < layer.length; i += 2) {
          next.push(i + 1 < layer.length ? manager.apply(expr.kind, layer[i], layer[i + 1]) : layer[i])
        }
        layer = next
      }
      compiled.set(expr, layer[0] ?? (expr.kind === 'and' ? 1 : 0))
    }
  }
  return manager.finish(compiled.get(expression)!)
}
