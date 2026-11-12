import { expect, it } from 'vitest'
import { asComponentId } from '../ids'
import { createExprBuilder } from '../logic/builder'
import { buildBdd } from './build'
import { minimalCutSets } from './cutSets'

it('MCS describe exactly all failed assignments and every member is necessary', () => {
  const builder = createExprBuilder(), ids = ['a','b','c','d'].map(asComponentId)
  const [a,b,c,d] = ids.map(id => builder.var(id))
  const expression = builder.or([builder.and([a,b]),builder.and([a,c]),builder.and([b,c,d]),builder.and([a,b,d])])
  const sets = minimalCutSets(buildBdd(expression))
  const truth = (s: Set<string>) => (s.has('a') && s.has('b')) || (s.has('a') && s.has('c')) || (s.has('b') && s.has('c') && s.has('d'))
  for (let mask = 0; mask < 16; mask++) {
    const failed = new Set(ids.filter((_,i) => mask & (1<<i)))
    expect(sets.some(set => set.every(id => failed.has(id)))).toBe(truth(failed))
  }
  for (const set of sets) {
    expect(truth(new Set(set))).toBe(true)
    for (const id of set) expect(truth(new Set(set.filter(other => other !== id)))).toBe(false)
  }
  expect(sets).toHaveLength(3)
})
