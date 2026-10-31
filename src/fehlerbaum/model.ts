import { asNodeId, newNodeId, newComponentId, newEdgeId, type ComponentId, type DiagramNode, type Project } from '../core'

export type ElementKind = 'standardeingang' | 'oder' | 'und'

export interface Point {
  x: number
  y: number
}

/**
 * Verknüpfungselement des Fehlerbaums. `nodes` enthält die Eingänge
 * (Kindelemente) dieses Elements; die Elemente selbst sind die Knoten des
 * Baums (siehe requirements/Fehlerbaumanalyse.md, Abschnitt "Aufgabe").
 */
export abstract class FaultTreeElement {
  readonly id: string
  readonly kind: ElementKind
  label: string
  readonly nodes: FaultTreeElement[] = []

  constructor(id: string, kind: ElementKind, label: string) {
    this.id = id
    this.kind = kind
    this.label = label
  }

  /** Ob an diesem Element Eingänge angeschlossen werden können. */
  abstract get acceptsInputs(): boolean
}

export class Standardeingang extends FaultTreeElement {
  readonly componentRef: ComponentId

  constructor(id: string, label: string, componentRef = newComponentId()) {
    super(id, 'standardeingang', label)
    this.componentRef = componentRef
  }

  get acceptsInputs(): boolean {
    return false
  }
}

export class OderVerknuepfung extends FaultTreeElement {
  constructor(id: string, label: string) {
    super(id, 'oder', label)
  }

  get acceptsInputs(): boolean {
    return true
  }
}

export class UndVerknuepfung extends FaultTreeElement {
  constructor(id: string, label: string) {
    super(id, 'und', label)
  }

  get acceptsInputs(): boolean {
    return true
  }
}

export type ConnectError =
  | 'unknown-element'
  | 'same-element'
  | 'no-inputs'
  | 'output-taken'
  | 'already-connected'
  | 'cycle'

export type ConnectResult = { ok: true } | { ok: false; error: ConnectError }

export interface Connection {
  childId: string
  parentId: string
}

const LABEL_PREFIX: Record<ElementKind, string> = {
  standardeingang: 'Eingang',
  oder: 'ODER',
  und: 'UND',
}

export class FaultTree {
  /** Position der Elemente in der Darstellung des Fehlerbaum-Reiters. */
  readonly layout = new Map<string, Point>()

  private readonly elements = new Map<string, FaultTreeElement>()
  private readonly nextLabelNumber: Record<ElementKind, number> = {
    standardeingang: 1,
    oder: 1,
    und: 1,
  }

  /** Rebuild the editor projection without requiring a complete, calculable tree. */
  static fromProject(project: Project): FaultTree {
    const tree = new FaultTree()
    const diagram = project.diagrams.fehlerbaum
    if (!diagram) return tree
    for (const node of Object.values(diagram.nodes)) {
      const component = node.componentRef !== undefined && Object.hasOwn(project.components, node.componentRef)
        ? project.components[node.componentRef] : undefined
      let element: FaultTreeElement
      const label = node.label ?? component?.name ?? node.kind
      if (node.kind === 'standardeingang' || node.kind === 'basicEvent') {
        if (!component || !node.componentRef) throw new Error('Standardeingang ohne Komponentenidentität.')
        element = new Standardeingang(node.id, label, node.componentRef)
      } else if (node.kind === 'oder' || node.kind === 'or') element = new OderVerknuepfung(node.id, label)
      else if (node.kind === 'und' || node.kind === 'and') element = new UndVerknuepfung(node.id, label)
      else throw new Error(`Unbekanntes Fehlerbaum-Element: ${node.kind}`)
      tree.elements.set(node.id, element)
      tree.layout.set(node.id, diagram.layout[node.id] ?? { x: 40, y: 40 })
      const number = Number(label.replace(`${LABEL_PREFIX[element.kind]} `, ''))
      if (Number.isSafeInteger(number) && number >= 1) {
        tree.nextLabelNumber[element.kind] = Math.max(tree.nextLabelNumber[element.kind], number + 1)
      }
    }
    for (const edge of diagram.edges) {
      const result = tree.connect(edge.to, edge.from)
      if (!result.ok) throw new Error(`Ungültige Fehlerbaum-Verbindung: ${result.error}`)
    }
    return tree
  }

  /** Commit the editable projection, retaining registry data and other diagrams. */
  toProject(project: Project): Project {
    const components = { ...project.components }
    const nodes: Record<string, DiagramNode> = Object.create(null)
    for (const element of this.all()) {
      const componentRef = element instanceof Standardeingang ? element.componentRef : undefined
      nodes[element.id] = {
        id: asNodeId(element.id),
        kind: element.kind === 'standardeingang' ? 'basicEvent' : element.kind === 'oder' ? 'or' : 'and',
        label: element.label,
        ...(componentRef === undefined ? {} : { componentRef }),
      }
      if (componentRef !== undefined && !Object.hasOwn(components, componentRef)) {
        // Zero denotes an unset rate; validation blocks calculations until it is supplied.
        components[componentRef] = { id: componentRef, name: element.label, failureRate: 0 }
      }
    }
    const previous = project.diagrams.fehlerbaum
    const edges = this.connections().map(({ parentId, childId }) =>
      previous?.edges.find((edge) => edge.from === parentId && edge.to === childId) ?? {
        id: newEdgeId(), from: asNodeId(parentId), to: asNodeId(childId),
      },
    )
    return {
      ...project, modifiedAt: new Date().toISOString(), components,
      diagrams: {
        ...project.diagrams,
        fehlerbaum: {
          nodes, edges, layout: Object.fromEntries(this.layout),
          provenance: { origin: 'authored', stale: false },
        },
      },
    }
  }

  all(): FaultTreeElement[] {
    return [...this.elements.values()]
  }

  get(id: string): FaultTreeElement | undefined {
    return this.elements.get(id)
  }

  create(kind: ElementKind, position: Point): FaultTreeElement {
    const id = newNodeId()
    const label = `${LABEL_PREFIX[kind]} ${this.nextLabelNumber[kind]++}`
    const element =
      kind === 'standardeingang'
        ? new Standardeingang(id, label)
        : kind === 'oder'
          ? new OderVerknuepfung(id, label)
          : new UndVerknuepfung(id, label)
    this.elements.set(id, element)
    this.layout.set(id, position)
    return element
  }

  /** Entfernt das Element samt seiner Verbindungen; Eingänge bleiben erhalten. */
  remove(id: string): void {
    if (!this.elements.delete(id)) return
    this.layout.delete(id)
    for (const element of this.elements.values()) {
      const index = element.nodes.findIndex((node) => node.id === id)
      if (index >= 0) element.nodes.splice(index, 1)
    }
  }

  parentOf(childId: string): FaultTreeElement | undefined {
    return this.all().find((element) =>
      element.nodes.some((node) => node.id === childId),
    )
  }

  connections(): Connection[] {
    return this.all().flatMap((parent) =>
      parent.nodes.map((child) => ({ childId: child.id, parentId: parent.id })),
    )
  }

  /**
   * Verbindet den Ausgang von `childId` mit einem Eingang von `parentId`.
   * Ein Ausgang führt zu höchstens einem Element, damit der Fehlerbaum ein
   * Baum bleibt; ein Eingang darf mehrere Verbindungen haben.
   */
  connect(childId: string, parentId: string): ConnectResult {
    const child = this.elements.get(childId)
    const parent = this.elements.get(parentId)
    if (!child || !parent) return { ok: false, error: 'unknown-element' }
    if (child === parent) return { ok: false, error: 'same-element' }
    if (!parent.acceptsInputs) return { ok: false, error: 'no-inputs' }
    const currentParent = this.parentOf(childId)
    if (currentParent === parent) return { ok: false, error: 'already-connected' }
    if (currentParent) return { ok: false, error: 'output-taken' }
    if (this.isInSubtree(child, parent)) return { ok: false, error: 'cycle' }
    parent.nodes.push(child)
    return { ok: true }
  }

  disconnect(childId: string, parentId: string): void {
    const parent = this.elements.get(parentId)
    if (!parent) return
    const index = parent.nodes.findIndex((node) => node.id === childId)
    if (index >= 0) parent.nodes.splice(index, 1)
  }

  private isInSubtree(root: FaultTreeElement, candidate: FaultTreeElement): boolean {
    return root.nodes.some(
      (node) => node === candidate || this.isInSubtree(node, candidate),
    )
  }
}
