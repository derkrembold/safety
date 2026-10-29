/**
 * Project types for the app layer.
 *
 * The model itself lives in `src/core` (issue #5): one component registry whose
 * identities are shared by all three tabs, plus a diagram document per tab. This module
 * is the entry point the UI imports from, so components do not reach into the core
 * directly.
 */
export type {
  ComponentDefinition,
  ComponentId,
  DiagramDocument,
  NodeId,
  Project,
  ProjectParameters,
  TabId,
} from '../core'

export { DEFAULT_PARAMETERS, PROJECT_VERSION, createEmptyProject } from '../core'
