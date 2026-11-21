import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FehlerbaumanalyseTab } from './Fehlerbaumanalyse'
import { FaultTree } from '../fehlerbaum/model'
import { asEdgeId, asNodeId, type Project } from '../core'
import { sharedSensorProject, SENSOR } from '../core/fixtures'

/** Fügt eine Sonde (#45) zwischen TOP und `n-and-a` ein, wie in results.test.ts. */
function withProbeAtAndA(project: Project): Project {
  const diagram = project.diagrams.fehlerbaum!
  const withNode = { ...diagram, nodes: { ...diagram.nodes, 'probe-1': { id: asNodeId('probe-1'), kind: 'probe', label: 'Sonde 1' } } }
  const rewired = {
    ...withNode,
    edges: [
      ...withNode.edges.map((edge) =>
        edge.from === asNodeId('n-top') && edge.to === asNodeId('n-and-a')
          ? { ...edge, to: asNodeId('probe-1') }
          : edge,
      ),
      { id: asEdgeId('probe-edge'), from: asNodeId('probe-1'), to: asNodeId('n-and-a') },
    ],
  }
  return { ...project, diagrams: { ...project.diagrams, fehlerbaum: rewired } }
}

describe('Fehlerbaumanalyse-Reiter: Sonde (#45) und Ergebnisbereich (#23) teilen eine Berechnung', () => {
  it('zeigt an der Sonde dieselbe Berechnung und dieselbe Veraltet-Markierung wie der Ergebnisbereich', () => {
    const project = withProbeAtAndA(sharedSensorProject())
    const tree = FaultTree.fromProject(project)
    const { rerender } = render(<FehlerbaumanalyseTab tree={tree} project={project} />)

    // Vor der ersten Berechnung: Hinweis statt einer Zahl, an der Sonde wie im Ergebnisbereich.
    expect(screen.getByText('Noch keine Berechnung.')).toBeInTheDocument()
    expect(screen.getByText('noch nicht berechnet')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Berechnen' }))
    expect(screen.getByText('Berechnet für den angezeigten Modellstand.')).toBeInTheDocument()
    // and-a = UND(Sensor, Valve A); der angezeigte Wert ist der des Teilbaums, nicht des Systems.
    const probeNode = screen.getByText('Sonde 1').closest('g')!
    expect(probeNode.querySelector('.ft-probe-readout')).not.toBeNull()
    expect(probeNode.textContent).toMatch(/F\(t\) ≈/)
    expect(probeNode.textContent).not.toContain('noch nicht berechnet')
    expect(probeNode.querySelector('.ft-probe-readout.stale')).toBeNull()

    const beforeChange = probeNode.textContent

    // Eine relevante Änderung (nicht nur ein Reiterwechsel/Import) veraltet beide
    // Anzeigen gleichzeitig, über dieselbe gehobene Momentaufnahme.
    const changed = { ...project, components: { ...project.components, [SENSOR]: { ...project.components[SENSOR], failureRate: 5e-5 } } }
    rerender(<FehlerbaumanalyseTab tree={tree} project={changed} />)
    expect(screen.getByText('Veraltet – Modell oder Parameter geändert.')).toBeInTheDocument()
    expect(probeNode.querySelector('.ft-probe-readout.stale')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Neu berechnen' }))
    expect(screen.getByText('Berechnet für den angezeigten Modellstand.')).toBeInTheDocument()
    expect(probeNode.querySelector('.ft-probe-readout.stale')).toBeNull()
    // Der angezeigte Teilbaumwert selbst muss sich mit der geänderten Rate ändern.
    expect(probeNode.textContent).not.toBe(beforeChange)
  })
})
