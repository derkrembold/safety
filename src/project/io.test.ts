import { describe, expect, it } from 'vitest'
import { importProjectFromFile } from './io'

function jsonFile(content: unknown): File {
  return new File([JSON.stringify(content)], 'project.safety.json', {
    type: 'application/json',
  })
}

describe('importProjectFromFile', () => {
  it('accepts a well-formed project', async () => {
    const project = await importProjectFromFile(
      jsonFile({
        version: 1,
        name: 'Testprojekt',
        createdAt: '2026-01-01T00:00:00.000Z',
        modifiedAt: '2026-01-01T00:00:00.000Z',
      }),
    )
    expect(project.name).toBe('Testprojekt')
  })

  it('rejects an unknown schema version', async () => {
    await expect(
      importProjectFromFile(jsonFile({ version: 2, name: 'x' })),
    ).rejects.toThrow()
  })

  it('rejects a project with wrong field types', async () => {
    await expect(
      importProjectFromFile(
        jsonFile({
          version: 1,
          name: 42,
          createdAt: false,
          modifiedAt: [],
        }),
      ),
    ).rejects.toThrow()
  })

  it('rejects malformed JSON', async () => {
    await expect(
      importProjectFromFile(new File(['not json'], 'project.safety.json')),
    ).rejects.toThrow()
  })

  it('accepts a project with components and diagrams', async () => {
    const project = await importProjectFromFile(
      jsonFile({
        version: 1,
        name: 'Mit Modell',
        createdAt: '2026-01-01T00:00:00.000Z',
        modifiedAt: '2026-01-01T00:00:00.000Z',
        parameters: { missionTimeHours: 8760, testIntervalHours: 4380 },
        components: {
          's': { id: 's', name: 'Sensor', failureRate: 1e-5, repairRate: 0.1 },
        },
        diagrams: {
          fehlerbaum: {
            nodes: { 'n1': { id: 'n1', kind: 'basicEvent', componentRef: 's' } },
            edges: [],
            layout: { 'n1': { x: 0, y: 0 } },
            provenance: { origin: 'authored', stale: false },
          },
        },
      }),
    )

    expect(project.parameters.testIntervalHours).toBe(4380)
    expect(project.components['s']?.failureRate).toBe(1e-5)
    expect(project.diagrams.fehlerbaum?.nodes['n1']?.componentRef).toBe('s')
  })

  it('rejects a component without a usable failure rate', async () => {
    await expect(
      importProjectFromFile(
        jsonFile({
          version: 1,
          name: 'Kaputt',
          createdAt: '2026-01-01T00:00:00.000Z',
          modifiedAt: '2026-01-01T00:00:00.000Z',
          components: { 's': { id: 's', name: 'Sensor', failureRate: 'schnell' } },
        }),
      ),
    ).rejects.toThrow()
  })
})
