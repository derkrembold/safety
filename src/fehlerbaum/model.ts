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
  constructor(id: string, label: string) {
    super(id, 'standardeingang', label)
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
  private nextId = 1
  private readonly nextLabelNumber: Record<ElementKind, number> = {
    standardeingang: 1,
    oder: 1,
    und: 1,
  }

  all(): FaultTreeElement[] {
    return [...this.elements.values()]
  }

  get(id: string): FaultTreeElement | undefined {
    return this.elements.get(id)
  }

  create(kind: ElementKind, position: Point): FaultTreeElement {
    const id = `el-${this.nextId++}`
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
