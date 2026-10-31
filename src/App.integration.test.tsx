import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { createEmptyProject, type Project } from './project/types'
import { asEdgeId, asNodeId } from './core'

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
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), 'Sensor A{Enter}')
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
