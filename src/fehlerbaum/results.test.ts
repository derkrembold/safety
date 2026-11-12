import { describe, it, expect } from 'vitest'
import { sharedSensorProject, SENSOR, VALVE_A, VALVE_B } from '../core/fixtures'
import { createEmptyProject, asComponentId } from '../core'
import { buildBdd } from '../core/bdd'
import { minimalCutSets } from '../core/bdd/cutSets'
import { calculateResults, silBand, resultsKey, formatValue } from './results'

describe('fault tree results', () => {
  it('keeps shared identities in probabilities, cut sets and the component table', () => {
    const p = sharedSensorProject(), r = calculateResults(p), t = p.parameters.missionTimeHours
    const q = (id: typeof SENSOR) => -Math.expm1(-p.components[id].failureRate*t)
    expect(r.failure.value).toBeCloseTo(q(SENSOR)*(q(VALVE_A)+q(VALVE_B)-q(VALVE_A)*q(VALVE_B)),14)
    expect(r.components).toHaveLength(3)
    expect(r.cutSets.map(s => [...s].sort())).toEqual([[SENSOR,VALVE_A].sort(),[SENSOR,VALVE_B].sort()])
    const sensor = r.components.find(c => c.component.id === SENSOR)!
    expect(sensor.failure.value).toBeCloseTo(q(SENSOR),14)
    expect(sensor.availability.value).toBeCloseTo(.1/(.1+1e-5),14)
    expect(sensor.unavailability.value).toBeCloseTo(1e-5/(.1+1e-5),14)
  })
  it.each(['and','or'] as const)('calculates simple %s gates, including system PFD integration', kind => {
    const p = sharedSensorProject(), diagram = p.diagrams.fehlerbaum!
    const nodes = Object.fromEntries(Object.entries(diagram.nodes).filter(([id]) => ['n-top','n-sensor-1','n-sensor-2'].includes(id)).map(([id,n]) => [id,id==='n-top'?{...n,kind}:n]))
    // Two occurrences of the same identity must reduce to a single component.
    const edges = diagram.edges.slice(0,2).map((e,i) => ({...e,to: nodes[i===0?'n-sensor-1':'n-sensor-2'].id}))
    p.diagrams.fehlerbaum = {...diagram,nodes,edges}
    const r = calculateResults(p)
    expect(r.cutSets).toEqual([[SENSOR]])
    expect(r.pfd.value).toBeCloseTo(1e-5*p.parameters.testIntervalHours/2,14)
    expect(r.components).toHaveLength(1)
    // Replace second occurrence with a distinct component: AND integral differs from product of means.
    nodes['n-sensor-2'] = {...nodes['n-sensor-2'],componentRef:VALVE_A}
    const second = calculateResults(p), a = 1e-5*p.parameters.testIntervalHours, b = 2e-5*p.parameters.testIntervalHours
    expect(second.pfd.value).toBeCloseTo(kind==='and' ? a*b/3 : (a+b)/2-a*b/3,14)
    expect(second.cutSets).toHaveLength(kind==='and' ? 1 : 2)
  })
  it('absorbs nonminimal supersets and duplicate MCS', () => {
    const a = asComponentId('a'), b = asComponentId('b')
    const av = {kind:'var' as const,component:a}, bv = {kind:'var' as const,component:b}
    const bdd = buildBdd({kind:'or',children:[av,{kind:'and',children:[av,bv]},av]})
    expect(minimalCutSets(bdd)).toEqual([[a]])
    expect(() => minimalCutSets(bdd,0)).toThrow(/grenze/i)
  })
  it('missing/invalid repair rates block only availability', () => {
    const p = sharedSensorProject(); p.components = {...p.components,[SENSOR]:{...p.components[SENSOR],repairRate:undefined}}
    const r = calculateResults(p)
    expect(r.availability.error).toMatch(/Reparaturrate fehlt/)
    expect(r.unavailability.error).toMatch(/Reparaturrate fehlt/)
    expect(r.reliability.value).toBeGreaterThan(0)
    expect(r.pfd.value).toBeGreaterThan(0)
    expect(r.components[0].availability.error).toMatch(/Reparaturrate fehlt/)
  })
  it('rejects empty/invalid trees, unset rates and invalid parameters explicitly', () => {
    expect(() => calculateResults(createEmptyProject('empty'))).toThrow(/leer/)
    const p = sharedSensorProject(); p.diagrams.fehlerbaum = {...p.diagrams.fehlerbaum!,edges:[]}
    expect(() => calculateResults(p)).toThrow(/ungültig/)
    const other = sharedSensorProject(); other.components = {...other.components,[SENSOR]:{...other.components[SENSOR],failureRate:0}}
    expect(calculateResults(other).reliability.error).toMatch(/Ausfallrate/)
    other.parameters = {missionTimeHours:0,testIntervalHours:Infinity}
    expect(calculateResults(other).pfd.error).toBeDefined()
    expect(calculateResults(other).cutSets).toHaveLength(2)
  })
  it('binds results to rates, parameters and topology but ignores positions', () => {
    const p = sharedSensorProject(), key = resultsKey(p)
    p.diagrams.fehlerbaum = {...p.diagrams.fehlerbaum!,layout:{}}
    expect(resultsKey(p)).toBe(key)
    p.parameters = {...p.parameters,missionTimeHours:50}
    expect(resultsKey(p)).not.toBe(key)
  })
  it('retains tiny failure tails and reports numeric limits', () => {
    const p = sharedSensorProject()
    for (const [id,c] of Object.entries(p.components)) p.components = {...p.components,[id]:{...c,failureRate:1e-30}}
    expect(calculateResults(p).failure.value).toBeGreaterThan(0)
    expect(formatValue(1e-30)).toContain('e-30')
    p.parameters.testIntervalHours = Number.MAX_VALUE
    for (const [id,c] of Object.entries(p.components)) p.components = {...p.components,[id]:{...c,failureRate:100}}
    expect(calculateResults(p).pfd.error).toMatch(/overflows/)
  })
})
describe('Low-Demand SIL boundaries', () => {
  it('uses German decimal separators for ordinary and scientific values', () => {
    expect(formatValue(0.125)).toBe('0,125')
    expect(formatValue(1.25e-8)).toBe('1,25000e-8')
  })
  it.each([[0,'Unterhalb'],[.000009999,'Unterhalb'],[1e-5,'SIL 4'],[1e-4,'SIL 3'],[1e-3,'SIL 2'],[1e-2,'SIL 1'],[.099999,'SIL 1'],[.1,'Außerhalb'],[1,'Außerhalb']] as const)('%s maps to %s', (p,label) => expect(silBand(p)).toContain(label))
  it.each([NaN,Infinity,-1,2])('rejects %s', p => expect(() => silBand(p)).toThrow())
})
