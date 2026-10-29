import { describe, expect, it } from 'vitest'
import { addEdge, addNode, emptyDiagram } from './diagram'
import { asComponentId, asEdgeId, asNodeId } from './ids'
import {
  patchProjectComponent,
  putProjectComponent,
  setDiagram,
  setParameters,
} from './project'
import {
  findCycle,
  hasErrors,
  validateComponent,
  validateComponentRefs,
  validateGraphStructure,
  validateParameters,
  validateProject,
} from './validation'
import { SENSOR, component, sharedSensorProject } from './fixtures'

const codes = (issues: readonly { code: string }[]) => issues.map((issue) => issue.code)

describe('validation', () => {
  it('accepts the shared-sensor project apart from benign warnings', () => {
    const issues = validateProject(sharedSensorProject())
    expect(hasErrors(issues)).toBe(false)
  })

  it('flags an occurrence that points at an unknown identity', () => {
    const ghost = asComponentId('c-ghost')
    let diagram = emptyDiagram()
    diagram = addNode(diagram, { id: asNodeId('n-1'), kind: 'basicEvent', componentRef: ghost })

    const issues = validateComponentRefs(diagram, {}, 'fehlerbaum')
    expect(codes(issues)).toEqual(['UNKNOWN_COMPONENT_REF'])
    expect(issues[0]?.componentIds).toEqual([ghost])
    expect(issues[0]?.tab).toBe('fehlerbaum')
  })

  it('detects a cycle and names the nodes involved', () => {
    const a = asNodeId('n-a')
    const b = asNodeId('n-b')
    let diagram = emptyDiagram()
    diagram = addNode(diagram, { id: a, kind: 'and' })
    diagram = addNode(diagram, { id: b, kind: 'and' })
    diagram = addEdge(diagram, { id: asEdgeId('e-1'), from: a, to: b })
    diagram = addEdge(diagram, { id: asEdgeId('e-2'), from: b, to: a })

    expect(findCycle(diagram)).toBeDefined()
    const issues = validateGraphStructure(diagram)
    expect(codes(issues)).toContain('CYCLE_DETECTED')
    expect(issues[0]?.nodeIds?.length).toBeGreaterThanOrEqual(2)
  })

  it('requires exactly one root node', () => {
    let diagram = emptyDiagram()
    diagram = addNode(diagram, { id: asNodeId('n-a'), kind: 'and' })
    diagram = addNode(diagram, { id: asNodeId('n-b'), kind: 'and' })

    expect(codes(validateGraphStructure(diagram))).toEqual(['MULTIPLE_ROOTS'])
    // An empty diagram is incomplete, not invalid.
    expect(validateGraphStructure(emptyDiagram())).toEqual([])
  })

  it('reports an edge that points into the void', () => {
    let diagram = emptyDiagram()
    diagram = addNode(diagram, { id: asNodeId('n-a'), kind: 'and' })
    diagram = addEdge(diagram, {
      id: asEdgeId('e-1'),
      from: asNodeId('n-a'),
      to: asNodeId('n-missing'),
    })

    expect(codes(validateGraphStructure(diagram))).toContain('DANGLING_EDGE')
  })

  it('rejects non-positive rates and warns about a missing repair rate', () => {
    expect(codes(validateComponent(component(SENSOR, 'Sensor', 0, 0.1)))).toEqual([
      'INVALID_FAILURE_RATE',
    ])
    expect(codes(validateComponent(component(SENSOR, 'Sensor', 1e-5)))).toEqual([
      'MISSING_REPAIR_RATE',
    ])
    expect(codes(validateComponent(component(SENSOR, 'Sensor', 1e-5, -1)))).toEqual([
      'INVALID_REPAIR_RATE',
    ])
    expect(validateComponent(component(SENSOR, 'Sensor', 1e-5, 0.1))).toEqual([])
  })

  it('rejects non-positive mission time and test interval', () => {
    expect(codes(validateParameters({ missionTimeHours: 0, testIntervalHours: 8760 }))).toEqual([
      'INVALID_MISSION_TIME',
    ])
    expect(
      codes(validateParameters({ missionTimeHours: 8760, testIntervalHours: Number.NaN })),
    ).toEqual(['INVALID_TEST_INTERVAL'])
  })

  it('surfaces an invalid rate through the whole project', () => {
    const project = patchProjectComponent(sharedSensorProject(), SENSOR, {
      failureRate: Number.POSITIVE_INFINITY,
    })
    const issues = validateProject(project)
    expect(hasErrors(issues)).toBe(true)
    expect(codes(issues)).toContain('INVALID_FAILURE_RATE')
  })

  it('warns about a defined but unused identity', () => {
    const project = putProjectComponent(
      sharedSensorProject(),
      component(asComponentId('c-spare'), 'Spare', 1e-6, 0.1),
    )
    const issues = validateProject(project)
    expect(codes(issues)).toContain('ORPHANED_COMPONENT')
    expect(hasErrors(issues)).toBe(false)
  })

  it('validates each tab separately', () => {
    const project = setDiagram(
      setParameters(sharedSensorProject(), { missionTimeHours: 100, testIntervalHours: 50 }),
      'bdd',
      addNode(
        addNode(emptyDiagram(), { id: asNodeId('n-x'), kind: 'bddNode' }),
        { id: asNodeId('n-y'), kind: 'bddNode' },
      ),
    )

    const issues = validateProject(project)
    const bddIssues = issues.filter((issue) => issue.tab === 'bdd')
    expect(codes(bddIssues)).toEqual(['MULTIPLE_ROOTS'])
  })
})
