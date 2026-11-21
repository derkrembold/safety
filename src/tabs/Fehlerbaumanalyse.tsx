import { useCallback, useState } from 'react'
import type { ComponentProps } from 'react'
import { FehlerbaumEditor } from '../fehlerbaum/FehlerbaumEditor'
import { ResultsPanel } from '../fehlerbaum/ResultsPanel'
import type { Results } from '../fehlerbaum/results'

export function FehlerbaumanalyseTab(props: ComponentProps<typeof FehlerbaumEditor>) {
  // Lifted out of ResultsPanel so the canvas's Zwischenwert-Sonden (#45) can show the
  // same calculated values and the same Veraltet-Markierung as the Ergebnisbereich,
  // without each probe running its own, separate calculation.
  const [probeState, setProbeState] = useState<{ probes: Results['probes'] | undefined; stale: boolean }>({ probes: undefined, stale: false })
  // Stable identity: ResultsPanel's reporting effect depends on this callback, so a new
  // function on every render would re-fire the effect every render, which updates this
  // state, which re-renders this component, which creates a new callback — an infinite
  // loop. The bail-out inside also skips a state update when nothing actually changed.
  const handleResults = useCallback((probes: Results['probes'] | undefined, stale: boolean) => {
    setProbeState((previous) => (previous.probes === probes && previous.stale === stale ? previous : { probes, stale }))
  }, [])
  return <FehlerbaumEditor {...props}
    probes={probeState.probes} probesStale={probeState.stale}
    results={props.project
      ? <ResultsPanel project={props.project} onResults={handleResults} />
      : undefined} />
}
