import { FehlerbaumEditor } from '../fehlerbaum/FehlerbaumEditor'
import type { ComponentProps } from 'react'
import { ResultsPanel } from '../fehlerbaum/ResultsPanel'

export function FehlerbaumanalyseTab(props: ComponentProps<typeof FehlerbaumEditor>) {
  return <FehlerbaumEditor {...props} results={props.project ? <ResultsPanel project={props.project} /> : undefined} />
}
