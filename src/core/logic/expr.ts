import type { ComponentId } from '../ids'

/**
 * Representation-independent logic: the one semantic core all three tabs share.
 *
 * ## Sign convention (fixed once, relied on everywhere)
 *
 * - a variable is `true`  <=>  that component **has failed**
 * - an expression is `true`  <=>  the **system has failed** (the TOP event occurred)
 *
 * The fault tree maps straight onto this (AND/OR as drawn) and the BDD matches too,
 * because its terminal `1` means *fail*. The **reliability block diagram has to
 * dualise**: a series structure fails if *any* block fails (OR), a parallel structure
 * fails only if *all* of its blocks fail (AND).
 *
 * ## Monotonicity
 *
 * There is no `not` constructor, so every expression built from `var`/`and`/`or` is
 * monotone by construction. The monotonicity *check* demanded in `Konzept.md` is only
 * needed when importing a hand-built BDD, where swapping the two terminal stubs negates
 * a branch without any NOT gate being involved.
 *
 * ## Sharing
 *
 * Expressions form a DAG, not a tree: {@link ExprBuilder} hands out one single node per
 * component identity and interns structurally equal sub-expressions. That keeps a shared
 * component visible as a shared node, which is the precondition for computing correct
 * system probabilities over the BDD (issue #6).
 */
export type LogicExpr = LogicVar | LogicAnd | LogicOr | LogicConst

export interface LogicVar {
  readonly kind: 'var'
  readonly component: ComponentId
}

export interface LogicAnd {
  readonly kind: 'and'
  readonly children: readonly LogicExpr[]
}

export interface LogicOr {
  readonly kind: 'or'
  readonly children: readonly LogicExpr[]
}

export interface LogicConst {
  readonly kind: 'const'
  readonly value: boolean
}

export const isVar = (expr: LogicExpr): expr is LogicVar => expr.kind === 'var'
export const isAnd = (expr: LogicExpr): expr is LogicAnd => expr.kind === 'and'
export const isOr = (expr: LogicExpr): expr is LogicOr => expr.kind === 'or'
export const isConst = (expr: LogicExpr): expr is LogicConst => expr.kind === 'const'

/** Children of a connective; the empty list for variables and constants. */
export function childrenOf(expr: LogicExpr): readonly LogicExpr[] {
  return isAnd(expr) || isOr(expr) ? expr.children : []
}
