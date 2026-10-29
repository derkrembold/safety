import type { DiagramDocument } from '../diagram'
import { dictGet } from '../dict'
import type { ComponentId } from '../ids'
import type { LogicExpr } from '../logic/expr'
import type { ComponentRegistry } from '../registry'
import { validateComponentRefs, validateGraphStructure } from '../validation'
import { buildBdd } from './build'
import type { Bdd, BddBuildOptions } from './types'
import { BddError } from './types'

/** Structural adapter for the editor's element classes; no dependency on its UI. */
export interface FaultTreeElementLike {
  readonly id: string
  readonly kind: string
  readonly nodes: readonly FaultTreeElementLike[]
}

function gateKind(kind: string): 'var' | 'and' | 'or' {
  switch (kind) {
    case 'basicEvent': case 'standardeingang': return 'var'
    case 'and': case 'und': return 'and'
    case 'or': case 'oder': return 'or'
    default: throw new BddError(`Unsupported fault-tree kind: ${kind}`)
  }
}

/**
 * Component identity is explicit: labels and element IDs are NOT identities.
 * Map multiple editor occurrences to the same ComponentId to model a shared part.
 */
export function buildBddFromElements(
  root: FaultTreeElementLike,
  componentByNode: ReadonlyMap<string, ComponentId>,
  options: BddBuildOptions = {},
): Bdd {
  const expressions = new Map<FaultTreeElementLike, LogicExpr>()
  const seenIds = new Map<string, FaultTreeElementLike>()
  const visiting = new Set<FaultTreeElementLike>()
  const variables = new Map<ComponentId, LogicExpr>()
  const stack = [{ node: root, expanded: false }]
  while (stack.length) {
    const { node, expanded } = stack.pop()!
    if (expressions.has(node)) continue
    const kind = gateKind(node.kind)
    if (expanded) {
      visiting.delete(node)
      expressions.set(node, { kind: kind as 'and' | 'or', children: node.nodes.map(child => expressions.get(child)!) })
      continue
    }
    if (visiting.has(node)) throw new BddError(`Cycle in fault tree at ${node.id}.`)
    if (seenIds.has(node.id) && seenIds.get(node.id) !== node) throw new BddError(`Duplicate node ID: ${node.id}`)
    seenIds.set(node.id, node)
    if (kind === 'var') {
      const component = componentByNode.get(node.id)
      if (component === undefined) throw new BddError(`Missing component identity for ${node.id}.`)
      if (node.nodes.length) throw new BddError(`Basic event ${node.id} cannot have inputs.`)
      if (!variables.has(component)) variables.set(component, { kind: 'var', component })
      expressions.set(node, variables.get(component)!)
    } else {
      if (!node.nodes.length) throw new BddError(`Gate ${node.id} has no inputs.`)
      visiting.add(node)
      stack.push({ node, expanded: true })
      for (let i = node.nodes.length - 1; i >= 0; i--) stack.push({ node: node.nodes[i], expanded: false })
    }
  }
  return buildBdd(expressions.get(root)!, options)
}

/** Shared core format: a fault-tree edge goes from a parent gate to its input. */
export function buildBddFromDiagram(
  diagram: DiagramDocument,
  registry: ComponentRegistry,
  options: BddBuildOptions = {},
): Bdd {
  const issues = [...validateGraphStructure(diagram), ...validateComponentRefs(diagram, registry)]
  if (issues.length) throw new BddError(issues.map(issue => issue.message).join('\n'))
  const nodes = new Map<string, FaultTreeElementLike>()
  const children = new Map<string, FaultTreeElementLike[]>()
  const componentByNode = new Map<string, ComponentId>()
  for (const [id, node] of Object.entries(diagram.nodes)) {
    if (node.id !== id) throw new BddError(`Node key does not match its ID: ${id}`)
    const inputs: FaultTreeElementLike[] = []
    children.set(id, inputs)
    nodes.set(id, { id, kind: node.kind, nodes: inputs })
    if (node.componentRef !== undefined) {
      if (gateKind(node.kind) !== 'var') throw new BddError(`Gate ${id} cannot reference a component.`)
      const component = dictGet(registry, node.componentRef)
      if (component?.id !== node.componentRef) throw new BddError(`Inconsistent component identity: ${node.componentRef}`)
      componentByNode.set(id, node.componentRef)
    }
  }
  const hasParent = new Set<string>()
  for (const edge of diagram.edges) {
    children.get(edge.from)!.push(nodes.get(edge.to)!)
    hasParent.add(edge.to)
  }
  const roots = [...nodes.values()].filter(node => !hasParent.has(node.id))
  if (roots.length !== 1) throw new BddError('A complete fault tree must have exactly one TOP event.')
  return buildBddFromElements(roots[0], componentByNode, options)
}
