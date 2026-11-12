import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { validateComponent, validateParameters } from '../core/validation'
import type { ComponentDefinition, ProjectParameters } from '../project/types'

function parseNumber(text: string): number {
  const value = text.trim()
  if (!/^[+-]?(?:[0-9]+(?:[.,][0-9]+)?|[.,][0-9]+)(?:e[+-]?[0-9]+)?$/i.test(value)) return NaN
  return Number(value.replace(',', '.'))
}

const numberError = 'Gib eine endliche Zahl größer als 0 ein, zum Beispiel 1e-6 oder 0,001.'

function Field({ label, value, onChange, error }: {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
}) {
  const id = useId()
  return (
    <div className="ft-parameter-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? id + '-error' : undefined}
      />
      {error && <span id={id + '-error'} role="alert">{error}</span>}
    </div>
  )
}

export function ComponentParameters({ component, onSave }: {
  component: ComponentDefinition
  onSave: (component: ComponentDefinition) => void
}) {
  const [name, setName] = useState(component.name)
  const [failure, setFailure] = useState(component.failureRate === 0 ? '' : String(component.failureRate))
  const [repair, setRepair] = useState(component.repairRate === undefined ? '' : String(component.repairRate))
  const [submitted, setSubmitted] = useState(false)
  const updated = {
    ...component,
    name: name.trim(),
    failureRate: parseNumber(failure),
    repairRate: repair.trim() === '' ? undefined : parseNumber(repair),
  }
  const issues = validateComponent(updated)
  const invalid = (code: string) => issues.some((issue) => issue.code === code)
  const dirty = name !== component.name ||
    failure !== (component.failureRate === 0 ? '' : String(component.failureRate)) ||
    repair !== (component.repairRate === undefined ? '' : String(component.repairRate))

  function reset() {
    setName(component.name)
    setFailure(component.failureRate === 0 ? '' : String(component.failureRate))
    setRepair(component.repairRate === undefined ? '' : String(component.repairRate))
    setSubmitted(false)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (!updated.name || issues.some((issue) => issue.severity === 'error')) return
    onSave(updated)
    setName(updated.name)
    setFailure(String(updated.failureRate))
    setRepair(updated.repairRate === undefined ? '' : String(updated.repairRate))
    setSubmitted(false)
  }

  return (
    <form className="ft-parameters" aria-label="Komponenteneigenschaften" onSubmit={submit}>
      <h3>Komponente</h3>
      <p>Identität <code>{component.id}</code>. Änderungen gelten für alle Vorkommen dieser Komponente in allen Reitern.</p>
      <Field label="Komponentenname" value={name} onChange={setName}
        error={submitted && !updated.name ? 'Gib einen Komponentennamen ein.' : undefined} />
      <Field label="Ausfallrate λ (1/h)" value={failure} onChange={setFailure}
        error={submitted && invalid('INVALID_FAILURE_RATE') ? numberError : undefined} />
      <p>Dieselbe Ausfallrate wird als λ_DU für PFDavg verwendet.</p>
      <Field label="Reparaturrate μ (1/h, optional)" value={repair} onChange={setRepair}
        error={submitted && invalid('INVALID_REPAIR_RATE') ? numberError : undefined} />
      <p>Ohne Reparaturrate kann die Verfügbarkeit nicht berechnet werden.</p>
      <Actions dirty={dirty} onCancel={reset} />
    </form>
  )
}

export function ProjectParameterPanel({ parameters, onSave }: {
  parameters: ProjectParameters
  onSave: (parameters: ProjectParameters) => void
}) {
  const [mission, setMission] = useState(String(parameters.missionTimeHours))
  const [interval, setInterval] = useState(String(parameters.testIntervalHours))
  const [submitted, setSubmitted] = useState(false)
  const updated = { missionTimeHours: parseNumber(mission), testIntervalHours: parseNumber(interval) }
  const issues = validateParameters(updated)
  const dirty = mission !== String(parameters.missionTimeHours) || interval !== String(parameters.testIntervalHours)

  function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (issues.length) return
    onSave(updated)
    setMission(String(updated.missionTimeHours))
    setInterval(String(updated.testIntervalHours))
    setSubmitted(false)
  }

  return (
    <form className="ft-parameters" aria-label="Projektparameter" onSubmit={submit}>
      <h3>Projektparameter</h3>
      <p>Diese Werte gelten für das gesamte Projekt.</p>
      <Field label="Missionsdauer t (h)" value={mission} onChange={setMission}
        error={submitted && issues.some((issue) => issue.code === 'INVALID_MISSION_TIME') ? numberError : undefined} />
      <Field label="Prüfintervall τ (h)" value={interval} onChange={setInterval}
        error={submitted && issues.some((issue) => issue.code === 'INVALID_TEST_INTERVAL') ? numberError : undefined} />
      <Actions dirty={dirty} onCancel={() => {
        setMission(String(parameters.missionTimeHours))
        setInterval(String(parameters.testIntervalHours))
        setSubmitted(false)
      }} />
    </form>
  )
}

function Actions({ dirty, onCancel }: { dirty: boolean; onCancel: () => void }) {
  return (
    <div className="ft-parameter-actions">
      <button type="submit" disabled={!dirty}>Übernehmen</button>
      <button type="button" disabled={!dirty} onClick={onCancel}>Abbrechen</button>
    </div>
  )
}
