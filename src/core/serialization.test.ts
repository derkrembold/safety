import { describe, expect, it } from 'vitest'
import type { DiagramNode } from './diagram'
import { addNode, emptyDiagram, markStale, withProvenance } from './diagram'
import { asNodeId } from './ids'
import { DEFAULT_PARAMETERS, PROJECT_VERSION, setDiagram } from './project'
import {
  ProjectFormatError,
  SchemaVersionError,
  fromJSON,
  parseProject,
  serializeProject,
  toJSON,
} from './serialization'
import { SENSOR, sharedSensorProject } from './fixtures'

describe('serializeProject', () => {
  it('round-trips a project unchanged', () => {
    const project = sharedSensorProject()
    const restored = fromJSON(toJSON(project))

    expect(restored).toEqual(serializeProject(project))
    expect(restored.name).toBe(project.name)
    expect(Object.keys(restored.components)).toHaveLength(3)
  })

  it('keeps the schema version in the project itself', () => {
    const serialized = serializeProject(sharedSensorProject())
    expect(serialized.version).toBe(PROJECT_VERSION)
  })

  it('keeps both occurrences of the shared identity as references', () => {
    const restored = fromJSON(toJSON(sharedSensorProject()))
    const nodes = Object.values(restored.diagrams.fehlerbaum?.nodes ?? {})
    const sensorNodes = nodes.filter((node) => node.componentRef === SENSOR)

    expect(sensorNodes).toHaveLength(2)
    // The rate is stored once, in the registry — not duplicated per occurrence.
    expect(restored.components[SENSOR]?.failureRate).toBe(1e-5)
  })

  it('strips rates that were smuggled onto a node', () => {
    // The type forbids this, so it takes a cast — but a hand-edited file could contain it
    // and must not become a second, divergent source of truth.
    const rogue = {
      id: asNodeId('n-rogue'),
      kind: 'basicEvent',
      componentRef: SENSOR,
      failureRate: 0.5,
      repairRate: 0.2,
    } as unknown as DiagramNode

    const project = setDiagram(sharedSensorProject(), 'bdd', addNode(emptyDiagram(), rogue))
    const serialized = serializeProject(project)
    const node = serialized.diagrams.bdd?.nodes['n-rogue']

    expect(node?.componentRef).toBe(SENSOR)
    expect(Object.keys(node ?? {})).toEqual(['id', 'kind', 'componentRef'])
    expect(node).not.toHaveProperty('failureRate')
    expect(node).not.toHaveProperty('repairRate')
  })

  it('preserves provenance and the stale flag', () => {
    const fehlerbaum = sharedSensorProject().diagrams.fehlerbaum ?? emptyDiagram()
    const derived = markStale(
      withProvenance(fehlerbaum, { origin: 'derived', derivedFrom: 'bdd', stale: false }),
    )
    const project = setDiagram(sharedSensorProject(), 'zuverlaessigkeitsdiagramm', derived)
    const restored = fromJSON(toJSON(project))

    expect(restored.diagrams.zuverlaessigkeitsdiagramm?.provenance).toEqual({
      origin: 'derived',
      derivedFrom: 'bdd',
      stale: true,
    })
  })
})

describe('parseProject', () => {
  it('loads a header-only project file from the scaffold', () => {
    // Files written before this model existed carry only the project header. They stay
    // loadable and simply come back without components or diagrams.
    const restored = parseProject({
      version: 1,
      name: 'Altes Projekt',
      createdAt: '2026-01-01T00:00:00.000Z',
      modifiedAt: '2026-01-01T00:00:00.000Z',
    })

    expect(restored.name).toBe('Altes Projekt')
    expect(restored.components).toEqual({})
    expect(restored.diagrams).toEqual({})
    expect(restored.parameters).toEqual(DEFAULT_PARAMETERS)
  })

  it('keeps a component whose id is __proto__', () => {
    // JSON.parse creates `__proto__` as an own property, so such an id really can reach
    // the parser. Assigning it into an ordinary object would hit the inherited setter
    // and drop the component without any error.
    const json = JSON.stringify({
      version: 1,
      name: 'Proto',
      createdAt: '2026-01-01T00:00:00.000Z',
      modifiedAt: '2026-01-01T00:00:00.000Z',
      components: { placeholder: { id: 'placeholder', name: 'Sensor', failureRate: 1e-4 } },
    }).replaceAll('placeholder', '__proto__')

    const restored = fromJSON(json)
    expect(Object.keys(restored.components)).toEqual(['__proto__'])
    expect(restored.components['__proto__']?.name).toBe('Sensor')

    // ... and it survives the export again, instead of vanishing on the way out.
    expect(Object.keys(serializeProject(restored).components)).toEqual(['__proto__'])
  })

  it('keeps a node whose id is __proto__', () => {
    const json = JSON.stringify({
      version: 1,
      name: 'Proto',
      createdAt: '2026-01-01T00:00:00.000Z',
      modifiedAt: '2026-01-01T00:00:00.000Z',
      diagrams: {
        fehlerbaum: {
          nodes: { placeholder: { id: 'placeholder', kind: 'or' } },
          edges: [],
          layout: { placeholder: { x: 1, y: 2 } },
          provenance: { origin: 'authored', stale: false },
        },
      },
    }).replaceAll('placeholder', '__proto__')

    const diagram = fromJSON(json).diagrams.fehlerbaum
    expect(Object.keys(diagram?.nodes ?? {})).toEqual(['__proto__'])
    expect(Object.keys(diagram?.layout ?? {})).toEqual(['__proto__'])
  })

  it('rejects an unknown schema version instead of guessing', () => {
    const file = { ...serializeProject(sharedSensorProject()), version: 99 }
    expect(() => parseProject(file)).toThrow(SchemaVersionError)
  })

  it('rejects a malformed file with a path to the offending field', () => {
    const broken = {
      ...serializeProject(sharedSensorProject()),
      parameters: { missionTimeHours: 'viel', testIntervalHours: 10 },
    }

    expect(() => parseProject(broken)).toThrow(ProjectFormatError)
    expect(() => parseProject(broken)).toThrow(/project\.parameters\.missionTimeHours/)
  })

  it('rejects a wrong type in the project header', () => {
    expect(() => parseProject({ version: 1, name: 42 })).toThrow(ProjectFormatError)
  })
})
