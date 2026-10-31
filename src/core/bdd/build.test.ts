import { describe, expect, it } from 'vitest'
import { asComponentId } from '../ids'
import { createExprBuilder } from '../logic/builder'
import type { LogicExpr } from '../logic/expr'
import { evaluate } from '../logic/inspect'
import { buildBdd } from './build'
import { bddFailureProbability } from './probability'

const a = asComponentId('a')
const b = asComponentId('b')
const c = asComponentId('c')

describe('ROBDD construction', () => {
  it('builds an alternating expression with compact interning references', () => {
    const builder = createExprBuilder()
    const inputs = Array.from({ length: 65 }, (_, i) => asComponentId(`chain-${i}`))
    let expr = builder.var(inputs[0])
    let expected = 0.5
    for (let i = 1; i < inputs.length; i++) {
      const next = builder.var(inputs[i])
      expr = i % 2 ? builder.and([expr, next]) : builder.or([expr, next])
      expected = i % 2 ? expected * 0.5 : expected + (1 - expected) * 0.5
    }
    const graph = buildBdd(expr, { variableOrder: inputs })
    expect(bddFailureProbability(graph, new Map(inputs.map((id) => [id, 0.5])))).toBeCloseTo(expected, 14)
    expect(graph.nodes.length).toBeLessThanOrEqual(inputs.length + 2)
  })

  it('uses terminals 0 = success and 1 = failure', () => {
    const builder = createExprBuilder()
    expect(buildBdd(builder.FALSE).root).toBe(0)
    expect(buildBdd(builder.TRUE).root).toBe(1)
    const graph = buildBdd(builder.var(a))
    expect(graph.nodes[graph.root]).toEqual({ kind: 'decision', component: a, low: 0, high: 1 })
  })

  it('reduces duplicate variables, equal branches and unused intermediate nodes', () => {
    const builder = createExprBuilder()
    const x = builder.var(a)
    const graph = buildBdd(builder.and([x, builder.or([x, builder.var(b)])]))
    expect(graph.nodes).toHaveLength(3)
    expect(graph.nodes[graph.root]).toEqual({ kind: 'decision', component: a, low: 0, high: 1 })
    // The eliminated variable needs no probability.
    expect(bddFailureProbability(graph, new Map([[a, 0.2]]))).toBe(0.2)
  })

  it('preserves a shared component without treating its branches as independent', () => {
    const builder = createExprBuilder()
    const graph = buildBdd(builder.or([
      builder.and([builder.var(a), builder.var(b)]),
      builder.and([builder.var(a), builder.var(c)]),
    ]))
    const result = bddFailureProbability(graph, new Map([[a, 0.1], [b, 0.2], [c, 0.3]]))
    expect(result).toBeCloseTo(0.1 * (0.2 + 0.3 - 0.2 * 0.3), 14)
    expect(result).not.toBeCloseTo(1 - (1 - 0.1 * 0.2) * (1 - 0.1 * 0.3), 5)
  })

  it('satisfies ordering, unique-table and reachability invariants', () => {
    const builder = createExprBuilder()
    const graph = buildBdd(builder.or([
      builder.and([builder.var(a), builder.var(b)]),
      builder.and([builder.var(a), builder.var(c)]),
    ]), { variableOrder: [c, a, b] })
    const ranks = new Map(graph.variableOrder.map((id, index) => [id, index]))
    const unique = new Set<string>()
    const reachable = new Set([0, 1])
    const pending = [graph.root]
    while (pending.length) {
      const id = pending.pop()!
      if (reachable.has(id)) continue
      reachable.add(id)
      const node = graph.nodes[id]
      if (node.kind === 'decision') pending.push(node.low, node.high)
    }
    expect(reachable.size).toBe(graph.nodes.length)
    graph.nodes.forEach((node, id) => {
      if (node.kind !== 'decision') return
      expect(node.low).not.toBe(node.high)
      const key = JSON.stringify([node.component, node.low, node.high])
      expect(unique.has(key)).toBe(false)
      unique.add(key)
      for (const child of [node.low, node.high]) {
        expect(child).toBeLessThan(id)
        const successor = graph.nodes[child]
        if (successor.kind === 'decision') expect(ranks.get(successor.component)!).toBeGreaterThan(ranks.get(node.component)!)
      }
    })
  })

  it('matches exhaustive truth tables and independent weighted enumeration', () => {
    const builder = createExprBuilder()
    const ids = [a, b, c, asComponentId('d')]
    let state = 421
    const random = () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state }
    const expression = (depth: number): LogicExpr => depth === 0 ? builder.var(ids[random() % ids.length])
      : random() % 2 ? builder.and([expression(depth - 1), expression(depth - 1)])
        : builder.or([expression(depth - 1), expression(depth - 1)])
    const qs = [0.01, 0.2, 0.35, 0.9]
    for (let trial = 0; trial < 30; trial++) {
      const expr = expression(3)
      for (const variableOrder of [ids, [...ids].reverse()]) {
        const used = new Set<string>()
        const collect = (node: LogicExpr) => {
          if (node.kind === 'var') used.add(node.component)
          else if (node.kind !== 'const') node.children.forEach(collect)
        }
        collect(expr)
        const graph = buildBdd(expr, { variableOrder: variableOrder.filter(id => used.has(id)) })
        let expected = 0
        for (let bits = 0; bits < 16; bits++) {
          const failed = new Set(ids.filter((_, i) => bits & (1 << i)))
          const truth = evaluate(expr, failed)
          expect(bddFailureProbability(graph, new Map(ids.map(id => [id, failed.has(id) ? 1 : 0])))).toBe(Number(truth))
          if (truth) expected += qs.reduce((weight, q, i) => weight * (bits & (1 << i) ? q : 1 - q), 1)
        }
        expect(bddFailureProbability(graph, new Map(ids.map((id, i) => [id, qs[i]])))).toBeCloseTo(expected, 13)
      }
    }
  })

  it('handles deep logic iteratively', () => {
    let expr: LogicExpr = { kind: 'var', component: a }
    for (let i = 0; i < 12_000; i++) expr = { kind: i % 2 ? 'and' : 'or', children: [expr, { kind: 'var', component: a }] }
    expect(buildBdd(expr).nodes).toHaveLength(3)
  })

  it('builds large flat gates without a quadratic temporary-node explosion', () => {
    const builder = createExprBuilder()
    const variables = Array.from({ length: 2000 }, (_, i) => builder.var(asComponentId(`c-${String(i).padStart(4, '0')}`)))
    const graph = buildBdd(builder.and(variables), { maxNodes: 30_000 })
    expect(graph.nodes).toHaveLength(2002)
  })

  it('rejects cycles, incomplete/duplicate orders and invalid node budgets', () => {
    const cyclic: { kind: 'and'; children: LogicExpr[] } = { kind: 'and', children: [] }
    cyclic.children.push(cyclic)
    expect(() => buildBdd(cyclic)).toThrow(/cycle/)
    const expr = createExprBuilder().var(a)
    for (const variableOrder of [[], [a, a], [b], [a, b]]) expect(() => buildBdd(expr, { variableOrder })).toThrow(/order/)
    expect(() => buildBdd(expr, { maxNodes: 2 })).toThrow(/limit/)
    expect(() => buildBdd(expr, { maxNodes: NaN })).toThrow(/maxNodes/)
  })

  it('does not mutate its input and returns frozen results', () => {
    const builder = createExprBuilder()
    const expr = builder.and([builder.var(a), builder.var(b)])
    const before = JSON.stringify(expr)
    const graph = buildBdd(expr)
    expect(JSON.stringify(expr)).toBe(before)
    expect(Object.isFrozen(graph)).toBe(true)
    expect(Object.isFrozen(graph.nodes)).toBe(true)
    expect(graph.nodes.every(Object.isFrozen)).toBe(true)
  })
})
