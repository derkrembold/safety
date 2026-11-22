import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { asComponentId } from '../core'
import { ComponentParameters, ProjectParameterPanel } from './ParameterPanels'

const component = { id: asComponentId('c-1'), name: 'Sensor', failureRate: 1e-5, repairRate: 0.1 }

describe('Dauertexte als title-Tooltip statt dauerhaft sichtbar (#51)', () => {
  it('Komponentenfeld: die drei Erläuterungssätze sind nicht mehr als Text sichtbar, sondern als title am passenden Element', () => {
    render(<ComponentParameters component={component} occurrenceLabel="Sensor" onSave={() => {}} />)
    expect(screen.queryByText(/Änderungen gelten für alle Vorkommen/)).toBeNull()
    expect(screen.queryByText(/λ_DU für PFDavg/)).toBeNull()
    expect(screen.queryByText(/Ohne Reparaturrate kann die Verfügbarkeit/)).toBeNull()
    expect(screen.getByText('Identität', { exact: false })).toHaveAttribute(
      'title', 'Änderungen gelten für alle Vorkommen dieser Komponente in allen Reitern.')
    expect(screen.getByText('Ausfallrate λ (1/h)')).toHaveAttribute(
      'title', 'Dieselbe Ausfallrate wird als λ_DU für PFDavg verwendet.')
    expect(screen.getByText('Reparaturrate μ (1/h, optional)')).toHaveAttribute(
      'title', 'Ohne Reparaturrate kann die Verfügbarkeit nicht berechnet werden.')
  })

  it('Projektparameter: der Erläuterungssatz ist nicht mehr als Text sichtbar, sondern als title an der Überschrift', () => {
    render(<ProjectParameterPanel parameters={{ missionTimeHours: 8760, testIntervalHours: 8760 }} onSave={() => {}} />)
    expect(screen.queryByText(/Diese Werte gelten für das gesamte Projekt/)).toBeNull()
    expect(screen.getByRole('heading', { name: 'Projektparameter' })).toHaveAttribute(
      'title', 'Diese Werte gelten für das gesamte Projekt. Gib Stunden ohne Tausendertrennzeichen ein, zum Beispiel 8760.')
  })
})
