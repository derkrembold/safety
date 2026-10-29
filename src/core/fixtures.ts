import type { ComponentDefinition } from './component'
import type { DiagramDocument } from './diagram'
import { addEdge, addNode, emptyDiagram } from './diagram'
import type { ComponentId, NodeId } from './ids'
import { asComponentId, asEdgeId, asNodeId } from './ids'
import type { Project } from './project'
import { createEmptyProject, putProjectComponent, setDiagram } from './project'

export const SENSOR = asComponentId('c-sensor')
export const VALVE_A = asComponentId('c-valve-a')
export const VALVE_B = asComponentId('c-valve-b')

export function component(
  id: ComponentId,
  name: string,
  failureRate: number,
  repairRate?: number,
): ComponentDefinition {
  return { id, name, failureRate, ...(repairRate === undefined ? {} : { repairRate }) }
}

/**
 * Fault tree with a **shared** component: the sensor feeds both redundant branches.
 *
 *            TOP (or)
 *          /          \
 *     and-a            and-b
 *     /    \          /     \
 * sensor  valveA   sensor  valveB
 *
 * The two `sensor` occurrences are two nodes but one identity — exactly the situation in
 * which the branches are no longer independent.
 */
export function sharedSensorProject(): Project {
  const top = asNodeId('n-top')
  const andA = asNodeId('n-and-a')
  const andB = asNodeId('n-and-b')
  const sensor1 = asNodeId('n-sensor-1')
  const sensor2 = asNodeId('n-sensor-2')
  const valveA = asNodeId('n-valve-a')
  const valveB = asNodeId('n-valve-b')

  let diagram: DiagramDocument = emptyDiagram()
  diagram = addNode(diagram, { id: top, kind: 'or' }, { x: 0, y: 0 })
  diagram = addNode(diagram, { id: andA, kind: 'and' }, { x: -100, y: 100 })
  diagram = addNode(diagram, { id: andB, kind: 'and' }, { x: 100, y: 100 })
  diagram = addNode(diagram, { id: sensor1, kind: 'basicEvent', componentRef: SENSOR })
  diagram = addNode(diagram, { id: valveA, kind: 'basicEvent', componentRef: VALVE_A })
  diagram = addNode(diagram, { id: sensor2, kind: 'basicEvent', componentRef: SENSOR })
  diagram = addNode(diagram, { id: valveB, kind: 'basicEvent', componentRef: VALVE_B })

  const edges: readonly [string, NodeId, NodeId][] = [
    ['e-1', top, andA],
    ['e-2', top, andB],
    ['e-3', andA, sensor1],
    ['e-4', andA, valveA],
    ['e-5', andB, sensor2],
    ['e-6', andB, valveB],
  ]
  for (const [id, from, to] of edges) {
    diagram = addEdge(diagram, { id: asEdgeId(id), from, to })
  }

  let project = createEmptyProject('Shared sensor', { missionTimeHours: 8760, testIntervalHours: 4380 })
  project = putProjectComponent(project, component(SENSOR, 'Sensor', 1e-5, 0.1))
  project = putProjectComponent(project, component(VALVE_A, 'Valve A', 2e-5, 0.05))
  project = putProjectComponent(project, component(VALVE_B, 'Valve B', 3e-5, 0.05))
  return setDiagram(project, 'fehlerbaum', diagram)
}
