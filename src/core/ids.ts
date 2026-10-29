/**
 * Branded identifier types for the shared data model.
 *
 * The distinction between {@link ComponentId} and {@link NodeId} carries the central
 * idea of this model: a `NodeId` names a single *occurrence* inside one diagram, while
 * a `ComponentId` names a *component identity* that stays the same across every
 * occurrence and across all three tabs (see `Konzept.md`, "Berechnungsgrundlagen").
 *
 * Two occurrences that share a `ComponentId` are the same Boolean variable, not two
 * independent copies — which is why the independence assumption only ever holds between
 * *different* `ComponentId`s.
 */

declare const brandKey: unique symbol

type Branded<T, B extends string> = T & { readonly [brandKey]: B }

export type ComponentId = Branded<string, 'ComponentId'>
export type NodeId = Branded<string, 'NodeId'>
export type EdgeId = Branded<string, 'EdgeId'>

/** Wraps a raw string as a {@link ComponentId} (for deserialisation and tests). */
export const asComponentId = (raw: string): ComponentId => raw as ComponentId
export const asNodeId = (raw: string): NodeId => raw as NodeId
export const asEdgeId = (raw: string): EdgeId => raw as EdgeId

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback for environments without the WebCrypto API; collision risk is irrelevant
  // here because ids only have to be unique within a single project file.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export const newComponentId = (): ComponentId => asComponentId(`c-${uuid()}`)
export const newNodeId = (): NodeId => asNodeId(`n-${uuid()}`)
export const newEdgeId = (): EdgeId => asEdgeId(`e-${uuid()}`)
