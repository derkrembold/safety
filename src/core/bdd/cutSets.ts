import type { Bdd } from './types'
import type { ComponentId } from '../ids'

/** Minimal satisfying sets of a monotone BDD; supersets are absorbed at each node. */
export function minimalCutSets(bdd: Bdd, limit = 10000): readonly (readonly ComponentId[])[] {
  const sets: ComponentId[][][] = [[], [[]]]
  let work = 0
  let storedEntries = 0
  for (let i = 2; i < bdd.nodes.length; i++) {
    const node = bdd.nodes[i]
    if (node.kind !== 'decision') throw new Error('Ungültiger BDD-Knoten.')
    const candidates = [...sets[node.low], ...sets[node.high].map(s => [...s, node.component].sort())]
      .sort((a, b) => a.length - b.length)
    const minimal: ComponentId[][] = []
    for (const candidate of candidates) {
      let absorbed = false
      for (const existing of minimal) {
        if (++work > 2000000) throw new Error('MCS-Arbeitsgrenze erreicht. Modell vereinfachen.')
        if (existing.every(id => candidate.includes(id))) { absorbed = true; break }
      }
      if (!absorbed) minimal.push(candidate)
      if (minimal.length > limit) throw new Error('MCS-Anzahl überschreitet die Darstellungsgrenze.')
    }
    sets.push(minimal)
    storedEntries += minimal.reduce((count, set) => count + set.length + 1, 0)
    if (storedEntries > 1000000) throw new Error('MCS-Speichergrenze erreicht. Modell vereinfachen.')
  }
  return [...sets[bdd.root]].sort((a,b) => a.length - b.length || JSON.stringify(a).localeCompare(JSON.stringify(b)))
}
