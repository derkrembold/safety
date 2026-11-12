import type { ComponentDefinition, Project } from '../core'
import { buildBddFromDiagram, systemReliability, systemAvailability, systemPfdAvg, bddFailureProbability } from '../core/bdd'
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
export interface Results {
  reliability: Value; failure: Value; availability: Value; unavailability: Value; pfd: Value
  components: ComponentResult[]; cutSets: readonly (readonly ComponentId[])[]; cutSetError?: string
  warnings: string[]
}
function positive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} fehlt oder ist ungültig (endliche Zahl > 0 erforderlich).`)
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
  const validRates = () => { for (const c of components) positive(c.failureRate, `Ausfallrate λ für ${c.name} (${c.id})`) }
  const validRepair = () => { for (const c of components) { if (c.repairRate === undefined) throw new Error('Nicht berechenbar – Reparaturrate fehlt.'); positive(c.repairRate, `Reparaturrate μ für ${c.name}`) } }
  const failure = (graph: Bdd, defs: ComponentDefinition[]) => bddFailureProbability(graph, new Map(defs.map(c => [c.id, -Math.expm1(-c.failureRate * t)])))
  const unavailable = (graph: Bdd, defs: ComponentDefinition[]) => bddFailureProbability(graph, new Map(defs.map(c => {
    const mu = c.repairRate!, lambda = c.failureRate
    return [c.id, lambda <= mu ? (lambda / mu) / (1 + lambda / mu) : 1 / (1 + mu / lambda)]
  })))
  let cutSets: Results['cutSets'] = [], cutSetError: string | undefined
  try { cutSets = minimalCutSets(bdd) } catch (e) { cutSetError = String(e instanceof Error ? e.message : e) }
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
    }), cutSets, cutSetError,
    warnings: components.some(c => c.failureRate * tau >= .1) ? ['λ · τ ≥ 0,1: Die lineare PFD-Näherung ist außerhalb des Bereichs kleiner Produkte. q(t) wird auf [0,1] begrenzt.'] : [],
  }
}
