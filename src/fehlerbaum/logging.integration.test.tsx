import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { appLogger } from '../debug/appLogger'
import type { LogEntry } from '../debug/logger'
import { asComponentId, asNodeId, createEmptyProject, emptyDiagram } from '../core'
import { FaultTree } from './model'

const originalElementFromPoint = document.elementFromPoint
let baseline: number
let downloads: Blob[]

beforeEach(() => {
  appLogger.setDebugEnabled(false)
  baseline = appLogger.getEntries().length
  downloads = []
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn((blob: Blob) => { downloads.push(blob); return 'blob:log' }),
    revokeObjectURL: vi.fn(),
  })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  appLogger.setDebugEnabled(false)
  document.elementFromPoint = originalElementFromPoint
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function entries() { return appLogger.getEntries().slice(baseline) }

function dragConnection(container: HTMLElement, fromId: string, toId: string) {
  const out = container.querySelector(`[data-stub=out][data-element-id="${fromId}"]`)!
  const input = container.querySelector(`[data-stub=in][data-element-id="${toId}"]`)!
  document.elementFromPoint = () => input
  fireEvent.pointerDown(out, { button: 0, clientX: 10, clientY: 10 })
  fireEvent.pointerUp(window, { clientX: 20, clientY: 20 })
}

function nodeId(label: string) {
  return screen.getByText(label).closest('g')!.querySelector<SVGElement>('[data-element-id]')!.dataset.elementId!
}

async function rename(label: string, value: string) {
  await userEvent.dblClick(screen.getByText(label).closest('g')!)
  await userEvent.clear(screen.getByRole('textbox'))
  await userEvent.type(screen.getByRole('textbox'), `${value}{Enter}`)
}

async function downloadLog() {
  fireEvent.click(screen.getByRole('button', { name: 'Debug-Log exportieren' }))
  const text = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsText(downloads.at(-1)!)
  })
  return JSON.parse(text) as { entries: LogEntry[]; projectState?: ReturnType<typeof createEmptyProject> }
}

function importProject(container: HTMLElement, project: ReturnType<typeof createEmptyProject>) {
  const text = JSON.stringify(project)
  const file = new File([text], 'test.safety.json', { type: 'application/json' })
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(text) })
  fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [file] } })
}

describe('editor domain logging and real debug downloads', () => {
  it('exports successful UI edits with occurrence IDs, component identities and the common project snapshot', async () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Debug-Modus' }))
    await userEvent.dblClick(screen.getByText('Standardeingang'))
    await userEvent.dblClick(screen.getByText('ODER-Verknüpfung'))
    const input = nodeId('Eingang 1')
    const gate = nodeId('ODER 1')
    dragConnection(container, input, gate)
    await rename('Eingang 1', 'Sensor A')
    const element = screen.getByText('Sensor A').closest('g')!
    fireEvent.pointerDown(element, { button: 0, clientX: 10, clientY: 10 })
    for (let i = 1; i <= 20; i++) fireEvent.pointerMove(window, { clientX: 10 + i, clientY: 10 + i })
    expect(entries().some((entry) => entry.action === 'fault-tree-element-moved')).toBe(false)
    fireEvent.pointerUp(window)
    fireEvent.pointerDown(container.querySelector('.ft-connection-hit')!, { button: 0 })
    await userEvent.keyboard('{Delete}')
    dragConnection(container, input, gate)
    fireEvent.pointerDown(screen.getByText('ODER 1').closest('g')!, { button: 0 })
    await userEvent.keyboard('{Delete}')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Projektstand einschließen' }))
    const exported = await downloadLog()
    const logged = exported.entries.slice(baseline)
    expect(logged.map((entry) => entry.action)).toEqual([
      'fault-tree-element-created', 'fault-tree-element-created', 'fault-tree-connected',
      'fault-tree-element-renamed', 'fault-tree-element-moved', 'fault-tree-disconnected',
      'fault-tree-connected', 'fault-tree-element-deleted',
    ])
    const snapshot = exported.projectState!
    const ref = snapshot.diagrams.fehlerbaum!.nodes[input].componentRef!
    expect(ref).not.toBe(input)
    expect(snapshot.components[ref]).toBeDefined()
    expect(snapshot.diagrams.fehlerbaum!.nodes[input].label).toBe('Sensor A')
    expect(snapshot.diagrams.fehlerbaum!.layout[input]).toEqual({ x: 60, y: 60 })
    expect(snapshot.diagrams.fehlerbaum!.nodes[gate]).toBeUndefined()
    expect(logged[0]).toMatchObject({ level: 'debug', nodeIds: [input], componentIds: [ref] })
    expect(logged[1]).toMatchObject({ nodeIds: [gate], componentIds: [] })
    for (const entry of logged.filter((entry) => entry.action !== 'fault-tree-element-created')) {
      expect(entry.componentIds).toEqual([ref])
      expect(entry.nodeIds).toContain(input)
    }
    expect(logged.at(-1)?.nodeIds).toEqual([gate, input])
    expect(logged.every((entry) => !Number.isNaN(Date.parse(entry.timestamp)))).toBe(true)
    fireEvent.pointerDown(screen.getByText('Sensor A').closest('g')!, { button: 0 })
    await userEvent.keyboard('{Delete}')
    const afterDelete = await downloadLog()
    expect(afterDelete.entries.at(-1)).toMatchObject({
      action: 'fault-tree-element-deleted', nodeIds: [input], componentIds: [ref],
    })
    expect(Object.keys(afterDelete.projectState!.diagrams.fehlerbaum!.nodes)).toHaveLength(0)
  })

  it('does not log rejected/cancelled connections, clicks, cancelled moves or no-op renames as successes', async () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Debug-Modus' }))
    await userEvent.dblClick(screen.getByText('Standardeingang'))
    await userEvent.dblClick(screen.getByText('ODER-Verknüpfung'))
    const input = nodeId('Eingang 1')
    const gate = nodeId('ODER 1')
    const before = entries().length
    const out = container.querySelector(`[data-stub=out][data-element-id="${input}"]`)!
    const target = container.querySelector(`[data-stub=in][data-element-id="${gate}"]`)!
    document.elementFromPoint = () => target
    for (const cancellation of ['escape', 'pointercancel', 'empty']) {
      fireEvent.pointerDown(out, { button: 0, clientX: 10, clientY: 10 })
      if (cancellation === 'escape') await userEvent.keyboard('{Escape}')
      else if (cancellation === 'pointercancel') fireEvent.pointerCancel(window)
      else document.elementFromPoint = () => null
      fireEvent.pointerUp(window, { clientX: 20, clientY: 20 })
    }
    await rename('Eingang 1', 'Eingang 1')
    const element = screen.getByText('Eingang 1').closest('g')!
    fireEvent.pointerDown(element, { button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(window, { clientX: 30, clientY: 30 })
    fireEvent.pointerCancel(window)
    expect(entries()).toHaveLength(before)
    dragConnection(container, input, gate)
    const connected = entries().length
    dragConnection(container, input, gate) // Already connected.
    dragConnection(container, gate, gate) // Same element.
    expect(entries()).toHaveLength(connected)
    expect((await downloadLog()).entries.slice(baseline).filter((entry) => entry.action === 'fault-tree-connected')).toHaveLength(1)
  })

  it('stores no ordinary editor actions with debugging disabled, but captures real exceptions', async () => {
    const { container } = render(<App />)
    await userEvent.dblClick(screen.getByText('Standardeingang'))
    await userEvent.dblClick(screen.getByText('ODER-Verknüpfung'))
    const input = nodeId('Eingang 1')
    const gate = nodeId('ODER 1')
    dragConnection(container, input, gate)
    fireEvent.pointerDown(container.querySelector('.ft-connection-hit')!, { button: 0 })
    await userEvent.keyboard('{Delete}')
    await rename('Eingang 1', 'Sensor A')
    fireEvent.pointerDown(screen.getByText('Sensor A').closest('g')!, { button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(window, { clientX: 30, clientY: 30 })
    fireEvent.pointerUp(window)
    expect(entries()).toEqual([])
    const failure = new Error('Connection mutation failed')
    vi.spyOn(FaultTree.prototype, 'connect').mockImplementation(() => { throw failure })
    // Native window listeners propagate errors to the browser; prevent jsdom reporting it
    // as an unhandled test failure while verifying that the original error still escapes.
    const onError = vi.fn((event: ErrorEvent) => { event.preventDefault() })
    window.addEventListener('error', onError)
    try { dragConnection(container, input, gate) } finally { window.removeEventListener('error', onError) }
    expect(onError).toHaveBeenCalledOnce()
    expect(onError.mock.calls[0][0].error).toBe(failure)
    expect(entries()).toEqual([expect.objectContaining({
      action: 'fault-tree-connected', level: 'error', message: failure.message,
      stack: failure.stack, nodeIds: [input, gate],
    })])
    // Enabling debugging exposes the existing download UI; it does not recreate the error.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Debug-Modus' }))
    const exported = await downloadLog()
    expect(exported.entries.slice(baseline)).toEqual(entries())
    expect(exported.entries.at(-1)?.componentIds).toHaveLength(1)
  })

  it('keeps two imported occurrences distinguishable while logging their shared component once', async () => {
    const { container } = render(<App />)
    const project = createEmptyProject('Shared')
    const ref = asComponentId('shared-sensor')
    project.components = { [ref]: { id: ref, name: 'Sensor', failureRate: 0.001 } }
    project.diagrams.fehlerbaum = {
      ...emptyDiagram(),
      nodes: {
        first: { id: asNodeId('first'), kind: 'basicEvent', componentRef: ref, label: 'First' },
        second: { id: asNodeId('second'), kind: 'basicEvent', componentRef: ref, label: 'Second' },
        gate: { id: asNodeId('gate'), kind: 'and', label: 'TOP' },
      },
    }
    importProject(container, project)
    await screen.findByText('First')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Debug-Modus' }))
    dragConnection(container, 'first', 'gate')
    dragConnection(container, 'second', 'gate')
    fireEvent.pointerDown(screen.getByText('TOP').closest('g')!, { button: 0 })
    await userEvent.keyboard('{Delete}')
    const exported = await downloadLog()
    expect(exported.entries.slice(baseline)).toEqual([
      expect.objectContaining({ action: 'fault-tree-connected', nodeIds: ['first', 'gate'], componentIds: [ref] }),
      expect.objectContaining({ action: 'fault-tree-connected', nodeIds: ['second', 'gate'], componentIds: [ref] }),
      expect.objectContaining({ action: 'fault-tree-element-deleted', nodeIds: ['gate', 'first', 'second'], componentIds: [ref] }),
    ])
  })
})
