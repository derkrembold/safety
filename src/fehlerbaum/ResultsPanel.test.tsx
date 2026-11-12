import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { it, expect } from 'vitest'
import { sharedSensorProject, SENSOR } from '../core/fixtures'
import { ResultsPanel } from './ResultsPanel'

it('calculates, collapses and marks both system and component results stale after edits', async () => {
  const user = userEvent.setup(), p = sharedSensorProject()
  const {rerender} = render(<ResultsPanel project={p}/> )
  await user.click(screen.getByRole('button',{name:'Berechnen'}))
  expect(screen.getByText('Berechnet für den angezeigten Modellstand.')).toBeInTheDocument()
  await user.click(screen.getByText('Eingangsereignisse (3 Identitäten)'))
  expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(4)
  const updated = {...p, components: {...p.components,[SENSOR]:{...p.components[SENSOR],failureRate:2e-5}}}
  rerender(<ResultsPanel project={updated}/> )
  expect(screen.getByText('Veraltet – Modell oder Parameter geändert.')).toBeInTheDocument()
  expect(screen.getByText(/Komponentenwerte.*veraltet/)).toBeInTheDocument()
  expect(within(screen.getByRole('table')).getByText('1,00000e-5')).toBeInTheDocument()
  await user.click(screen.getByRole('button',{name:'Neu berechnen'}))
  expect(screen.getByText('Berechnet für den angezeigten Modellstand.')).toBeInTheDocument()
  expect(within(screen.getByRole('table')).queryByText('1,00000e-5')).not.toBeInTheDocument()
  const slider = screen.getByRole('slider',{name:/Höhe Ergebnisbereich/})
  fireEvent.change(slider,{target:{value:'420'}})
  expect(slider).toHaveValue('420')
  await user.click(screen.getByRole('button',{name:'Ergebnisse einklappen'}))
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button',{name:'Ergebnisse aufklappen'}))
  expect(screen.getByRole('heading',{name:'Minimal Cut Sets (MCS)'})).toBeInTheDocument()
})
it('shows partial results and replaces them after an invalid model calculation', async () => {
  const p = sharedSensorProject(); p.components = {...p.components,[SENSOR]:{...p.components[SENSOR],repairRate:undefined}}
  const {rerender} = render(<ResultsPanel project={p}/> )
  await userEvent.click(screen.getByRole('button',{name:'Berechnen'}))
  expect(screen.getAllByText(/Nicht berechenbar – Reparaturrate fehlt/).length).toBeGreaterThan(0)
  rerender(<ResultsPanel project={{...p,diagrams:{}}}/> )
  await userEvent.click(screen.getByRole('button',{name:'Neu berechnen'}))
  expect(screen.getByRole('alert')).toHaveTextContent('leer')
  expect(screen.queryByRole('heading',{name:'Systemwerte zur Missionsdauer'})).not.toBeInTheDocument()
})
