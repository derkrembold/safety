import { describe, expect, it, vi } from 'vitest'
import { createDebugLogger, installGlobalErrorHandlers } from './logger'

describe('debug logger', () => {
  it('records domain actions only while debugging is enabled', () => {
    const logger = createDebugLogger()
    expect(logger.logAction('gate-connected')).toBe(false)
    expect(logger.getEntries()).toEqual([])
    logger.setDebugEnabled(true)
    logger.logAction('gate-connected', { componentIds: ['a', 'b', 'a'] })
    logger.setDebugEnabled(false)
    logger.logAction('ignored')
    expect(logger.getEntries()).toEqual([
      expect.objectContaining({ action: 'gate-connected', componentIds: ['a', 'b'] }),
    ])
  })

  it('captures exceptions and their stack even with debugging disabled', () => {
    const logger = createDebugLogger()
    const error = new Error('Calculation failed')
    logger.logError('calculate', error, { componentIds: ['gate-1'] })
    expect(logger.getEntries()[0]).toMatchObject({
      level: 'error', action: 'calculate', message: error.message,
      stack: error.stack, componentIds: ['gate-1'],
    })
  })

  it('keeps the original synchronous result and exception behavior', () => {
    const logger = createDebugLogger()
    expect(logger.runAction('calculate', () => 42)).toBe(42)
    const failure = new Error('failure')
    expect(() => logger.runAction('calculate', () => { throw failure })).toThrow(failure)
    expect(logger.getEntries()[0].message).toBe('failure')
  })

  it('records asynchronous failures and passes their original reason to the caller', async () => {
    const logger = createDebugLogger()
    await expect(logger.runAction('calculate', async () => 42)).resolves.toBe(42)
    const failure = new Error('async failure')
    await expect(logger.runAction('calculate', () => Promise.reject(failure)))
      .rejects.toBe(failure)
    expect(logger.getEntries()[0]).toMatchObject({ action: 'calculate', message: 'async failure' })
  })

  it('evicts the oldest entries without exceeding the UTF-8 byte limit', () => {
    const logger = createDebugLogger({ debugEnabled: true, maxBytes: 500 })
    for (let index = 0; index < 30; index++) {
      logger.logAction(`connected-${index}-ä漢🙂`)
    }
    const entries = logger.getEntries()
    expect(entries.length).toBeGreaterThan(0)
    expect(entries.length).toBeLessThan(30)
    expect(entries.at(-1)?.action).toBe('connected-29-ä漢🙂')
    expect(entries.some((entry) => entry.action === 'connected-0-ä漢🙂')).toBe(false)
    const bytes = entries.reduce((sum, entry) => sum + new TextEncoder().encode(JSON.stringify(entry)).length, 0)
    expect(logger.byteLength).toBe(bytes)
    expect(bytes).toBeLessThanOrEqual(500)
  })

  it('retains an oversized error as a marked, truncated record', () => {
    const logger = createDebugLogger({ maxBytes: 500 })
    logger.logError('calculate', new Error('x'.repeat(10000)))
    expect(logger.getEntries()).toHaveLength(1)
    expect(logger.getEntries()[0]).toMatchObject({ level: 'error', truncated: true })
    expect(logger.byteLength).toBeLessThanOrEqual(500)
  })

  it('exports metadata, entries and an explicitly requested project snapshot', () => {
    const timestamp = '2026-10-29T08:00:00.000Z'
    const logger = createDebugLogger({
      appVersion: '1.0', commitId: 'abc123', browserVersion: 'Test browser',
      now: () => timestamp,
    })
    logger.logError('calculate', 'rejected without an Error object')
    const snapshot = { version: 1, name: 'Project' }
    expect(JSON.parse(logger.exportJson({ projectState: snapshot }))).toMatchObject({
      formatVersion: 1, exportedAt: timestamp, appVersion: '1.0', commitId: 'abc123',
      browserVersion: 'Test browser', debugEnabled: false, projectState: snapshot,
      entries: [{ timestamp, action: 'calculate', message: 'rejected without an Error object', stack: null }],
    })
    expect(JSON.parse(logger.exportJson())).not.toHaveProperty('projectState')
  })

  it('returns copies so consumers cannot change stored records or their byte accounting', () => {
    const logger = createDebugLogger({ debugEnabled: true })
    logger.logAction('connected', { componentIds: ['original'] })
    const bytes = logger.byteLength
    logger.getEntries()[0].componentIds.push('foreign')
    expect(logger.getEntries()[0].componentIds).toEqual(['original'])
    expect(logger.byteLength).toBe(bytes)
  })

  it('notifies debug-mode subscribers and supports unsubscribe', () => {
    const logger = createDebugLogger()
    const listener = vi.fn()
    const unsubscribe = logger.subscribe(listener)
    logger.setDebugEnabled(true)
    expect(listener).toHaveBeenCalledOnce()
    unsubscribe()
    logger.setDebugEnabled(false)
    expect(listener).toHaveBeenCalledOnce()
  })

  it('captures browser errors and rejected promises until handlers are removed', () => {
    const logger = createDebugLogger()
    const target = new EventTarget() as unknown as Window
    const cleanup = installGlobalErrorHandlers(logger, target)
    target.dispatchEvent(new ErrorEvent('error', { message: 'browser failure' }))
    const rejection = new Event('unhandledrejection')
    Object.defineProperty(rejection, 'reason', { value: new Error('promise failure') })
    target.dispatchEvent(rejection)
    expect(logger.getEntries().map((entry) => entry.action))
      .toEqual(['uncaught-exception', 'unhandled-rejection'])
    cleanup()
    target.dispatchEvent(new ErrorEvent('error', { message: 'after cleanup' }))
    expect(logger.getEntries()).toHaveLength(2)
  })

  it('rejects unusable buffer limits', () => {
    for (const maxBytes of [0, 255, -1, 256.5, Infinity, NaN]) {
      expect(() => createDebugLogger({ maxBytes })).toThrow(RangeError)
    }
  })
})
