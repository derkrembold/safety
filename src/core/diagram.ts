import { dictFrom, dictGet, dictOmit, emptyDict } from './dict'
import type { ComponentId, EdgeId, NodeId } from './ids'

/** The three representations of one and the same system. */
export type TabId = 'fehlerbaum' | 'zuverlaessigkeitsdiagramm' | 'bdd'

export const TAB_IDS: readonly TabId[] = ['fehlerbaum', 'zuverlaessigkeitsdiagramm', 'bdd']

/**
 * One occurrence of something inside one diagram.
 *
 * `kind` is representation-specific and stays a plain string here so the editors
 * (issues #2/#3/#4) can narrow it to their own union without the core depending on them.
 *
 * Note the `failureRate`/`repairRate` fields typed as `never`: they exist purely to make
 * it a *compile error* to attach rates to an occurrence. Rates belong to the component
 * identity in the registry — see `ComponentDefinition`.
 */
export interface DiagramNode<TKind extends string = string> {
  readonly id: NodeId
  readonly kind: TKind
  /**
   * The component identity this occurrence stands for. Undefined for elements that are
   * not components, e.g. a fault-tree gate or a BDD terminal stub.
   */
  readonly componentRef?: ComponentId
  /** Optional free-text label shown instead of the component name. */
  readonly label?: string
  readonly failureRate?: never
  readonly repairRate?: never
}

/**
 * A directed connection between two occurrences.
 *
 * Direction convention: in the fault tree an edge points from a gate to one of its
 * inputs (TOP at the top, inputs below); in the reliability block diagram and the BDD it
 * follows the flow from start to end, respectively from a node down to its successors.
 * In every case a node without incoming edges is a root/start node.
 */
export interface Edge {
  readonly id: EdgeId
  readonly from: NodeId
  readonly to: NodeId
  /** Port/stub the edge leaves from, e.g. the BDD's "funktioniert"/"ausgefallen" stub. */
  readonly fromPort?: string
  readonly toPort?: string
  readonly label?: string
}

export interface Point {
  readonly x: number
  readonly y: number
}

/**
 * Where a diagram came from and whether it is still up to date.
 *
 * A derived diagram is marked `stale` when the source diagram it was derived from has
 * become invalid: the last valid derivation stays visible but is flagged, instead of
 * being replaced by something incomplete (`Konzept.md`).
 */
export interface Provenance {
  readonly origin: 'authored' | 'derived'
  readonly derivedFrom?: TabId
  readonly stale: boolean
}

/**
 * One tab's diagram: occurrences, connections and its *own* layout.
 *
 * The layout is intentionally part of the per-tab document and is never carried over by
 * a conversion — a hand-made arrangement has no unique counterpart in another
 * representation, so every derived diagram is laid out automatically.
 */
export interface DiagramDocument<TKind extends string = string> {
  readonly nodes: Readonly<Record<string, DiagramNode<TKind>>>
  readonly edges: readonly Edge[]
  readonly layout: Readonly<Record<string, Point>>
  readonly provenance: Provenance
}

export function emptyDiagram<TKind extends string = string>(
  origin: Provenance['origin'] = 'authored',
): DiagramDocument<TKind> {
  return {
    nodes: emptyDict<DiagramNode<TKind>>(),
    edges: [],
    layout: emptyDict<Point>(),
    provenance: { origin, stale: false },
  }
}

export function getNode<TKind extends string>(
  diagram: DiagramDocument<TKind>,
  id: NodeId,
): DiagramNode<TKind> | undefined {
  return dictGet(diagram.nodes, id)
}

export function listNodes<TKind extends string>(
  diagram: DiagramDocument<TKind>,
): readonly DiagramNode<TKind>[] {
  return Object.values(diagram.nodes)
}

export function addNode<TKind extends string>(
  diagram: DiagramDocument<TKind>,
  node: DiagramNode<TKind>,
  position?: Point,
): DiagramDocument<TKind> {
  return {
    ...diagram,
    nodes: dictFrom(diagram.nodes, { [node.id]: node }),
    layout:
      position === undefined
        ? diagram.layout
        : dictFrom(diagram.layout, { [node.id]: position }),
  }
}

/** Removes a node together with its layout entry and every incident edge. */
export function removeNode<TKind extends string>(
  diagram: DiagramDocument<TKind>,
  id: NodeId,
): DiagramDocument<TKind> {
  return {
    ...diagram,
    nodes: dictOmit(diagram.nodes, id),
    layout: dictOmit(diagram.layout, id),
    edges: diagram.edges.filter((edge) => edge.from !== id && edge.to !== id),
  }
}

export function addEdge<TKind extends string>(
  diagram: DiagramDocument<TKind>,
  edge: Edge,
): DiagramDocument<TKind> {
  return { ...diagram, edges: [...diagram.edges, edge] }
}

export function removeEdge<TKind extends string>(
  diagram: DiagramDocument<TKind>,
  id: EdgeId,
): DiagramDocument<TKind> {
  return { ...diagram, edges: diagram.edges.filter((edge) => edge.id !== id) }
}

export function setNodePosition<TKind extends string>(
  diagram: DiagramDocument<TKind>,
  id: NodeId,
  position: Point,
): DiagramDocument<TKind> {
  return { ...diagram, layout: dictFrom(diagram.layout, { [id]: position }) }
}

export function withProvenance<TKind extends string>(
  diagram: DiagramDocument<TKind>,
  provenance: Provenance,
): DiagramDocument<TKind> {
  return { ...diagram, provenance }
}

/** Marks a derived diagram as outdated without discarding it. */
export function markStale<TKind extends string>(
  diagram: DiagramDocument<TKind>,
  stale = true,
): DiagramDocument<TKind> {
  return { ...diagram, provenance: { ...diagram.provenance, stale } }
}

/** Successors of a node, i.e. the targets of its outgoing edges. */
export function successorsOf<TKind extends string>(
  diagram: DiagramDocument<TKind>,
  id: NodeId,
): readonly NodeId[] {
  return diagram.edges.filter((edge) => edge.from === id).map((edge) => edge.to)
}

export function predecessorsOf<TKind extends string>(
  diagram: DiagramDocument<TKind>,
  id: NodeId,
): readonly NodeId[] {
  return diagram.edges.filter((edge) => edge.to === id).map((edge) => edge.from)
}

/** Nodes without incoming edges: the fault tree's TOP, the block diagram's start. */
export function rootNodes<TKind extends string>(
  diagram: DiagramDocument<TKind>,
): readonly DiagramNode<TKind>[] {
  const hasIncoming = new Set<string>(diagram.edges.map((edge) => edge.to))
  return listNodes(diagram).filter((node) => !hasIncoming.has(node.id))
}

/** Nodes without outgoing edges: basic events, respectively BDD terminal stubs. */
export function leafNodes<TKind extends string>(
  diagram: DiagramDocument<TKind>,
): readonly DiagramNode<TKind>[] {
  const hasOutgoing = new Set<string>(diagram.edges.map((edge) => edge.from))
  return listNodes(diagram).filter((node) => !hasOutgoing.has(node.id))
}

/**
 * Every occurrence of one component identity inside this diagram.
 *
 * A result length greater than one is exactly the situation that breaks the
 * independence assumption — see `sharedComponents` in `logic/inspect`.
 */
export function occurrencesOf<TKind extends string>(
  diagram: DiagramDocument<TKind>,
  component: ComponentId,
): readonly NodeId[] {
  return listNodes(diagram)
    .filter((node) => node.componentRef === component)
    .map((node) => node.id)
}

/** All distinct component identities referenced by this diagram. */
export function referencedComponents<TKind extends string>(
  diagram: DiagramDocument<TKind>,
): readonly ComponentId[] {
  const seen = new Set<ComponentId>()
  for (const node of listNodes(diagram)) {
    if (node.componentRef !== undefined) seen.add(node.componentRef)
  }
  return [...seen].sort((a, b) => a.localeCompare(b))
}
