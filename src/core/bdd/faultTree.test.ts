import { describe, expect, it } from 'vitest'
import { addEdge, addNode, emptyDiagram } from '../diagram'
import { asComponentId, asEdgeId, asNodeId } from '../ids'
import { SENSOR, sharedSensorProject } from '../fixtures'
import { buildBddFromDiagram, buildBddFromElements } from './faultTree'
import type { FaultTreeElementLike } from './faultTree'
import { bddFailureProbability, systemPfdAvg } from './probability'
import { Standardeingang, UndVerknuepfung } from '../../fehlerbaum/model'

describe('fault-tree adapters', () => {
  it('uses the shared component registry and parent-to-input edge convention', () => {
    const project = sharedSensorProject()
    const bdd = buildBddFromDiagram(project.diagrams.fehlerbaum!, project.components)
    const probabilities = new Map(Object.values(project.components).map(c => [c.id, 0.1]))
    expect(bddFailureProbability(bdd, probabilities)).toBeCloseTo(0.1 * (0.1 + 0.1 - 0.01), 14)
    // S * (A OR B): a(b+c)/3 - abc/4, not independent copies of S.
    const [a, b, c] = [0.01, 0.02, 0.03]
    expect(systemPfdAvg(bdd, project.components, 1000)).toBeCloseTo(a * (b + c) / 3 - a * b * c / 4, 14)
  })

  it('adapts the German editor element kinds with explicit identity mapping', () => {
    const first = new Standardeingang('one', 'Sensor')
    const second = new Standardeingang('two', 'Sensor')
    const root = new UndVerknuepfung('top', 'Versorgung')
    root.nodes.push(first, second)
    const shared = buildBddFromElements(root, new Map([['one', SENSOR], ['two', SENSOR]]))
    expect(shared.nodes).toHaveLength(3)
    expect(bddFailureProbability(shared, new Map([[SENSOR, 0.1]]))).toBe(0.1)
    const other = asComponentId('other')
    const distinct = buildBddFromElements(root, new Map([['one', SENSOR], ['two', other]]))
    expect(bddFailureProbability(distinct, new Map([[SENSOR, 0.1], [other, 0.1]]))).toBeCloseTo(0.01, 14)
  })

  it('rejects unknown identities, empty gates, cycles and unsupported kinds', () => {
    const input = { id: 'a', kind: 'standardeingang', nodes: [] }
    expect(() => buildBddFromElements(input, new Map())).toThrow(/identity/)
    expect(() => buildBddFromElements({ id: 'a', kind: 'not', nodes: [] }, new Map())).toThrow(/Unsupported/)
    expect(() => buildBddFromElements({ id: 'a', kind: 'oder', nodes: [] }, new Map())).toThrow(/no inputs/)
    const cyclic: { id: string; kind: string; nodes: FaultTreeElementLike[] } = { id: 'a', kind: 'und', nodes: [] }
    cyclic.nodes.push(cyclic)
    expect(() => buildBddFromElements(cyclic, new Map())).toThrow(/Cycle/)
    const duplicate = { ...input }
    expect(() => buildBddFromElements({ id: 'top', kind: 'or', nodes: [input, duplicate] }, new Map([['a', SENSOR]]))).toThrow(/Duplicate/)
    expect(() => buildBddFromElements({ ...input, nodes: [input] }, new Map([['a', SENSOR]]))).toThrow(/cannot have/)
  })

  it('rejects empty, disconnected, cyclic and dangling shared documents', () => {
    const project = sharedSensorProject()
    expect(() => buildBddFromDiagram(emptyDiagram(), project.components)).toThrow(/TOP/)
    let document = project.diagrams.fehlerbaum!
    document = addNode(document, { id: asNodeId('extra'), kind: 'or' })
    expect(() => buildBddFromDiagram(document, project.components)).toThrow(/root/)
    document = addEdge(project.diagrams.fehlerbaum!, {
      id: asEdgeId('missing'), from: asNodeId('n-top'), to: asNodeId('ghost'),
    })
    expect(() => buildBddFromDiagram(document, project.components)).toThrow(/do not exist/)
    document = addEdge(project.diagrams.fehlerbaum!, {
      id: asEdgeId('cycle'), from: asNodeId('n-and-a'), to: asNodeId('n-top'),
    })
    expect(() => buildBddFromDiagram(document, project.components)).toThrow(/cycle/)
    document = addNode(project.diagrams.fehlerbaum!, {
      id: asNodeId('n-sensor-1'), kind: 'basicEvent', componentRef: asComponentId('ghost'),
    })
    expect(() => buildBddFromDiagram(document, project.components)).toThrow(/unknown component/)
  })
})
