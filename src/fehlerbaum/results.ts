import type { ComponentDefinition, Project } from '../core'
import { buildBddFromDiagram, buildBddFromDiagramAt, systemReliability, systemAvailability, systemPfdAvg, bddFailureProbability } from '../core/bdd'
import { minimalCutSets } from '../core/bdd/cutSets'
import type { Bdd } from '../core/bdd'
import type { ComponentId } from '../core'

export type Value = { value: number; error?: never } | { error: string; value?: never }
const attempt = (fn: () => number): Value => {
  try { const value = fn(); if (!Number.isFinite(value)) throw new Error('Numerische Grenze erreicht.'); return { value } }
  catch (e) { return { error: e instanceof Error ? e.message : String(e) } }
}
export function silBand(pfd: number): string {
  if (!Number.isFinite(pfd) || pfd < 0 || pfd > 1) throw new Error('PFDavg muss zwischen 0 und 1 liegen.')
  if (pfd < 1e-5) return 'Unterhalb des SIL-4-Bands (keine höhere SIL-Stufe)'
  if (pfd < 1e-4) return 'SIL 4'
  if (pfd < 1e-3) return 'SIL 3'
  if (pfd < 1e-2) return 'SIL 2'
  if (pfd < 1e-1) return 'SIL 1'
  return 'Außerhalb der SIL-Bänder (PFDavg ≥ 0,1)'
}
export const formatValue = (value: number): string => !Number.isFinite(value) ? 'Ungültiger Wert' : value === 0 || value === 1 ? String(value)
  : value < 1e-4 ? value.toExponential(5).replace('.', ',') : value.toLocaleString('de-DE', { maximumSignificantDigits: 7 })

/** Relevant input signature excludes layout and unrelated, unused registry entries. */
export function resultsKey(project: Project): string {
  const d = project.diagrams.fehlerbaum
  const nodes = Object.values(d?.nodes ?? {}).sort((a,b) => a.id.localeCompare(b.id))
  const ids = [...new Set(nodes.flatMap(n => n.componentRef ? [n.componentRef] : []))].sort()
  return JSON.stringify([project.createdAt, project.name, project.parameters, nodes,
    d?.edges.map(e => [e.from,e.to]).sort(), ids.map(id => project.components[id])])
}
export interface ComponentResult {
  component: ComponentDefinition
  reliability: Value; failure: Value; availability: Value; unavailability: Value
}
/** Zwischenwert-Sonde (#45): nur F(t) und die stationäre Nichtverfügbarkeit U des Teilbaums
 * an ihrem Eingang, keine eigene R(t)/PFDavg (so von Derk abgegrenzt, siehe Issue #45). */
export interface ProbeResult {
  failure: Value; unavailability: Value
}
export interface Results {
  reliability: Value; failure: Value; availability: Value; unavailability: Value; pfd: Value
  components: ComponentResult[]; cutSets: readonly (readonly ComponentId[])[]; cutSetError?: string
  /** Je Sonden-Knoten-ID (#45); leer, wenn der Baum keine Sonden enthält. */
  probes: Record<string, ProbeResult>
  warnings: string[]
}
function positive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} fehlt oder ist ungültig (endliche Zahl > 0 erforderlich).`)
}
/** Components a BDD actually references — a subtree BDD (Sonde) only needs its own,
 * not every component in the whole project, so an unrelated branch without e.g. a
 * repair rate must not block a probe whose own subtree is otherwise fine. */
function componentsOf(bdd: Bdd, components: readonly ComponentDefinition[]): ComponentDefinition[] {
  const ids = new Set(bdd.nodes.flatMap(n => n.kind === 'decision' ? [n.component] : []))
  return components.filter(c => ids.has(c.id))
}
function one(component: ComponentDefinition): Bdd {
  return { root: 2, variableOrder: [component.id], nodes: [{kind:'terminal',value:0},{kind:'terminal',value:1},{kind:'decision',component:component.id,low:0,high:1}] }
}
export function calculateResults(project: Project): Results {
  const diagram = project.diagrams.fehlerbaum
  if (!diagram || !Object.keys(diagram.nodes).length) throw new Error('Der Fehlerbaum ist leer. Bitte Eingangsereignisse und Gatter verbinden.')
  let bdd: Bdd
  try { bdd = buildBddFromDiagram(diagram, project.components) }
  catch (e) { throw new Error(`Fehlerbaum unvollständig oder ungültig: ${e instanceof Error ? e.message : e}`) }
  const ids = [...new Set(Object.values(diagram.nodes).flatMap(n => n.componentRef ? [n.componentRef] : []))].sort()
  const components = ids.map(id => ({...project.components[id]}))
  const t = project.parameters.missionTimeHours, tau = project.parameters.testIntervalHours
  const needRates = (defs: readonly ComponentDefinition[]) => { for (const c of defs) positive(c.failureRate, `Ausfallrate λ für ${c.name} (${c.id})`) }
  const needRepair = (defs: readonly ComponentDefinition[]) => { for (const c of defs) { if (c.repairRate === undefined) throw new Error('Nicht berechenbar – Reparaturrate fehlt.'); positive(c.repairRate, `Reparaturrate μ für ${c.name}`) } }
  const validRates = () => needRates(components)
  const validRepair = () => needRepair(components)
  const failure = (graph: Bdd, defs: ComponentDefinition[]) => bddFailureProbability(graph, new Map(defs.map(c => [c.id, -Math.expm1(-c.failureRate * t)])))
  const unavailable = (graph: Bdd, defs: ComponentDefinition[]) => bddFailureProbability(graph, new Map(defs.map(c => {
    const mu = c.repairRate!, lambda = c.failureRate
    return [c.id, lambda <= mu ? (lambda / mu) / (1 + lambda / mu) : 1 / (1 + mu / lambda)]
  })))
  let cutSets: Results['cutSets'] = [], cutSetError: string | undefined
  try { cutSets = minimalCutSets(bdd) } catch (e) { cutSetError = String(e instanceof Error ? e.message : e) }
  const probes: Results['probes'] = {}
  for (const [id, node] of Object.entries(diagram.nodes)) {
    if (node.kind !== 'probe' && node.kind !== 'sonde') continue
    // The main `buildBddFromDiagram` above already succeeded, so every probe is
    // guaranteed to have exactly one input (`buildBddFromElements`'s own structural
    // check) — a missing edge here would mean that guarantee broke, which is a bug,
    // not a user-facing "nicht berechenbar" case, so it is not wrapped in `attempt`.
    const childId = diagram.edges.find(edge => edge.from === id)?.to
    if (childId === undefined) throw new Error(`Sonde ${id} ohne Eingang trotz erfolgreichem Baumaufbau.`)
    const sub = buildBddFromDiagramAt(diagram, project.components, childId)
    const subComponents = componentsOf(sub, components)
    probes[id] = {
      failure: attempt(() => { needRates(subComponents); positive(t, 'Missionsdauer t'); return failure(sub, subComponents) }),
      unavailability: attempt(() => { needRates(subComponents); needRepair(subComponents); return unavailable(sub, subComponents) }),
    }
  }
  return {
    reliability: attempt(() => { validRates(); positive(t,'Missionsdauer t'); return systemReliability(bdd,project.components,t) }),
    failure: attempt(() => { validRates(); positive(t,'Missionsdauer t'); return failure(bdd,components) }),
    availability: attempt(() => { validRates(); validRepair(); return systemAvailability(bdd,project.components) }),
    unavailability: attempt(() => { validRates(); validRepair(); return unavailable(bdd,components) }),
    pfd: attempt(() => { validRates(); positive(tau,'Prüfintervall τ'); return systemPfdAvg(bdd,project.components,tau) }),
    components: components.map(component => {
      const c = component, graph = one(c), registry = {[c.id]: c}
      const check = () => positive(c.failureRate, 'Ausfallrate λ')
      const repair = () => { if (c.repairRate === undefined) throw new Error('Nicht berechenbar – Reparaturrate fehlt.'); positive(c.repairRate,'Reparaturrate μ') }
      return { component: c,
        reliability: attempt(() => { check(); positive(t,'Missionsdauer t'); return systemReliability(graph,registry,t) }),
        failure: attempt(() => { check(); positive(t,'Missionsdauer t'); return failure(graph,[c]) }),
        availability: attempt(() => { check(); repair(); return systemAvailability(graph,registry) }),
        unavailability: attempt(() => { check(); repair(); return unavailable(graph,[c]) }),
      }
    }), cutSets, cutSetError, probes,
    warnings: components.some(c => c.failureRate * tau >= .1) ? ['λ · τ ≥ 0,1: Die lineare PFD-Näherung ist außerhalb des Bereichs kleiner Produkte. q(t) wird auf [0,1] begrenzt.'] : [],
  }
}
