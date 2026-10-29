import { describe, expect, it } from 'vitest'
import {
  emptyRegistry,
  getComponent,
  hasComponent,
  listComponents,
  putComponent,
  removeComponent,
  updateComponent,
} from './registry'
import {
  orphanedComponents,
  patchProjectComponent,
  putProjectComponent,
  usageCount,
  usagesOf,
} from './project'
import { occurrencesOf, referencedComponents } from './diagram'
import { asComponentId } from './ids'
import { SENSOR, VALVE_A, component, sharedSensorProject } from './fixtures'

describe('component identity', () => {
  it('counts both occurrences of one shared identity', () => {
    const project = sharedSensorProject()

    expect(usageCount(project, SENSOR)).toBe(2)
    expect(usageCount(project, VALVE_A)).toBe(1)

    const usages = usagesOf(project, SENSOR)
    expect(usages.map((usage) => usage.tab)).toEqual(['fehlerbaum', 'fehlerbaum'])
    expect(new Set(usages.map((usage) => usage.nodeId)).size).toBe(2)
  })

  it('keeps the rate in the registry, so one edit reaches every occurrence', () => {
    const project = patchProjectComponent(sharedSensorProject(), SENSOR, { failureRate: 7e-5 })
    const diagram = project.diagrams.fehlerbaum

    expect(getComponent(project.components, SENSOR)?.failureRate).toBe(7e-5)

    // Both occurrences resolve through the registry, so neither holds a stale rate.
    const nodeIds = occurrencesOf(diagram!, SENSOR)
    expect(nodeIds).toHaveLength(2)
    for (const nodeId of nodeIds) {
      const node = diagram!.nodes[nodeId]
      expect(node?.componentRef).toBe(SENSOR)
      expect(getComponent(project.components, node!.componentRef!)?.failureRate).toBe(7e-5)
    }
  })

  it('never lets an update change the identity', () => {
    const project = sharedSensorProject()
    const patched = updateComponent(project.components, SENSOR, { name: 'Sensor (renamed)' })

    expect(getComponent(patched, SENSOR)?.id).toBe(SENSOR)
    expect(getComponent(patched, SENSOR)?.name).toBe('Sensor (renamed)')
    // Renaming is cosmetic: the occurrences still point at the same identity.
    expect(usageCount(project, SENSOR)).toBe(2)
  })

  it('lists three distinct identities for four component occurrences', () => {
    const project = sharedSensorProject()
    const diagram = project.diagrams.fehlerbaum!

    expect(referencedComponents(diagram)).toHaveLength(3)
    expect(listComponents(project.components)).toHaveLength(3)
  })

  it('treats a reserved key as an ordinary identity', () => {
    const reserved = asComponentId('__proto__')

    // A lookup that finds nothing must say so, not hand back the object prototype.
    expect(getComponent(emptyRegistry(), reserved)).toBeUndefined()
    expect(hasComponent(emptyRegistry(), reserved)).toBe(false)

    const registry = putComponent(emptyRegistry(), component(reserved, 'Sensor', 1e-5))
    expect(getComponent(registry, reserved)?.name).toBe('Sensor')
    expect(listComponents(registry)).toHaveLength(1)
    expect(Object.keys(removeComponent(registry, reserved))).toEqual([])
  })

  it('reports a defined but unused identity as orphaned', () => {
    const spare = asComponentId('c-spare')
    const project = putProjectComponent(sharedSensorProject(), component(spare, 'Spare', 1e-6))

    expect(orphanedComponents(project)).toEqual([spare])
  })
})
