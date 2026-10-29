import type { DiagramDocument, TabId } from './diagram'
import { TAB_IDS, listNodes, rootNodes } from './diagram'
import type { ComponentId, EdgeId, NodeId } from './ids'
import type { Project, ProjectParameters } from './project'
import { orphanedComponents } from './project'
import type { ComponentDefinition } from './component'
import { dictGet, dictHas } from './dict'
import type { ComponentRegistry } from './registry'

export type Severity = 'error' | 'warning'

export type ValidationCode =
  | 'UNKNOWN_COMPONENT_REF'
  | 'INVALID_FAILURE_RATE'
  | 'MISSING_REPAIR_RATE'
  | 'INVALID_REPAIR_RATE'
  | 'INVALID_MISSION_TIME'
  | 'INVALID_TEST_INTERVAL'
  | 'DANGLING_EDGE'
  | 'CYCLE_DETECTED'
  | 'NO_ROOT'
  | 'MULTIPLE_ROOTS'
  | 'ORPHANED_COMPONENT'

/**
 * One finding of a validation pass.
 *
 * `componentIds` and `nodeIds` are carried explicitly so the UI can highlight the
 * offending elements and so the debug log export (issue #7) can record which components
 * an action or failure concerned.
 */
export interface ValidationIssue {
  readonly severity: Severity
  readonly code: ValidationCode
  readonly message: string
  readonly tab?: TabId
  readonly nodeIds?: readonly NodeId[]
  readonly edgeIds?: readonly EdgeId[]
  readonly componentIds?: readonly ComponentId[]
}

export function hasErrors(issues: readonly ValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === 'error')
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

export function validateComponent(component: ComponentDefinition): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (!isPositiveFinite(component.failureRate)) {
    issues.push({
      severity: 'error',
      code: 'INVALID_FAILURE_RATE',
      message: `Component "${component.name}" needs a finite, positive failure rate.`,
      componentIds: [component.id],
    })
  }

  if (component.repairRate === undefined) {
    issues.push({
      severity: 'warning',
      code: 'MISSING_REPAIR_RATE',
      message: `Component "${component.name}" has no repair rate, so availability cannot be computed.`,
      componentIds: [component.id],
    })
  } else if (!isPositiveFinite(component.repairRate)) {
    issues.push({
      severity: 'error',
      code: 'INVALID_REPAIR_RATE',
      message: `Component "${component.name}" needs a finite, positive repair rate.`,
      componentIds: [component.id],
    })
  }

  return issues
}

export function validateParameters(parameters: ProjectParameters): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (!isPositiveFinite(parameters.missionTimeHours)) {
    issues.push({
      severity: 'error',
      code: 'INVALID_MISSION_TIME',
      message: 'Mission time t must be a finite, positive number of hours.',
    })
  }
  if (!isPositiveFinite(parameters.testIntervalHours)) {
    issues.push({
      severity: 'error',
      code: 'INVALID_TEST_INTERVAL',
      message: 'Test interval tau must be a finite, positive number of hours.',
    })
  }

  return issues
}

/** Checks that every occurrence points at a component identity that actually exists. */
export function validateComponentRefs(
  diagram: DiagramDocument,
  registry: ComponentRegistry,
  tab?: TabId,
): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = []

  for (const node of listNodes(diagram)) {
    const ref = node.componentRef
    if (ref === undefined) continue
    if (!dictHas(registry, ref)) {
      issues.push({
        severity: 'error',
        code: 'UNKNOWN_COMPONENT_REF',
        message: `Node ${node.id} references unknown component identity ${ref}.`,
        ...(tab === undefined ? {} : { tab }),
        nodeIds: [node.id],
        componentIds: [ref],
      })
    }
  }

  return issues
}

/**
 * Generic graph checks shared by all three tabs: no edges into the void, no cycles, and
 * exactly one root (the fault tree's TOP, the block diagram's start).
 *
 * The representation-specific rules — which gate may have how many inputs, two labelled
 * BDD terminals, a consistent variable order — belong to the individual editors
 * (issues #2/#3/#4) and build on these primitives.
 */
export function validateGraphStructure(
  diagram: DiagramDocument,
  tab?: TabId,
): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const tabInfo = tab === undefined ? {} : { tab }

  for (const edge of diagram.edges) {
    const missing: NodeId[] = []
    if (!dictHas(diagram.nodes, edge.from)) missing.push(edge.from)
    if (!dictHas(diagram.nodes, edge.to)) missing.push(edge.to)
    if (missing.length > 0) {
      issues.push({
        severity: 'error',
        code: 'DANGLING_EDGE',
        message: `Edge ${edge.id} refers to nodes that do not exist in this diagram.`,
        ...tabInfo,
        nodeIds: missing,
        edgeIds: [edge.id],
      })
    }
  }

  const cycle = findCycle(diagram)
  if (cycle !== undefined) {
    issues.push({
      severity: 'error',
      code: 'CYCLE_DETECTED',
      message: `The diagram contains a cycle: ${cycle.join(' -> ')}.`,
      ...tabInfo,
      nodeIds: cycle,
    })
  }

  const nodes = listNodes(diagram)
  if (nodes.length > 0 && cycle === undefined) {
    const roots = rootNodes(diagram)
    if (roots.length === 0) {
      issues.push({
        severity: 'error',
        code: 'NO_ROOT',
        message: 'The diagram has no root node (no TOP event, respectively no start).',
        ...tabInfo,
      })
    } else if (roots.length > 1) {
      issues.push({
        severity: 'error',
        code: 'MULTIPLE_ROOTS',
        message: `The diagram has ${roots.length} root nodes, but exactly one is required.`,
        ...tabInfo,
        nodeIds: roots.map((node) => node.id),
      })
    }
  }

  return issues
}

/**
 * Returns one cycle as a node path, or undefined when the diagram is acyclic.
 * Iterative depth-first search with a grey/black colouring, so deep diagrams cannot
 * blow the call stack.
 */
export function findCycle(diagram: DiagramDocument): readonly NodeId[] | undefined {
  const successors = new Map<string, NodeId[]>()
  for (const edge of diagram.edges) {
    if (!dictHas(diagram.nodes, edge.from) || !dictHas(diagram.nodes, edge.to)) continue
    const list = successors.get(edge.from)
    if (list === undefined) successors.set(edge.from, [edge.to])
    else list.push(edge.to)
  }

  const done = new Set<string>()
  const onPath = new Set<string>()
  const path: NodeId[] = []

  for (const start of Object.keys(diagram.nodes)) {
    if (done.has(start)) continue

    const stack: { node: NodeId; next: number }[] = [{ node: start as NodeId, next: 0 }]
    onPath.add(start)
    path.push(start as NodeId)

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]
      if (frame === undefined) break

      const children = successors.get(frame.node) ?? []
      if (frame.next >= children.length) {
        stack.pop()
        onPath.delete(frame.node)
        path.pop()
        done.add(frame.node)
        continue
      }

      const child = children[frame.next]
      frame.next += 1
      if (child === undefined) continue

      if (onPath.has(child)) {
        const from = path.indexOf(child)
        return [...path.slice(from === -1 ? 0 : from), child]
      }
      if (done.has(child)) continue

      onPath.add(child)
      path.push(child)
      stack.push({ node: child, next: 0 })
    }
  }

  return undefined
}

/**
 * Validates everything this issue owns: parameters, component definitions, reference
 * integrity and generic graph structure of every present diagram.
 */
export function validateProject(project: Project): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [...validateParameters(project.parameters)]

  for (const component of Object.values(project.components)) {
    issues.push(...validateComponent(component))
  }

  for (const tab of TAB_IDS) {
    const diagram = project.diagrams[tab]
    if (diagram === undefined) continue
    issues.push(...validateComponentRefs(diagram, project.components, tab))
    issues.push(...validateGraphStructure(diagram, tab))
  }

  for (const id of orphanedComponents(project)) {
    const component = dictGet(project.components, id)
    issues.push({
      severity: 'warning',
      code: 'ORPHANED_COMPONENT',
      message: `Component "${component?.name ?? id}" is defined but not used in any diagram.`,
      componentIds: [id],
    })
  }

  return issues
}
