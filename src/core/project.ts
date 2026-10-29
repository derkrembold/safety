import type { ComponentDefinition } from './component'
import type { DiagramDocument, TabId } from './diagram'
import { TAB_IDS, occurrencesOf } from './diagram'
import type { ComponentId, NodeId } from './ids'
import type { ComponentPatch, ComponentRegistry } from './registry'
import { emptyRegistry, putComponent, removeComponent, updateComponent } from './registry'

/** Schema version of a project file, for forward-compatible loading of older files. */
export const PROJECT_VERSION = 1

/**
 * Parameters that hold for the whole project, not per component.
 *
 * One shared mission time and one shared test interval are a deliberate modelling
 * decision from `Konzept.md`: the test interval assumes synchronous, perfect proof tests
 * of all components.
 */
export interface ProjectParameters {
  /** Mission duration t in hours, used for reliability R(t). */
  missionTimeHours: number
  /** Proof test interval tau in hours, used for PFDavg averaging. */
  testIntervalHours: number
}

/**
 * A whole project: one component registry, shared parameters, and up to three diagram
 * documents that all describe the same system in a different representation.
 *
 * The shape stays flat and keeps `version` as a field of the project itself, which is
 * the file format documented in `Konzept.md` and already produced by the import/export
 * from issue #1.
 */
export interface Project {
  /** Schema version, for forward-compatible loading of older project files. */
  version: typeof PROJECT_VERSION
  name: string
  createdAt: string
  modifiedAt: string
  parameters: ProjectParameters
  components: ComponentRegistry
  diagrams: Partial<Record<TabId, DiagramDocument>>
}

export const DEFAULT_PARAMETERS: ProjectParameters = {
  missionTimeHours: 8760,
  testIntervalHours: 8760,
}

/**
 * Creates an empty project. This is the factory the app uses for "new project".
 */
export function createEmptyProject(
  name: string,
  parameters: ProjectParameters = DEFAULT_PARAMETERS,
  now: string = new Date().toISOString(),
): Project {
  return {
    version: PROJECT_VERSION,
    name,
    createdAt: now,
    modifiedAt: now,
    parameters,
    components: emptyRegistry(),
    diagrams: {},
  }
}

function touch(project: Project, now?: string): Project {
  return { ...project, modifiedAt: now ?? new Date().toISOString() }
}

export function renameProject(project: Project, name: string): Project {
  return touch({ ...project, name })
}

export function setParameters(project: Project, parameters: ProjectParameters): Project {
  return touch({ ...project, parameters })
}

/** Inserts or replaces a component identity. */
export function putProjectComponent(project: Project, component: ComponentDefinition): Project {
  return touch({ ...project, components: putComponent(project.components, component) })
}

/**
 * Patches one component identity. Because occurrences only hold references, a rate
 * change here is immediately in effect for every occurrence in every tab.
 */
export function patchProjectComponent(
  project: Project,
  id: ComponentId,
  patch: ComponentPatch,
): Project {
  return touch({ ...project, components: updateComponent(project.components, id, patch) })
}

export function removeProjectComponent(project: Project, id: ComponentId): Project {
  return touch({ ...project, components: removeComponent(project.components, id) })
}

export function setDiagram(project: Project, tab: TabId, diagram: DiagramDocument): Project {
  return touch({ ...project, diagrams: { ...project.diagrams, [tab]: diagram } })
}

export function getDiagram(project: Project, tab: TabId): DiagramDocument | undefined {
  return project.diagrams[tab]
}

/** One occurrence of a component identity, located by tab. */
export interface ComponentUsage {
  tab: TabId
  nodeId: NodeId
}

/**
 * Every occurrence of one component identity across all tabs.
 *
 * This is the query that makes the shared identity observable: more than one usage means
 * the sub-structures involved are *not* independent, so system probabilities must go
 * through the BDD rather than through AND/OR product formulas.
 */
export function usagesOf(project: Project, component: ComponentId): ComponentUsage[] {
  const usages: ComponentUsage[] = []
  for (const tab of TAB_IDS) {
    const diagram = project.diagrams[tab]
    if (diagram === undefined) continue
    for (const nodeId of occurrencesOf(diagram, component)) {
      usages.push({ tab, nodeId })
    }
  }
  return usages
}

export function usageCount(project: Project, component: ComponentId): number {
  return usagesOf(project, component).length
}

/** Identities that are defined but not used by any diagram. */
export function orphanedComponents(project: Project): ComponentId[] {
  return Object.keys(project.components)
    .map((raw) => raw as ComponentId)
    .filter((id) => usageCount(project, id) === 0)
    .sort((a, b) => a.localeCompare(b))
}
