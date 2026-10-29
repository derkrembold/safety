import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DebugControls } from './DebugControls'
import { createDebugLogger } from './logger'

describe('DebugControls', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:debug-log'), revokeObjectURL: vi.fn() })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('toggles action logging and reflects external changes of the shared logger', () => {
    const logger = createDebugLogger()
    render(<DebugControls logger={logger} />)
    const toggle = screen.getByRole('checkbox', { name: 'Debug-Modus' })
    expect(toggle).not.toBeChecked()
    fireEvent.click(toggle)
    expect(logger.logAction('gate-connected')).toBe(true)
    act(() => logger.setDebugEnabled(false))
    expect(toggle).not.toBeChecked()
    expect(logger.logAction('ignored')).toBe(false)
  })

  it('downloads JSON without including the project unless explicitly selected', () => {
    const logger = createDebugLogger()
    const exportSpy = vi.spyOn(logger, 'exportJson')
    const project = { name: 'Test project', version: 1 }
    const getProjectState = vi.fn(() => project)
    render(<DebugControls logger={logger} getProjectState={getProjectState} />)
    const exportButton = screen.getByRole('button', { name: 'Debug-Log exportieren' })
    fireEvent.click(exportButton)
    expect(getProjectState).not.toHaveBeenCalled()
    expect(exportSpy).toHaveBeenLastCalledWith({ projectState: undefined })
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce()
    expect(screen.getByRole('status')).toHaveTextContent('Export zum Download bereitgestellt.')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Projektstand einschließen' }))
    fireEvent.click(exportButton)
    expect(getProjectState).toHaveBeenCalledOnce()
    expect(exportSpy).toHaveBeenLastCalledWith({ projectState: project })
    expect(document.querySelector('a[download]')).toBeNull()
    vi.runOnlyPendingTimers()
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2)
  })

  it('hides the project option when no project provider exists', () => {
    render(<DebugControls logger={createDebugLogger()} />)
    expect(screen.queryByRole('checkbox', { name: 'Projektstand einschließen' })).not.toBeInTheDocument()
  })

  it('reports export failures and logs them even with debugging disabled', () => {
    const logger = createDebugLogger()
    vi.spyOn(logger, 'exportJson').mockImplementation(() => { throw new Error('Cannot serialize project') })
    render(<DebugControls logger={logger} />)
    fireEvent.click(screen.getByRole('button', { name: 'Debug-Log exportieren' }))
    expect(screen.getByRole('status')).toHaveTextContent('Export fehlgeschlagen')
    expect(logger.getEntries()[0]).toMatchObject({
      level: 'error', action: 'debug-export-failed', message: 'Cannot serialize project',
    })
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })
})
