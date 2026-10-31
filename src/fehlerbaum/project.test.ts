import { describe, expect, it } from 'vitest'
import { asComponentId, asEdgeId, asNodeId, createEmptyProject, emptyDiagram, fromJSON, toJSON } from '../core'
import { FaultTree, Standardeingang } from './model'

function sharedProject() {
  const project = createEmptyProject('Shared')
  const ref = asComponentId('sensor')
  project.components = { [ref]: { id: ref, name: 'Sensor', failureRate: 0.0001, repairRate: 0.2, note: 'Keep me' } }
  project.diagrams.fehlerbaum = {
    nodes: {
      gate: { id: asNodeId('gate'), kind: 'or', label: 'TOP' },
      a: { id: asNodeId('a'), kind: 'basicEvent', componentRef: ref },
      b: { id: asNodeId('b'), kind: 'basicEvent', componentRef: ref, label: 'Zweites Vorkommen' },
    },
    edges: [
      { id: asEdgeId('edge-a'), from: asNodeId('gate'), to: asNodeId('a'), label: 'A' },
      { id: asEdgeId('edge-b'), from: asNodeId('gate'), to: asNodeId('b') },
    ],
    layout: { gate: { x: 10, y: 20 }, a: { x: 30, y: 40 }, b: { x: 50, y: 60 } },
    provenance: { origin: 'authored', stale: false },
  }
  project.diagrams.bdd = emptyDiagram()
  return project
}

describe('fault tree project projection', () => {
  it('keeps shared identities, registry rates, edge identities, layout and other tabs through edits', () => {
    const project = sharedProject()
    const tree = FaultTree.fromProject(fromJSON(toJSON(project)))
    const a = tree.get('a') as Standardeingang
    const b = tree.get('b') as Standardeingang
    expect(a.componentRef).toBe(b.componentRef)
    expect(a.label).toBe('Sensor')
    a.label = 'Umbenannt'
    tree.layout.set('a', { x: 70, y: 80 })
    const saved = fromJSON(toJSON(tree.toProject(project)))
    expect(saved.components).toEqual(project.components)
    expect(saved.diagrams.bdd).toEqual(project.diagrams.bdd)
    expect(saved.diagrams.fehlerbaum?.edges).toEqual(project.diagrams.fehlerbaum?.edges)
    expect(saved.diagrams.fehlerbaum?.layout.a).toEqual({ x: 70, y: 80 })
    const restored = FaultTree.fromProject(saved)
    expect(restored.get('a')?.label).toBe('Umbenannt')
    expect((restored.get('a') as Standardeingang).componentRef).toBe(a.componentRef)
    tree.remove('a')
    expect(tree.toProject(saved).components).toEqual(project.components)
    expect(tree.toProject(saved).diagrams.fehlerbaum?.edges).toHaveLength(1)
  })

  it('persists disconnected inputs and gates without requiring a valid calculation', () => {
    const tree = new FaultTree()
    tree.create('standardeingang', { x: 10, y: 20 })
    tree.create('und', { x: 30, y: 40 })
    const project = tree.toProject(createEmptyProject('Unvollständig'))
    expect(FaultTree.fromProject(fromJSON(toJSON(project))).all()).toHaveLength(2)
    expect(project.diagrams.fehlerbaum?.edges).toEqual([])
  })

  it.each(['unknown-kind', 'missing-component', 'cycle', 'multiple-parents'])('rejects %s before replacing a project', (problem) => {
    const project = sharedProject()
    const diagram = project.diagrams.fehlerbaum!
    if (problem === 'unknown-kind') {
      project.diagrams.fehlerbaum = { ...diagram, nodes: { ...diagram.nodes, bad: { id: asNodeId('bad'), kind: 'unknown' } } }
    } else if (problem === 'missing-component') {
      project.components = {}
    } else {
      project.diagrams.fehlerbaum = {
        ...diagram,
        nodes: { ...diagram.nodes, gate2: { id: asNodeId('gate2'), kind: 'and' } },
        edges: [...diagram.edges,
          { id: asEdgeId('extra'), from: asNodeId('gate'), to: asNodeId('gate2') },
          { id: asEdgeId('bad'), from: asNodeId('gate2'), to: asNodeId(problem === 'cycle' ? 'gate' : 'b') },
        ],
      }
    }
    expect(() => FaultTree.fromProject(project)).toThrow()
  })
})
