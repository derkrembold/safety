import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { createEmptyProject, type Project } from './project/types'
import { asEdgeId, asNodeId, buildBddFromDiagram, systemAvailability, systemReliability } from './core'
import { SENSOR, sharedSensorProject } from './core/fixtures'
import { appLogger } from './debug/appLogger'

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsText(blob)
  })
}

const originalElementFromPoint = document.elementFromPoint
let downloads: Blob[]

beforeEach(() => {
  downloads = []
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn((blob: Blob) => { downloads.push(blob); return 'blob:test' }),
    revokeObjectURL: vi.fn(),
  })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})
afterEach(() => {
  document.elementFromPoint = originalElementFromPoint
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function exportProject(): Promise<Project> {
  fireEvent.click(screen.getByRole('button', { name: 'Projekt exportieren' }))
  return JSON.parse(await readBlob(downloads.at(-1)!))
}

function importText(container: HTMLElement, text: string) {
  const file = new File([text], 'project.safety.json', { type: 'application/json' })
  // jsdom's File does not implement text(); the real file input and importer are used.
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(text) })
  fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [file] } })
}

function connect(container: HTMLElement) {
  const out = container.querySelector('[data-stub=out]')!
  const input = container.querySelector('[data-stub=in]')!
  document.elementFromPoint = () => input
  fireEvent.pointerDown(out, { button: 0, clientX: 10, clientY: 10 })
  fireEvent.pointerUp(window, { clientX: 20, clientY: 20 })
}

describe('project/editor integration', () => {
  it('roundtrips UI edits through the file buttons, a fresh App and the debug export', async () => {
    const user = userEvent.setup()
    const first = render(<App />)
    await user.dblClick(screen.getByText('Standardeingang'))
    await user.dblClick(screen.getByText('ODER-Verknüpfung'))
    await user.dblClick(screen.getByText('UND-Verknüpfung'))
    // Delete a node and ensure it cannot leak into either export.
    fireEvent.pointerDown(screen.getByText('UND 1').closest('g')!, { button: 0 })
    await user.keyboard('{Delete}')
    connect(first.container)
    expect(first.container.querySelectorAll('path.ft-connection')).toHaveLength(1)
    // Disconnect and reconnect using the actual editor controls.
    fireEvent.pointerDown(first.container.querySelector('.ft-connection-hit')!, { button: 0 })
    await user.keyboard('{Delete}')
    expect((await exportProject()).diagrams.fehlerbaum?.edges).toHaveLength(0)
    connect(first.container)
    await user.dblClick(screen.getByText('Eingang 1').closest('g')!)
    const label = screen.getByRole('textbox', { name: 'Elementbeschriftung bearbeiten' })
    await user.clear(label)
    await user.type(label, 'Sensor A{Enter}')
    fireEvent.pointerDown(screen.getByText('Sensor A').closest('g')!, {
      button: 0, clientX: 10, clientY: 10,
    })
    fireEvent.pointerMove(window, { clientX: 100, clientY: 140 })
    fireEvent.pointerMove(window, { clientX: 150, clientY: 180 })
    fireEvent.pointerUp(window)
    const saved = await exportProject()
    const diagram = saved.diagrams.fehlerbaum!
    expect(Object.values(diagram.nodes)).toHaveLength(2)
    expect(diagram.edges).toHaveLength(1)
    const sensor = Object.values(diagram.nodes).find((node) => node.label === 'Sensor A')!
    expect(diagram.layout[sensor.id]).toEqual({ x: 180, y: 210 })
    expect(saved.components[sensor.componentRef!]).toMatchObject({ failureRate: 0 })
    expect(sensor).not.toHaveProperty('failureRate')
    first.unmount()

    const second = render(<App />)
    // A successful import must replace an existing visible tree and its selection.
    await user.dblClick(screen.getByText('UND-Verknüpfung'))
    importText(second.container, JSON.stringify(saved))
    await screen.findByText('Sensor A')
    expect(screen.queryByText('UND 1')).not.toBeInTheDocument()
    expect(second.container.querySelectorAll('path.ft-connection')).toHaveLength(1)
    expect((await exportProject()).diagrams).toEqual(saved.diagrams)
    expect((await exportProject()).components).toEqual(saved.components)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Debug-Modus' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Projektstand einschließen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Debug-Log exportieren' }))
    const debug = JSON.parse(await readBlob(downloads.at(-1)!))
    expect(debug.projectState).toEqual(saved)

    // Editing after import must allocate distinct occurrence and component identities.
    await user.dblClick(screen.getByText('Standardeingang'))
    const extended = await exportProject()
    expect(Object.values(extended.diagrams.fehlerbaum!.nodes)).toHaveLength(3)
    expect(Object.keys(extended.components)).toHaveLength(2)
    expect(extended.diagrams.fehlerbaum!.nodes[sensor.id]).toEqual(sensor)
  })

  it('edits the shared registry and project times, then roundtrips them through the file controls', async () => {
    const original = sharedSensorProject()
    const diagram = original.diagrams.fehlerbaum!
    original.diagrams.fehlerbaum = {
      ...diagram,
      nodes: Object.fromEntries(Object.entries(diagram.nodes).map(([id, node]) => [
        id, node.componentRef === SENSOR ? { ...node, label: 'Sensor' } : node,
      ])),
    }
    const initial = render(<App />)
    importText(initial.container, JSON.stringify(original))
    const sensors = await screen.findAllByRole('button', { name: 'Element Sensor auswählen' })
    fireEvent.keyDown(sensors[0], { key: 'Enter' })
    const properties = within(screen.getByRole('form', { name: 'Komponenteneigenschaften' }))
    const failure = properties.getByLabelText(/Ausfallrate/)
    const repair = properties.getByLabelText(/Reparaturrate/)
    for (const invalid of ['-1', '0', 'NaN', 'Infinity', '1e309', '1,2.3', '1e-']) {
      fireEvent.change(failure, { target: { value: invalid } })
      fireEvent.click(properties.getByRole('button', { name: 'Übernehmen' }))
      expect(failure).toHaveAttribute('aria-invalid', 'true')
    }
    fireEvent.change(failure, { target: { value: '1e-5' } })
    fireEvent.change(repair, { target: { value: '0' } })
    fireEvent.click(properties.getByRole('button', { name: 'Übernehmen' }))
    expect(repair).toHaveAttribute('aria-invalid', 'true')
    expect((await exportProject()).components[SENSOR]).toEqual(original.components[SENSOR])
    fireEvent.change(failure, { target: { value: '8e-3' } })
    fireEvent.keyDown(failure, { key: 'Delete' })
    fireEvent.keyDown(failure, { key: 'Backspace' })
    expect(screen.getAllByRole('button', { name: 'Element Sensor auswählen' })).toHaveLength(2)
    fireEvent.keyDown(screen.getByRole('button', { name: 'Element Valve A auswählen' }), { key: 'Enter' })
    expect(screen.getByLabelText('Komponentenname')).toHaveValue('Valve A')
    expect(screen.getByLabelText(/Ausfallrate/)).toHaveValue('0.00002')
    // A different occurrence of the same component must get its own fresh draft.
    fireEvent.keyDown(sensors[1], { key: ' ' })
    expect(screen.getByLabelText(/Ausfallrate/)).toHaveValue('0.00001')
    const selected = within(screen.getByRole('form', { name: 'Komponenteneigenschaften' }))
    fireEvent.change(selected.getByLabelText(/Ausfallrate/), { target: { value: '2,5e-5' } })
    fireEvent.change(selected.getByLabelText(/Reparaturrate/), { target: { value: '' } })
    fireEvent.change(selected.getByLabelText('Komponentenname'), { target: { value: 'Sensor neu' } })
    const log = vi.spyOn(appLogger, 'logAction')
    fireEvent.click(selected.getByRole('button', { name: 'Übernehmen' }))
    expect(log).toHaveBeenCalledWith('component-parameters-updated', {
      componentIds: [SENSOR], details: { name: 'Sensor neu', failureRate: 2.5e-5, repairRate: null },
    })
    const times = within(screen.getByRole('form', { name: 'Projektparameter' }))
    for (const value of ['0', '8.760', '8,760', '8 760']) {
      fireEvent.change(times.getByLabelText(/Missionsdauer/), { target: { value } })
      fireEvent.click(times.getByRole('button', { name: 'Übernehmen' }))
      expect(times.getByLabelText(/Missionsdauer/)).toHaveAttribute('aria-invalid', 'true')
    }
    expect((await exportProject()).parameters).toEqual(original.parameters)
    fireEvent.click(times.getByRole('button', { name: 'Abbrechen' }))
    expect(times.getByLabelText(/Missionsdauer/)).toHaveValue('8760')
    fireEvent.change(times.getByLabelText(/Missionsdauer/), { target: { value: '120,5' } })
    fireEvent.change(times.getByLabelText(/Prüfintervall/), { target: { value: '8,761e0' } })
    fireEvent.click(times.getByRole('button', { name: 'Übernehmen' }))
    expect(log).toHaveBeenCalledWith('project-parameters-updated', {
      details: { missionTimeHours: 120.5, testIntervalHours: 8.761 },
    })

    const saved = await exportProject()
    expect(saved.components[SENSOR]).toEqual({ id: SENSOR, name: 'Sensor neu', failureRate: 2.5e-5 })
    expect(saved.diagrams.fehlerbaum!.nodes['n-sensor-1']).toMatchObject({ label: 'Sensor neu', componentRef: SENSOR })
    expect(saved.diagrams.fehlerbaum!.nodes['n-sensor-2']).toMatchObject({ label: 'Sensor neu', componentRef: SENSOR })
    expect(saved.diagrams.fehlerbaum!.edges).toEqual(diagram.edges)
    expect(saved.diagrams.fehlerbaum!.layout).toEqual(diagram.layout)
    const bdd = buildBddFromDiagram(saved.diagrams.fehlerbaum!, saved.components)
    expect(systemReliability(bdd, saved.components, saved.parameters.missionTimeHours))
      .not.toBe(systemReliability(bdd, original.components, original.parameters.missionTimeHours))
    expect(() => systemAvailability(bdd, saved.components)).toThrow()

    initial.unmount()
    const reloaded = render(<App />)
    importText(reloaded.container, JSON.stringify(saved))
    const shared = await screen.findAllByRole('button', { name: 'Element Sensor neu auswählen' })
    fireEvent.keyDown(shared[0], { key: 'Enter' })
    expect(screen.getByLabelText(/Ausfallrate/)).toHaveValue('0.000025')
    expect(screen.getByLabelText(/Reparaturrate/)).toHaveValue('')
    expect(screen.getByLabelText(/Missionsdauer/)).toHaveValue('120.5')
    expect(screen.getByLabelText(/Prüfintervall/)).toHaveValue('8.761e+0')
    expect(await exportProject()).toEqual(saved)
  })

  it('renames a newly created node via its component name and explains a custom label', async () => {
    render(<App />)
    await userEvent.dblClick(screen.getByText('Standardeingang'))
    fireEvent.change(screen.getByLabelText('Komponentenname'), { target: { value: 'Sensor' } })
    fireEvent.change(screen.getByLabelText(/Ausfallrate/), { target: { value: '1e-6' } })
    const form = within(screen.getByRole('form', { name: 'Komponenteneigenschaften' }))
    fireEvent.click(form.getByRole('button', { name: 'Übernehmen' }))
    const node = screen.getByRole('button', { name: 'Element Sensor auswählen' })
    await userEvent.dblClick(node)
    const label = screen.getByRole('textbox', { name: 'Elementbeschriftung bearbeiten' })
    await userEvent.clear(label)
    await userEvent.type(label, 'Sensor links{Enter}')
    expect(form.getByText(/eigene Beschriftung „Sensor links“/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Komponentenname'), { target: { value: 'Sensor neu' } })
    fireEvent.click(form.getByRole('button', { name: 'Übernehmen' }))
    expect(screen.getByRole('button', { name: 'Element Sensor links auswählen' })).toBeInTheDocument()
    expect(form.getByLabelText('Komponentenname')).toHaveValue('Sensor neu')
  })

  it('saves incomplete trees and preserves the current tree on failed imports', async () => {
    const { container } = render(<App />)
    await userEvent.dblClick(screen.getByText('ODER-Verknüpfung'))
    const saved = await exportProject()
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {})
    importText(container, '{')
    await waitFor(() => expect(alert).toHaveBeenCalledTimes(1))
    expect(await exportProject()).toEqual(saved)
    const invalid = structuredClone(saved)
    invalid.diagrams.fehlerbaum = {
      ...invalid.diagrams.fehlerbaum!,
      edges: [{ id: asEdgeId('bad'), from: asNodeId('missing'), to: asNodeId('missing') }],
    }
    importText(container, JSON.stringify(invalid))
    await waitFor(() => expect(alert).toHaveBeenCalledTimes(2))
    expect(await exportProject()).toEqual(saved)
    importText(container, JSON.stringify(createEmptyProject('Leer')))
    await waitFor(() => expect(screen.queryByText('ODER 1')).not.toBeInTheDocument())
    expect((await exportProject()).name).toBe('Leer')
  })
})
