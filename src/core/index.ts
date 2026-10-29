/**
 * Public API of the representation-independent core model (issue #5).
 *
 * The core is deliberately free of any framework import, so the React layer from issue #1
 * can consume it from a reducer, a store or plain functions without the model depending
 * on that choice. All update functions are pure and return a new value.
 */
export * from './ids'
export * from './component'
export * from './registry'
export * from './diagram'
export * from './project'
export * from './validation'
export * from './serialization'
export * from './logic/expr'
export * from './logic/builder'
export * from './logic/inspect'
