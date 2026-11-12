import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { validateComponent, validateParameters } from '../core/validation'
import type { ComponentDefinition, ProjectParameters } from '../project/types'

// A single separator followed by three digits can also be a thousands separator.
const ambiguousNumber = /^[+-]?[1-9][0-9]{0,2}[.,][0-9]{3}$/

function formatNumber(value: number): string {
  const text = String(value)
  return ambiguousNumber.test(text) ? value.toExponential() : text
}

function parseNumber(text: string): number {
  const value = text.trim()
  if (ambiguousNumber.test(value)) return NaN
  if (!/^[+-]?(?:[0-9]+(?:[.,][0-9]+)?|[.,][0-9]+)(?:e[+-]?[0-9]+)?$/i.test(value)) return NaN
  return Number(value.replace(',', '.'))
}

const numberError = 'Gib eine endliche Zahl größer als 0 ohne Tausendertrennzeichen ein. Bei Mehrdeutigkeit: 8760 oder 8,760e0.'

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

export function ComponentParameters({ component, occurrenceLabel, onSave }: {
  component: ComponentDefinition
  occurrenceLabel: string
  onSave: (component: ComponentDefinition) => void
}) {
  const [name, setName] = useState(component.name)
  const savedFailure = component.failureRate === 0 ? '' : formatNumber(component.failureRate)
  const savedRepair = component.repairRate === undefined ? '' : formatNumber(component.repairRate)
  const [failure, setFailure] = useState(savedFailure)
  const [repair, setRepair] = useState(savedRepair)
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
    failure !== savedFailure || repair !== savedRepair

  function reset() {
    setName(component.name)
    setFailure(savedFailure)
    setRepair(savedRepair)
    setSubmitted(false)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (!updated.name || issues.some((issue) => issue.severity === 'error')) return
    onSave(updated)
    setName(updated.name)
    setFailure(formatNumber(updated.failureRate))
    setRepair(updated.repairRate === undefined ? '' : formatNumber(updated.repairRate))
    setSubmitted(false)
  }

  return (
    <form className="ft-parameters" aria-label="Komponenteneigenschaften" onSubmit={submit}>
      <h3>Komponente</h3>
      <p>Identität <code>{component.id}</code>. Änderungen gelten für alle Vorkommen dieser Komponente in allen Reitern.</p>
      <Field label="Komponentenname" value={name} onChange={setName}
        error={submitted && !updated.name ? 'Gib einen Komponentennamen ein.' : undefined} />
      {occurrenceLabel !== component.name && (
        <p>Dieses Vorkommen hat die eigene Beschriftung „{occurrenceLabel}“. Du kannst sie per Doppelklick im Baum ändern.</p>
      )}
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
  const savedMission = formatNumber(parameters.missionTimeHours)
  const savedInterval = formatNumber(parameters.testIntervalHours)
  const [mission, setMission] = useState(savedMission)
  const [interval, setInterval] = useState(savedInterval)
  const [submitted, setSubmitted] = useState(false)
  const updated = { missionTimeHours: parseNumber(mission), testIntervalHours: parseNumber(interval) }
  const issues = validateParameters(updated)
  const dirty = mission !== savedMission || interval !== savedInterval

  function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (issues.length) return
    onSave(updated)
    setMission(formatNumber(updated.missionTimeHours))
    setInterval(formatNumber(updated.testIntervalHours))
    setSubmitted(false)
  }

  return (
    <form className="ft-parameters" aria-label="Projektparameter" onSubmit={submit}>
      <h3>Projektparameter</h3>
      <p>Diese Werte gelten für das gesamte Projekt. Gib Stunden ohne Tausendertrennzeichen ein, zum Beispiel 8760.</p>
      <Field label="Missionsdauer t (h)" value={mission} onChange={setMission}
        error={submitted && issues.some((issue) => issue.code === 'INVALID_MISSION_TIME') ? numberError : undefined} />
      <Field label="Prüfintervall τ (h)" value={interval} onChange={setInterval}
        error={submitted && issues.some((issue) => issue.code === 'INVALID_TEST_INTERVAL') ? numberError : undefined} />
      <Actions dirty={dirty} onCancel={() => {
        setMission(savedMission)
        setInterval(savedInterval)
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
