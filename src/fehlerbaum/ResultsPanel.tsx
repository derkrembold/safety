import { useState } from 'react'
import type { Project } from '../core'
import { appLogger } from '../debug/appLogger'
import { calculateResults, formatValue, resultsKey, silBand, type Results, type Value } from './results'
import './ResultsPanel.css'

function NumberValue({ result }: { result: Value }) {
  return result.error !== undefined ? <span className="result-error">{result.error}</span> : <span>{formatValue(result.value)}</span>
}
export function ResultsPanel({ project }: { project: Project }) {
  const [collapsed, setCollapsed] = useState(false)
  const [height, setHeight] = useState(300)
  const [snapshot, setSnapshot] = useState<{ key: string; at: string; modified: string; t: number; tau: number; data: Results }>()
  const [error, setError] = useState<string>()
  const key = resultsKey(project)
  const stale = snapshot !== undefined && snapshot.key !== key
  const data = snapshot?.data
  function calculate() {
    const context = { componentIds: [...new Set(Object.values(project.diagrams.fehlerbaum?.nodes ?? {}).flatMap(n => n.componentRef ? [n.componentRef] : []))], details: { modelKey: key, parameters: project.parameters } }
    appLogger.logAction('fault-tree-calculation-requested', context)
    try {
      const results = calculateResults(project)
      setSnapshot({key, at: new Date().toISOString(), modified: project.modifiedAt, t: project.parameters.missionTimeHours, tau: project.parameters.testIntervalHours, data: results})
      setError(undefined)
      appLogger.logAction('fault-tree-calculated', context)
      const failures = [results.reliability, results.failure, results.availability, results.unavailability, results.pfd].flatMap(v => v.error ? [v.error] : [])
      if (results.cutSetError) failures.push(results.cutSetError)
      if (failures.length) appLogger.logError('fault-tree-calculation-partial', new Error([...new Set(failures)].join('\n')), context)
    } catch (e) {
      setSnapshot(undefined); setError(e instanceof Error ? e.message : String(e))
      appLogger.logError('fault-tree-calculation-failed', e, context)
    }
  }
  return <section className="results-panel" aria-label="Ergebnisbereich">
    <div className="results-toolbar">
      <button type="button" aria-expanded={!collapsed} aria-controls="results-body" onClick={() => setCollapsed(!collapsed)}>Ergebnisse {collapsed ? 'aufklappen' : 'einklappen'}</button>
      <button type="button" onClick={() => { setCollapsed(false); calculate() }}>{stale ? 'Neu berechnen' : 'Berechnen'}</button>
      <span role="status">{stale ? 'Veraltet – Modell oder Parameter geändert.' : snapshot ? 'Berechnet für den angezeigten Modellstand.' : 'Noch keine Berechnung.'}</span>
    </div>
    {!collapsed && <label className="results-height">Höhe Ergebnisbereich <input type="range" min="130" max="600" step="10" value={height} onChange={e => setHeight(Number(e.target.value))} /> {height} px</label>}
    {!collapsed && <div id="results-body" className="results-body" style={{height}}>
      {error && <p role="alert">{error}</p>}
      {!snapshot && !error && <p>„Berechnen“ ermittelt Systemwerte und minimale Ausfallkombinationen aus dem aktuellen Fehlerbaum.</p>}
      {snapshot && data && <>
        <p className="result-context">{stale ? 'Veralteter Berechnungsstand' : 'Berechnungsstand'}: {snapshot.modified}<br />Berechnet: {snapshot.at} · Missionsdauer t = {snapshot.t} h · Prüfintervall τ = {snapshot.tau} h</p>
        <div className="result-values">
          <section><h3>Systemwerte zur Missionsdauer</h3><dl><dt>Zuverlässigkeit R(t)</dt><dd><NumberValue result={data.reliability} /></dd><dt>Ausfallwahrscheinlichkeit F(t)</dt><dd><NumberValue result={data.failure} /></dd></dl></section>
          <section><h3>Stationäre Systemwerte</h3><dl><dt>Verfügbarkeit A</dt><dd><NumberValue result={data.availability} /></dd><dt>Nichtverfügbarkeit U = 1 − A</dt><dd><NumberValue result={data.unavailability} /></dd></dl></section>
          <section><h3>Rechnerische SIL-Einordnung</h3><dl><dt>System-PFDavg zum Prüfintervall τ</dt><dd><NumberValue result={data.pfd} /></dd><dt>Low-Demand-PFDavg-Band</dt><dd>{data.pfd.value !== undefined ? silBand(data.pfd.value) : 'Nicht berechenbar'}</dd></dl></section>
        </div>
        <p>Rechnerische Einordnung unter den Modellannahmen, kein vollständiger SIL-Nachweis. Unabhängige Komponenten, konstante Raten, λ_DU = λ sowie synchrone, perfekte Prüfungen; q(t) ≈ λ · t.</p>
        {data.warnings.map(w => <p className="result-error" key={w}>{w}</p>)}
        <section><h3>Minimal Cut Sets (MCS)</h3>{data.cutSetError ? <p role="alert">{data.cutSetError}</p> : <ul className="mcs-list" aria-label="Minimale Ausfallkombinationen">{data.cutSets.map((set,i) => <li key={i}>{set.map(id => { const c = data.components.find(row => row.component.id === id)!.component; return `${c.name} (${id})` }).join(' + ') || 'TOP tritt ohne Komponentenausfall ein.'}</li>)}</ul>}</section>
        <details><summary>Eingangsereignisse ({data.components.length} Identitäten)</summary><div className="component-table-scroll"><table><caption>Komponentenwerte zum oben angegebenen Berechnungsstand{stale ? ' – veraltet' : ''}</caption><thead><tr>{['Komponente / Identität','λ [1/h]','μ [1/h]','R(t)','F(t)','A','U'].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{data.components.map(row => <tr key={row.component.id}><th scope="row">{row.component.name}<br /><small>{row.component.id}</small></th><td>{formatValue(row.component.failureRate)}</td><td>{row.component.repairRate === undefined ? 'Nicht angegeben' : formatValue(row.component.repairRate)}</td><td><NumberValue result={row.reliability}/></td><td><NumberValue result={row.failure}/></td><td><NumberValue result={row.availability}/></td><td><NumberValue result={row.unavailability}/></td></tr>)}</tbody></table></div></details>
      </>}
    </div>}
  </section>
}
