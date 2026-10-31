import { describe, expect, it } from 'vitest'
import { createExprBuilder } from './logic/builder'
import { isConst, isVar, type LogicExpr } from './logic/expr'
import {
  assignmentOf,
  evaluate,
  hasIndependentChildren,
  isFullyIndependent,
  nodeCount,
  sharedComponents,
  structuralEquals,
  variablesOf,
} from './logic/inspect'
import { asComponentId } from './ids'
import { SENSOR, VALVE_A, VALVE_B } from './fixtures'

describe('expression builder', () => {
  it('hands out one shared node per component identity', () => {
    const b = createExprBuilder()
    expect(b.var(SENSOR)).toBe(b.var(SENSOR))
    expect(b.var(SENSOR)).not.toBe(b.var(VALVE_A))
  })

  it('interns structurally equal expressions regardless of argument order', () => {
    const b = createExprBuilder()
    const left = b.and([b.var(SENSOR), b.var(VALVE_A)])
    const right = b.and([b.var(VALVE_A), b.var(SENSOR)])
    expect(left).toBe(right)
  })

  it('flattens nested connectives of the same kind', () => {
    const b = createExprBuilder()
    const nested = b.or([b.var(SENSOR), b.or([b.var(VALVE_A), b.var(VALVE_B)])])
    const flat = b.or([b.var(SENSOR), b.var(VALVE_A), b.var(VALVE_B)])
    expect(nested).toBe(flat)
  })

  it('collapses two occurrences of one identity (idempotence)', () => {
    const b = createExprBuilder()
    // A 1oo2 structure built from the SAME component is not redundancy at all: both
    // branches fail together, so the expression reduces to that single component.
    const sameTwice = b.and([b.var(SENSOR), b.var(SENSOR)])
    expect(sameTwice).toBe(b.var(SENSOR))

    // With two distinct identities it stays a real AND.
    const genuine = b.and([b.var(VALVE_A), b.var(VALVE_B)])
    expect(genuine).not.toBe(b.var(VALVE_A))
    expect(variablesOf(genuine)).toEqual([VALVE_A, VALVE_B].sort())
  })

  it('folds neutral and absorbing constants', () => {
    const b = createExprBuilder()
    expect(b.and([b.var(SENSOR), b.TRUE])).toBe(b.var(SENSOR))
    expect(b.or([b.var(SENSOR), b.FALSE])).toBe(b.var(SENSOR))
    expect(b.and([b.var(SENSOR), b.FALSE])).toBe(b.FALSE)
    expect(b.or([b.var(SENSOR), b.TRUE])).toBe(b.TRUE)
    expect(isConst(b.and([]))).toBe(true)
    expect(b.and([])).toBe(b.TRUE)
    expect(b.or([])).toBe(b.FALSE)
  })

  it('keeps expressions apart when an id contains key separators', () => {
    // Ids are arbitrary strings after an import. A key built by joining parts with a
    // separator would let these two expressions collide, and interning would then hand
    // back the wrong node — changing the system's logic silently.
    const b = createExprBuilder()
    const plain = b.and([
      b.var(asComponentId('a')),
      b.var(asComponentId('b')),
      b.var(asComponentId('c')),
    ])
    const crafted = b.and([b.var(asComponentId('a|v:b')), b.var(asComponentId('c'))])

    expect(plain).not.toBe(crafted)
    expect(variablesOf(crafted)).toEqual(['a|v:b', 'c'])
    expect(evaluate(crafted, assignmentOf({ 'a|v:b': true, c: true }))).toBe(true)
    expect(evaluate(plain, assignmentOf({ 'a|v:b': true, c: true }))).toBe(false)
  })

  it('keeps expressions apart when an id contains quotes or backslashes', () => {
    const b = createExprBuilder()
    const first = b.and([b.var(asComponentId('x"y')), b.var(asComponentId('z'))])
    const second = b.and([b.var(asComponentId('x')), b.var(asComponentId('y"z'))])

    expect(first).not.toBe(second)
    expect(b.var(asComponentId('a\\b'))).not.toBe(b.var(asComponentId('a\\\\b')))
  })

  it('keeps keys compact for a long alternating DAG and shares rebuilt subexpressions', () => {
    const b = createExprBuilder()
    const start = b.var(asComponentId('start'))
    let expr = start
    const nodes: LogicExpr[] = [start]
    const gates: LogicExpr[] = []
    const inputs: LogicExpr[] = []
    const depth = 1024
    for (let i = 0; i < depth; i++) {
      const next = b.var(asComponentId(`c${i}|"\\`))
      inputs.push(next)
      expr = i % 2 ? b.or([expr, next]) : b.and([expr, next])
      // Fail early if recursive JSON escaping returns, before constructing a huge key.
      expect(b.keyOf(expr).length).toBeLessThan(64)
      gates.push(expr)
      nodes.push(next, expr)
    }
    expect(nodeCount(expr)).toBe(2 * depth + 1)
    const keys = nodes.map((node) => b.keyOf(node))
    expect(new Set(keys).size).toBe(nodes.length)
    // Bound every stored signature, not just the root or wall-clock runtime.
    // A two-input gate's signature must not grow with the depth of its children.
    expect(Math.max(...keys.map((key) => key.length))).toBeLessThan(64)
    expect(keys.reduce((total, key) => total + key.length, 0)).toBeLessThan(nodes.length * 64)
    let rebuilt = start
    inputs.forEach((next, i) => {
      rebuilt = i % 2 ? b.or([next, rebuilt, next]) : b.and([next, rebuilt, next])
      expect(rebuilt).toBe(gates[i])
    })
    expect(rebuilt).toBe(expr)
  })

  it('rejects expressions from a different builder', () => {
    const a = createExprBuilder()
    const b = createExprBuilder()
    expect(() => a.keyOf(b.var(SENSOR))).toThrow(/not built by this ExprBuilder/)
  })
})

describe('independence analysis', () => {
  /** TOP = (sensor AND valveA) OR (sensor AND valveB) — the sensor is shared. */
  function sharedSensorExpr() {
    const b = createExprBuilder()
    const branchA = b.and([b.var(SENSOR), b.var(VALVE_A)])
    const branchB = b.and([b.var(SENSOR), b.var(VALVE_B)])
    return { b, top: b.or([branchA, branchB]), branchA, branchB }
  }

  it('finds the component that breaks independence', () => {
    const { top } = sharedSensorExpr()
    expect(sharedComponents(top)).toEqual([SENSOR])
    expect(isFullyIndependent(top)).toBe(false)
    expect(hasIndependentChildren(top)).toBe(false)
  })

  it('reports full independence when no identity is shared', () => {
    const b = createExprBuilder()
    const top = b.or([b.and([b.var(SENSOR), b.var(VALVE_A)]), b.var(VALVE_B)])
    expect(sharedComponents(top)).toEqual([])
    expect(isFullyIndependent(top)).toBe(true)
    expect(hasIndependentChildren(top)).toBe(true)
  })

  it('counts the shared variable node only once in the DAG', () => {
    const { top } = sharedSensorExpr()
    // sensor, valveA, valveB, and-a, and-b, top = 6 — the sensor is NOT duplicated.
    expect(nodeCount(top)).toBe(6)
    expect(variablesOf(top)).toHaveLength(3)
  })
})

describe('evaluation', () => {
  it('matches the full truth table of a 1oo2 structure', () => {
    const b = createExprBuilder()
    // System fails only when both independent valves have failed.
    const top = b.and([b.var(VALVE_A), b.var(VALVE_B)])

    const cases: [boolean, boolean, boolean][] = [
      [false, false, false],
      [true, false, false],
      [false, true, false],
      [true, true, true],
    ]

    for (const [a, c, expected] of cases) {
      const failed = assignmentOf({ [VALVE_A]: a, [VALVE_B]: c })
      expect(evaluate(top, failed)).toBe(expected)
    }
  })

  it('propagates a shared identity into both branches at once', () => {
    const b = createExprBuilder()
    const top = b.or([
      b.and([b.var(SENSOR), b.var(VALVE_A)]),
      b.and([b.var(SENSOR), b.var(VALVE_B)]),
    ])

    // Valves alone never bring the system down: the sensor is in series with both.
    expect(evaluate(top, assignmentOf({ [VALVE_A]: true, [VALVE_B]: true }))).toBe(false)
    // Sensor alone is not enough either — it needs one valve with it.
    expect(evaluate(top, assignmentOf({ [SENSOR]: true }))).toBe(false)
    expect(evaluate(top, assignmentOf({ [SENSOR]: true, [VALVE_A]: true }))).toBe(true)
  })

  it('evaluates variables and constants directly', () => {
    const b = createExprBuilder()
    expect(isVar(b.var(SENSOR))).toBe(true)
    expect(evaluate(b.var(SENSOR), assignmentOf({ [SENSOR]: true }))).toBe(true)
    expect(evaluate(b.TRUE, new Set())).toBe(true)
    expect(evaluate(b.FALSE, new Set())).toBe(false)
  })
})

describe('structural equality', () => {
  it('matches equal structures built by different builders', () => {
    const a = createExprBuilder()
    const b = createExprBuilder()
    const left = a.and([a.var(SENSOR), a.or([a.var(VALVE_A), a.var(VALVE_B)])])
    const right = b.and([b.or([b.var(VALVE_B), b.var(VALVE_A)]), b.var(SENSOR)])

    expect(left).not.toBe(right)
    expect(structuralEquals(left, right)).toBe(true)
  })

  it('separates different structures', () => {
    const b = createExprBuilder()
    const and = b.and([b.var(VALVE_A), b.var(VALVE_B)])
    const or = b.or([b.var(VALVE_A), b.var(VALVE_B)])
    expect(structuralEquals(and, or)).toBe(false)
  })
})
